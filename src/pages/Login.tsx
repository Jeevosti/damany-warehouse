import {useState} from 'react';
import {ArrowRight, ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, LoaderCircle, ShieldCheck, Sun, CheckCircle2, Settings2} from 'lucide-react';
import {Brand, Button, Field, Input, FormError} from '../components/ui';
import {supabase, storedConnection, saveConnection} from '../services/supabase';
import {authMessage, signIn, requestPasswordReset, changePassword} from '../services/auth';
import type {AuthState} from '../services/auth';

type Props = {auth: AuthState; reconnect: () => void; passwordUpdated: () => void; cancelRecovery: () => Promise<void>};

export function Login({auth, reconnect, passwordUpdated, cancelRecovery}: Props) {
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [settings, setSettings] = useState(false);
  const [url, setUrl] = useState(() => storedConnection()?.url || '');
  const [key, setKey] = useState('');
  const recovery = auth.recovery;
  const pending = busy || auth.loading;
  const title = recovery ? 'Choose a new password' : view === 'forgot' ? 'Forgot your password?' : 'Welcome back.';
  const description = recovery ? 'Create a strong password to protect your company account.' : view === 'forgot' ? 'Enter your account email and we’ll send you a link to reset your password.' : 'Sign in to keep your solar business moving.';
  const switchView = (next: 'login' | 'forgot') => {setView(next); setError(''); setMessage(''); setPassword(''); setConfirmation('');};

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const client = supabase();
      if (!client) throw new Error('The company connection has not been configured yet. Contact your administrator.');
      if (recovery) {
        await changePassword(client, password, confirmation);
        setPassword(''); setConfirmation(''); passwordUpdated();
      } else if (view === 'forgot') {
        await requestPasswordReset(client, email, window.location.origin);
        setMessage('If an account exists for this email, a reset link will arrive shortly. Check your inbox and spam folder.');
      } else {
        await signIn(client, email, password);
        setPassword('');
      }
    } catch (err) {setError(authMessage(err));} finally {setBusy(false);}
  }

  return <div className="login-shell">
    <section className="login-story" aria-label="Solara solar company management">
      <Brand/>
      <div className="login-story-copy"><span className="login-kicker"><i/> SOLAR COMPANY MANAGEMENT</span><h1>Your solar business.<br/><span>All in one place.</span></h1><p>From the first installation to the next service call. Bring your clients, stock, and warranties together.</p></div>
      <div className="login-solar-art" aria-hidden="true"><div className="login-orbit orbit-one"/><div className="login-orbit orbit-two"/><div className="login-sun"><Sun size={40} strokeWidth={1.3}/></div><div className="login-panel-grid">{Array.from({length:12}, (_, index) => <span key={index}/>)}</div><div className="login-energy-line"/></div>
      <div className="login-story-footer"><span><ShieldCheck size={17}/>Your business, connected.</span><span>POWERED BY GOOD ENERGY</span></div>
    </section>
    <main className="login-main">
      <div className="login-mobile-brand"><Brand/></div>
      <div className="login-card">
        <div className="login-icon"><LockKeyhole size={23}/></div>
        <div className="login-card-heading"><span className="login-kicker">YOUR COMPANY ACCOUNT</span><h2>{title}</h2><p>{description}</p></div>
        <FormError message={error || auth.error}/>
        {message && <div className="login-success" role="status"><CheckCircle2 size={19}/><p>{message}</p></div>}
        {auth.loading && <p className="login-checking" role="status"><LoaderCircle size={15} className="spin"/>Checking your session…</p>}
        <form className="login-form" onSubmit={submit} aria-busy={pending}>
          {!recovery && <div className="login-field"><label htmlFor="login-email">Email address</label><div className="login-input-wrap"><Mail size={18}/><input id="login-email" name="email" type="email" required autoComplete="username" placeholder="you@company.com" value={email} disabled={pending} onChange={e => setEmail(e.target.value)}/></div></div>}
          {(recovery || view === 'login') && <>
            <div className="login-field"><div className="login-field-label"><label htmlFor="login-password">{recovery ? 'New password' : 'Password'}</label>{!recovery && <button type="button" disabled={pending} onClick={() => switchView('forgot')}>Forgot password?</button>}</div><div className="login-input-wrap"><LockKeyhole size={18}/><input id="login-password" name="password" type={showPassword ? 'text' : 'password'} required minLength={recovery ? 12 : undefined} autoComplete={recovery ? 'new-password' : 'current-password'} placeholder={recovery ? 'At least 12 characters' : 'Enter your password'} value={password} disabled={pending} onChange={e => setPassword(e.target.value)}/><button type="button" className="login-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>
            {recovery && <div className="login-field"><label htmlFor="login-confirmation">Confirm new password</label><div className="login-input-wrap"><LockKeyhole size={18}/><input id="login-confirmation" name="confirmation" type={showPassword ? 'text' : 'password'} required minLength={12} autoComplete="new-password" placeholder="Enter your new password again" value={confirmation} disabled={pending} onChange={e => setConfirmation(e.target.value)}/></div></div>}
          </>}
          <Button className="login-submit" disabled={pending}>{pending ? <><LoaderCircle size={18} className="spin"/>{auth.loading ? 'Checking session…' : 'Please wait…'}</> : <>{recovery ? 'Save new password' : view === 'forgot' ? 'Send reset link' : 'Sign in'}<ArrowRight size={18}/></>}</Button>
        </form>
        {(view === 'forgot' || recovery) && <button className="login-back" type="button" disabled={pending} onClick={async () => {if (recovery) {setBusy(true); try {await cancelRecovery();} catch (err) {setError(authMessage(err));} finally {setBusy(false);}} switchView('login');}}><ArrowLeft size={15}/>Back to sign in</button>}
        <div className="login-account-help"><ShieldCheck size={18}/><p>Need an account? <strong>Ask your company administrator.</strong><br/>Use the email and password created for this application.</p></div>
        {!recovery && <div className="login-connection"><button className="login-connection-toggle" type="button" aria-expanded={settings} onClick={() => setSettings(value => !value)}><Settings2 size={14}/>Connection settings</button>{settings && <form className="login-connection-form" onSubmit={event => {event.preventDefault();setError('');try {saveConnection({url:url.trim().replace(/\/$/, ''), key:key.trim()});setSettings(false);setKey('');setMessage('Connection saved. Sign in with an account from this project.');reconnect();} catch (err) {setError(authMessage(err));}}}><p>Administrator setup for this browser. Enter the project URL and public key supplied for your deployment.</p><Field label="Supabase project URL"><Input type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-project.supabase.co"/></Field><Field label="Publishable key" hint="Use a publishable or legacy anon key. Never use a secret or service-role key."><Input required type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="sb_publishable_…"/></Field><Button type="submit" variant="secondary" disabled={pending}>Save connection</Button></form>}</div>}
      </div>
      <footer className="login-footer"><span>© {new Date().getFullYear()} Solara</span><span>Solar operations, simplified.</span></footer>
    </main>
  </div>;
}
