import {useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import type {Session} from '@supabase/supabase-js';
import {useQueryClient} from '@tanstack/react-query';
import {Login} from '../pages/Login';
import {supabase, clearStoredAuth} from '../services/supabase';
import {observeAuth, readAuthRedirect, authMessage, endSession} from '../services/auth';
import type {AuthState} from '../services/auth';
import {getSessionActivity, watchSessionActivity, IDLE_MESSAGE} from '../services/sessionActivity';

type Controls = {session: Session; reconnect: () => void; signOut: () => Promise<void>};
export function AuthGate({children}: {children: (controls: Controls) => ReactNode}) {
  const cache = useQueryClient();
  const [activity] = useState(getSessionActivity);
  const [revision, setRevision] = useState(0);
  const [redirect] = useState(() => {
    const state = readAuthRedirect(window.location.href);
    if (state.recovery) {
      // Keep the password screen after a refresh, but leave tokens for Supabase to consume.
      const url = new URL(window.location.href); url.searchParams.set('auth', 'recovery');
      window.history.replaceState({}, '', url);
    }
    return state;
  });
  const [auth, setAuth] = useState<AuthState>({session:null, loading:true, recovery:false, error:''});
  useEffect(() => {
    setAuth({session:null, loading:true, recovery:false, error:''});
    try {
      const client = supabase();
      if (!client) {setAuth({session:null, loading:false, recovery:false, error:'The company connection has not been configured yet. Contact your administrator.'}); return;}
      return observeAuth(client, redirect, setAuth, () => cache.clear(), activity);
    } catch (error) {setAuth({session:null, loading:false, recovery:false, error:authMessage(error)});}
  }, [revision, cache, redirect, activity]);
  const clearRedirect = () => {
    const url = new URL(window.location.href);
    ['auth', 'type', 'error', 'error_code', 'error_description', 'code'].forEach(key => url.searchParams.delete(key));
    url.hash = '';
    window.history.replaceState({}, '', url);
    redirect.recovery = false; redirect.error = ''; redirect.fresh = false;
  };
  const reconnect = () => {cache.clear();setAuth({session:null, loading:true, recovery:false, error:''});setRevision(value => value + 1);};
  const signOut = async (message = '') => {
    clearRedirect();
    await endSession(supabase(), activity, () => {
      cache.clear();
      setAuth({session:null, loading:true, recovery:false, error:message});
    }, clearStoredAuth);
    setAuth({session:null, loading:false, recovery:false, error:message});
  };
  useEffect(() => {
    if (!auth.session || !activity) return;
    const session = auth.session;
    return watchSessionActivity(activity, session, () => {
      if (activity.belongsTo(session)) void signOut(IDLE_MESSAGE);
      else {cache.clear(); setAuth({session:null, loading:false, recovery:false, error:'Please sign in again.'});}
    });
  }, [auth.session, activity, cache]);
  if (auth.loading || !auth.session || auth.recovery) return <Login auth={auth} reconnect={reconnect} cancelRecovery={signOut} passwordUpdated={() => {clearRedirect();reconnect();}}/>;
  return children({session:auth.session, reconnect, signOut});
}
