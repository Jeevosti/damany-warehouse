import {useState} from 'react';
import {LogOut, Monitor, Moon, Sun, UserRound} from 'lucide-react';
import {Badge, Button, FormError, PageHead} from '../components/ui';
import {errorMessage} from '../services/api';

type Props = {theme: string; setTheme: (theme: string) => void; email?: string; role: 'admin' | 'viewer'; signOut: () => Promise<void>};
export function Settings({theme, setTheme, email, role, signOut}: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <><PageHead eyebrow="YOUR WORKSPACE" title="Settings" description="Your account and display preferences."/>
    <div className="settings-grid">
      <section className="panel settings-panel"><h2><UserRound size={19}/>Account</h2>
        <dl className="damany-account-details"><div><dt>Email address</dt><dd>{email || 'Company account'}</dd></div><div><dt>Access</dt><dd><Badge tone={role === 'admin' ? 'green' : 'neutral'}>{role === 'admin' ? 'Administrator' : 'Viewer · read only'}</Badge></dd></div></dl>
        <p className="muted">{role === 'admin' ? 'You can manage warehouse and customer records.' : 'You can view records, reports and saved quotations.'}</p>
        <FormError message={error}/><Button variant="secondary" disabled={busy} onClick={async () => {setBusy(true); setError(''); try {await signOut();} catch (value) {setError(errorMessage(value));} finally {setBusy(false);}}}><LogOut size={16}/>Sign out</Button>
      </section>
      <section className="panel settings-panel"><h2>Appearance</h2><p className="muted">Choose a display mode. The sun button beside your profile switches between light and dark.</p>
        <div className="theme-options">{([{value: 'light', label: 'Light', Icon: Sun}, {value: 'dark', label: 'Dark', Icon: Moon}, {value: 'system', label: 'System', Icon: Monitor}]).map(({value, label, Icon}) => <button key={value} className={theme === value ? 'selected' : ''} aria-pressed={theme === value} onClick={() => setTheme(value)}><Icon size={23}/><span>{label}</span></button>)}</div>
      </section>
    </div>
  </>;
}
