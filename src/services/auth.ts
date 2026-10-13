import type {AuthChangeEvent, Session, SupabaseClient} from '@supabase/supabase-js';

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

export async function signIn(client: SupabaseClient, email: string, password: string) {
  const result = await client.auth.signInWithPassword({email: email.trim(), password});
  if (result.error) throw result.error;
  if (!result.data.session) throw new Error('Sign-in did not complete. Please try again.');
  return result.data.session;
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
  initial: {recovery: boolean; error: string},
  publish: (state: AuthState) => void,
  clearPrivateData: () => void,
) {
  let active = true;
  let revision = 0;
  let recovery = initial.recovery;
  let previousUser: string | undefined;
  const emit = (session: Session | null, error = '') => {
    if (!active) return;
    if (!session || previousUser !== session.user.id) clearPrivateData();
    previousUser = session?.user.id;
    publish({session, loading: false, recovery: !!session && recovery, error});
  };
  const {data: {subscription}} = client.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
    if (!active || event === 'INITIAL_SESSION') return;
    revision++;
    if (event === 'PASSWORD_RECOVERY') recovery = true;
    if (event === 'SIGNED_OUT') recovery = false;
    emit(session);
  });
  const initialRevision = revision;
  void client.auth.getSession().then(async ({data, error}) => {
    if (error) throw error;
    if (!active || revision !== initialRevision) return;
    if (data.session) {
      // Verify restored sessions with Auth before mounting the private application.
      const checked = await client.auth.getUser();
      if (checked.error) throw checked.error;
      if (!checked.data.user || checked.data.user.id !== data.session.user.id) throw new Error('Your session has expired. Please sign in again.');
    }
    if (active && revision === initialRevision) emit(data.session, initial.error);
  }).catch(error => {
    if (active && revision === initialRevision) emit(null, authMessage(error));
  });
  return () => {active = false; subscription.unsubscribe();};
}
