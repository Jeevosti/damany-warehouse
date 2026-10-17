// Add exactly this import to src/main.tsx: import './damany-addons';
// This entry creates its own dock. It does not replace App.tsx or its navigation.
import {createRoot} from 'react-dom/client';
import {useEffect, useRef, useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {QueryClient, QueryClientProvider, useQuery} from '@tanstack/react-query';
import {BarChart3, Calculator, ChevronLeft, LogOut, Package, Settings2, ShieldCheck, X} from 'lucide-react';
import {supabase, storedConnection} from '../services/supabase';
import {Button, FormError, Loading} from '../components/ui';
import type {Snapshot} from '../lib/types';
import {warehouseApi} from './warehouseApi';
import {warehouseError} from './warehouse';
import {Warehouse} from './Warehouse';
import {Reports} from './Reports';
import {Team} from './Team';
import {Quotations} from './Quotations';
import './styles.css';

const cache = new QueryClient({defaultOptions: {queries: {staleTime: 15000, retry: 1}}});
function AddonAuthentication() {
  const [session, setSession] = useState<Session | null>(null), [generation, setGeneration] = useState(0);
  useEffect(() => {
    let active = true, fingerprint = '', unsubscribe: (() => void) | undefined;
    const connect = () => {
      try {
        const next = JSON.stringify(storedConnection()); if (next === fingerprint) return;
        fingerprint = next; unsubscribe?.(); cache.clear(); setSession(null); setGeneration(value => value + 1);
        const client = supabase(); if (!client) return;
        const currentFingerprint = fingerprint; let epoch = 0; let lastUser = '';
        const deliver = (nextSession: Session | null) => {if (lastUser !== (nextSession?.user.id || '')) cache.clear(); lastUser = nextSession?.user.id || ''; setSession(nextSession);};
        const {data} = client.auth.onAuthStateChange((_event, nextSession) => {if (active && currentFingerprint === fingerprint) {epoch++; deliver(nextSession);}});
        unsubscribe = () => data.subscription.unsubscribe();
        const readEpoch = epoch;
        void client.auth.getSession().then(result => {if (active && currentFingerprint === fingerprint && epoch === readEpoch) deliver(result.data.session);}).catch(() => {if (active && epoch === readEpoch) setSession(null);});
      } catch {setSession(null);}
    };
    connect(); const timer = window.setInterval(connect, 2000);
    return () => {active = false; window.clearInterval(timer); unsubscribe?.();};
  }, []);
  if (!session || new URLSearchParams(location.search).get('auth') === 'recovery') return null;
  return <Tools key={`${generation}:${session.user.id}`} session={session}/>;
}

function Tools({session}: {session: Session}) {
  const [open, setOpen] = useState(false), [page, setPage] = useState<'warehouse' | 'reports' | 'quotations' | 'team'>('warehouse'), [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const dirty = useRef(false), previousAccess = useRef('');
  const access = useQuery({queryKey: ['damany-access', session.user.id], queryFn: warehouseApi.access, refetchInterval: 15000});
  const ownerId = access.data?.owner_id || '', canEdit = access.data?.role === 'admin';
  const workspace = useQuery({queryKey: ['damany-workspace', ownerId], queryFn: warehouseApi.workspace, enabled: open && !!ownerId, refetchInterval: open ? 60000 : false});
  const locations = useQuery({queryKey: ['damany-locations', ownerId], queryFn: warehouseApi.locations, enabled: open && !!ownerId});
  useEffect(() => {if (!access.data) return; const next = `${access.data.owner_id}:${access.data.role}`; if (previousAccess.current && previousAccess.current !== next) {window.location.reload(); return;} previousAccess.current = next;}, [access.data]);
  useEffect(() => {if (!open) return; const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => {document.body.style.overflow = previous;};}, [open]);
  const close = () => {if (dirty.current) window.location.reload(); else setOpen(false);};
  const refresh = async () => {await Promise.all([workspace.refetch({throwOnError: true}), locations.refetch({throwOnError: true})]); await cache.invalidateQueries({queryKey: ['damany-report']});};
  return <>
    {!open && <button className="dw-launcher" onClick={() => setOpen(true)}><Package size={21}/><span>Damany tools<small>{access.data?.role === 'viewer' ? 'Viewer access' : 'Live warehouse · Quotes · Reports'}</small></span></button>}
    {open && <section className="dw-overlay" aria-label="Damany business tools"><aside className="dw-sidebar"><div className="dw-logo"><span>D</span><strong>Damany<small>BUSINESS TOOLS</small></strong></div><button className="dw-back" onClick={close}><ChevronLeft size={16}/>Back to your workspace</button><nav aria-label="Business tools">{([
      ['warehouse', Package, 'Warehouse'], ['quotations', Calculator, 'Quotations'], ['reports', BarChart3, 'Reports'], ['team', ShieldCheck, 'Team & roles'],
    ] as const).filter(([id]) => id !== 'team' || canEdit).map(([id, Icon, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => {setPage(id); setQuery('');}}><Icon size={19}/>{label}</button>)}</nav><div className="dw-profile"><strong>{access.data?.role === 'viewer' ? 'Viewer · read only' : access.data ? 'Admin' : 'Checking access…'}</strong><span>{session.user.email}</span><Button variant="secondary" onClick={async () => {await supabase()?.auth.signOut({scope: 'local'}); cache.clear();}}><LogOut size={15}/>Sign out</Button></div></aside>
      <div className="dw-main"><header className="dw-topbar"><div><Settings2 size={18}/><span className="dw-live">Live workspace</span><span>{page === 'team' ? 'Team & roles' : page[0].toUpperCase() + page.slice(1)}</span></div><button className="dw-close" onClick={close} aria-label="Close business tools"><X size={21}/></button></header><main className="dw-content">
        {access.data?.role === 'viewer' && <div className="dw-notice">You have viewer access. You can read records and reports; business data can only be changed by an admin.</div>}
        {access.isPending ? <Loading/> : access.error ? <div className="panel dw-panel"><h2>Set up the business tools</h2><FormError message={warehouseError(access.error)}/><p className="dw-help">Your existing site is available using “Back to your workspace”. Apply the add-on SQL files from START-HERE before using these tools.</p><Button onClick={() => access.refetch()}>Check again</Button></div> : workspace.isPending || locations.isPending ? <Loading/> : workspace.error || locations.error ? <div className="panel dw-panel"><FormError message={warehouseError(workspace.error || locations.error)}/><Button onClick={refresh}>Try again</Button></div> : workspace.data && locations.data ? <>
          {page === 'warehouse' && <Warehouse data={workspace.data} locations={locations.data} canEdit={canEdit} refresh={refresh} dirty={() => {dirty.current = true;}}/>}
          {page === 'reports' && <Reports locations={locations.data} ownerId={ownerId}/>}
          {page === 'team' && canEdit && <Team ownerId={ownerId} userId={session.user.id}/>}
          {page === 'quotations' && <Quotations data={workspace.data as Snapshot} mode="live" userId={session.user.id} canEdit={canEdit} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} navigate={() => {}} open={() => {}}/>}
        </> : null}
      </main></div>
    </section>}
  </>;
}

const rootId = 'damany-tools-root';
if (typeof document !== 'undefined' && !document.getElementById(rootId)) {
  const element = document.createElement('div'); element.id = rootId; document.body.appendChild(element);
  const root = createRoot(element); root.render(<QueryClientProvider client={cache}><AddonAuthentication/></QueryClientProvider>);
  const hot = (import.meta as ImportMeta & {hot?: {dispose: (callback: () => void) => void}}).hot;
  hot?.dispose(() => {root.unmount(); element.remove(); cache.clear();});
}
