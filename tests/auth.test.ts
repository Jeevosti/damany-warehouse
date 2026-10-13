import {describe, it, expect, vi} from 'vitest';
import type {AuthChangeEvent, Session, SupabaseClient} from '@supabase/supabase-js';
import {observeAuth, signIn, requestPasswordReset, changePassword, readAuthRedirect, passwordProblem} from '../src/services/auth';

const session = (id='account-a') => ({user:{id, email:`${id}@example.test`}, access_token:'test-token'}) as Session;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function mockClient() {
  let handler: (event:AuthChangeEvent, value:Session|null) => void = () => {};
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn().mockResolvedValue({data:{session:null}, error:null}),
    getUser: vi.fn().mockResolvedValue({data:{user:session().user}, error:null}),
    onAuthStateChange: vi.fn((callback:typeof handler) => {handler = callback;return {data:{subscription:{unsubscribe}}};}),
    signInWithPassword: vi.fn().mockResolvedValue({data:{session:session()}, error:null}),
    resetPasswordForEmail: vi.fn().mockResolvedValue({error:null}),
    updateUser: vi.fn().mockResolvedValue({error:null}),
  };
  return {client:{auth} as unknown as SupabaseClient, auth, unsubscribe, emit:(event:AuthChangeEvent, value:Session|null) => handler(event,value)};
}
const normal = {recovery:false, error:''};

describe('authentication boundary', () => {
  it('keeps visitors without a session outside the workspace', async () => {
    const mock = mockClient(), publish=vi.fn(), clear=vi.fn();
    const stop=observeAuth(mock.client, normal, publish, clear);
    await flush();
    expect(publish).toHaveBeenLastCalledWith({session:null,loading:false,recovery:false,error:''});
    expect(clear).toHaveBeenCalled(); stop();
  });
  it('verifies restored sessions against Auth before granting access', async () => {
    const mock=mockClient(), publish=vi.fn();
    mock.auth.getSession.mockResolvedValue({data:{session:session()},error:null});
    const stop=observeAuth(mock.client,normal,publish,vi.fn());
    await flush(); expect(mock.auth.getUser).toHaveBeenCalledOnce();
    expect(publish.mock.lastCall?.[0].session.user.id).toBe('account-a'); stop();
  });
  it('rejects revoked stored sessions without exposing a workspace', async () => {
    const mock=mockClient(), publish=vi.fn();
    mock.auth.getSession.mockResolvedValue({data:{session:session()},error:null});
    mock.auth.getUser.mockResolvedValue({data:{user:null},error:{message:'Session expired'}});
    const stop=observeAuth(mock.client,normal,publish,vi.fn());
    await flush(); expect(publish.mock.lastCall?.[0].session).toBeNull();
    expect(publish.mock.lastCall?.[0].error).toBe('Session expired'); stop();
  });
  it('does not let a late session restore undo logout', async () => {
    const mock=mockClient(), publish=vi.fn(), clear=vi.fn();
    let resolveRestore:(value:unknown)=>void=()=>{};
    mock.auth.getSession.mockReturnValue(new Promise(resolve=>{resolveRestore=resolve;}));
    const stop=observeAuth(mock.client,normal,publish,clear);
    mock.emit('SIGNED_OUT',null);
    resolveRestore({data:{session:session()},error:null}); await flush();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.lastCall?.[0].session).toBeNull(); expect(clear).toHaveBeenCalled(); stop();
  });
  it('clears private query data when switching accounts and signing out', async () => {
    const mock=mockClient(), clear=vi.fn();
    const stop=observeAuth(mock.client,normal,vi.fn(),clear);await flush();clear.mockClear();
    mock.emit('SIGNED_IN',session());mock.emit('TOKEN_REFRESHED',session());
    mock.emit('SIGNED_IN',session('account-b'));mock.emit('SIGNED_OUT',null);
    expect(clear).toHaveBeenCalledTimes(3);stop();
  });
  it('keeps recovery sessions on the password screen through token refresh', async () => {
    const mock=mockClient(), publish=vi.fn();
    const stop=observeAuth(mock.client,normal,publish,vi.fn());await flush();
    mock.emit('PASSWORD_RECOVERY',session());mock.emit('TOKEN_REFRESHED',session());
    expect(publish.mock.lastCall?.[0].recovery).toBe(true);
    mock.emit('SIGNED_OUT',null);expect(publish.mock.lastCall?.[0].recovery).toBe(false);stop();
  });
  it('unsubscribes and ignores late events after connection changes', async () => {
    const mock=mockClient(), publish=vi.fn();const stop=observeAuth(mock.client,normal,publish,vi.fn());
    stop();mock.emit('SIGNED_IN',session());await flush();
    expect(publish).not.toHaveBeenCalled();expect(mock.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('login and password recovery', () => {
  it('trims the email but preserves the exact password', async () => {
    const {client,auth}=mockClient();await signIn(client,' user@example.test ',' password with spaces ');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({email:'user@example.test',password:' password with spaces '});
  });
  it('propagates invalid credentials instead of granting access', async () => {
    const {client,auth}=mockClient();auth.signInWithPassword.mockResolvedValue({data:{session:null},error:{message:'Invalid credentials'}});
    await expect(signIn(client,'user@example.test','wrong')).rejects.toMatchObject({message:'Invalid credentials'});
  });
  it('sends recovery links only to the current deployment', async () => {
    const {client,auth}=mockClient();await requestPasswordReset(client,' user@example.test ','https://solar.example.test');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.test',{redirectTo:'https://solar.example.test/?auth=recovery'});
  });
  it('validates passwords before updating the account and surfaces server errors', async () => {
    const {client,auth}=mockClient();await expect(changePassword(client,'short','short')).rejects.toThrow('12 characters');
    expect(passwordProblem('a-long-password','different-password')).toBe('The passwords do not match.');
    expect(auth.updateUser).not.toHaveBeenCalled();
    auth.updateUser.mockResolvedValue({error:{message:'Weak password'}});
    await expect(changePassword(client,'long-enough-password','long-enough-password')).rejects.toMatchObject({message:'Weak password'});
  });
  it('handles password and invite links without reflecting token or error contents', () => {
    expect(readAuthRedirect('https://example.test/?auth=recovery').recovery).toBe(true);
    expect(readAuthRedirect('https://example.test/#type=invite&access_token=private').recovery).toBe(true);
    expect(readAuthRedirect('https://example.test/#error=access_denied&error_description=private')).toEqual({recovery:false,error:'This sign-in link is invalid or has expired. Request a new password reset link.'});
  });
});
