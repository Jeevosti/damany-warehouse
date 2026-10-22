import type {AuthChangeEvent, Session, SupabaseClient} from '@supabase/supabase-js';
import {getSessionActivity, IDLE_MESSAGE} from './sessionActivity';
import type {SessionActivity} from './sessionActivity';

const passwordLogins = new WeakSet<SupabaseClient>();

export type AuthState = {
  session: Session | null;
  loading: boolean;
  recovery: boolean;
  error: string;
};

export function authMessage(error: unknown): string {
  const value = error as {code?: string; message?: string; status?: number};
  if (value?.code === 'invalid_credentials') return 'The email or password is incorrect. Please try again.';
  if (value?.code === 'email_not_confirmed') return 'Please confirm your email before signing in.';
  if (value?.status === 429 || value?.code?.includes('rate_limit')) return 'Too many attempts. Please wait a moment and try again.';
  if (value?.message?.match(/fetch|network|connection/i)) return 'We could not connect. Check your internet connection and try again.';
  return value?.message || 'Something went wrong. Please try again.';
}

export function readAuthRedirect(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const type = hash.get('type') || url.searchParams.get('type');
  const failed = hash.has('error') || hash.has('error_code') || url.searchParams.has('error') || url.searchParams.has('error_code');
  return {
    recovery: !failed && (url.searchParams.get('auth') === 'recovery' || type === 'recovery' || type === 'invite'),
    error: failed ? 'This sign-in link is invalid or has expired. Request a new password reset link.' : '',
    ...(!failed && (type === 'invite' || type === 'recovery' || url.searchParams.get('auth') === 'recovery') && (hash.has('access_token') || url.searchParams.has('code')) ? {fresh:true} : {}),
  };
}

export function passwordResetUrl(origin: string) {
  // Always return to this deployment; never use a caller-supplied redirect URL.
  return new URL('/?auth=recovery', origin).href;
}

export function passwordProblem(password: string, confirmation: string) {
  if (password.length < 12) return 'Use at least 12 characters for your new password.';
  if (password !== confirmation) return 'The passwords do not match.';
  return '';
}

export async function signIn(client: SupabaseClient, email: string, password: string, activity = getSessionActivity()) {
  passwordLogins.add(client);
  try {
    const result = await client.auth.signInWithPassword({email: email.trim(), password});
    if (result.error) throw result.error;
    if (!result.data.session) throw new Error('Sign-in did not complete. Please try again.');
    activity?.start(result.data.session);
    void client.auth.startAutoRefresh?.();
    return result.data.session;
  } finally {passwordLogins.delete(client);}
}

/** Lock the app first, even when the network cannot complete Supabase sign-out. */
export async function endSession(client: SupabaseClient | null, activity: SessionActivity | undefined,
  lock: () => void, clearStoredAuth: () => void) {
  activity?.end(); lock();
  try {
    if (client) {
      const {error} = await client.auth.signOut({scope:'local'});
      if (error) await client.auth.stopAutoRefresh();
    }
  } catch {if (client) await client.auth.stopAutoRefresh().catch(() => {});}
  finally {clearStoredAuth();}
}

export async function requestPasswordReset(client: SupabaseClient, email: string, origin: string) {
  const {error} = await client.auth.resetPasswordForEmail(email.trim(), {redirectTo: passwordResetUrl(origin)});
  if (error) throw error;
}

export async function changePassword(client: SupabaseClient, password: string, confirmation: string) {
  const problem = passwordProblem(password, confirmation);
  if (problem) throw new Error(problem);
  const {error} = await client.auth.updateUser({password});
  if (error) throw error;
}

/** Auth callbacks remain synchronous to avoid Supabase's auth-lock deadlocks. */
export function observeAuth(
  client: SupabaseClient,
  initial: {recovery: boolean; error: string; fresh?: boolean},
  publish: (state: AuthState) => void,
  clearPrivateData: () => void,
  activity?: SessionActivity,
) {
  let active = true;
  let revision = 0;
  let recovery = initial.recovery;
  let previousUser: string | undefined;
  const emit = (session: Session | null, error = '') => {
    if (!active) return;
    if (session && activity && !activity.remaining(session)) {error = activity.belongsTo(session) ? IDLE_MESSAGE : 'Please sign in again to continue.'; session = null;}
    if (!session || previousUser !== session.user.id) clearPrivateData();
    previousUser = session?.user.id;
    publish({session, loading: false, recovery: !!session && recovery, error});
  };
  const stopActivity = activity?.subscribe(session => {
    revision++;
    emit(session || null);
  });
  const {data: {subscription}} = client.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
    if (!active || event === 'INITIAL_SESSION') return;
    revision++;
    // SIGNED_IN can also be sent on tab refocus; only the completed password request
    // above establishes fresh activity. Never reset it on TOKEN_REFRESHED.
    if (activity && event === 'SIGNED_IN' && passwordLogins.has(client)) return;
    if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' && recovery && initial.fresh) {
      recovery = true; initial.fresh = false; if (session) activity?.start(session);
    }
    if (event === 'SIGNED_OUT') recovery = false;
    emit(session);
  });
  const initialRevision = revision;
  void client.auth.getSession().then(async ({data, error}) => {
    if (error) throw error;
    if (!active || revision !== initialRevision) return;
    if (data.session) {
      if (!initial.fresh && activity && !activity.remaining(data.session)) {emit(data.session); return;}
      // Verify restored sessions with Auth before mounting the private application.
      const checked = await client.auth.getUser();
      if (checked.error) throw checked.error;
      if (!checked.data.user || checked.data.user.id !== data.session.user.id) throw new Error('Your session has expired. Please sign in again.');
      if (!active || revision !== initialRevision) return;
      if (initial.fresh && recovery) {initial.fresh = false; activity?.start(data.session);}
    }
    if (active && revision === initialRevision) emit(data.session, initial.error);
  }).catch(error => {
    if (active && revision === initialRevision) emit(null, authMessage(error));
  });
  return () => {active = false; subscription.unsubscribe(); stopActivity?.();};
}
