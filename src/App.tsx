import {useEffect, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import type {Session} from '@supabase/supabase-js';
import {BarChart3, Bell, Calculator, CheckCircle2, ChevronRight, LayoutDashboard, LogOut, Menu, Package, ReceiptText, RefreshCw, Search, Settings as SettingsIcon, ShieldCheck, Sun, Users, X} from 'lucide-react';
import type {Snapshot, View} from './lib/types';
import {metrics} from './lib/selectors';
import {notifications} from './lib/notifications';
import {AuthGate} from './components/AuthGate';
import {Brand, Button, FormError, IconButton, Loading} from './components/ui';
import {AssignForm, ClientForm, EditSiteForm, RmaForm, SiteForm, StockForm} from './components/forms';
import type {ModalState} from './components/forms';
import {Details} from './components/Details';
import {Overview} from './pages/Overview';
import {Clients, Installations, Inventory, Warranties} from './pages/Records';
import {Invoices} from './pages/Invoices';
import {Notifications} from './pages/Notifications';
import {Settings} from './pages/Settings';
import {emptyData} from './services/demo';
import {errorMessage} from './services/api';
import {Quotations, Reports, Warehouse} from './damany-addons';
import {warehouseApi} from './damany-addons/warehouseApi';
import {warehouseError} from './damany-addons/warehouse';
import type {WarehouseAccess, WarehouseSnapshot} from './damany-addons/warehouse';

type WorkspaceView = View | 'quotations' | 'reports';
const nav = [
  {id: 'overview', label: 'Overview', Icon: LayoutDashboard},
  {id: 'clients', label: 'Clients', Icon: Users},
  {id: 'invoices', label: 'Credit invoices', Icon: ReceiptText},
  {id: 'quotations', label: 'Quotations', Icon: Calculator},
  {id: 'installations', label: 'Installations', Icon: Sun},
  {id: 'inventory', label: 'Inventory', Icon: Package},
  {id: 'reports', label: 'Reports', Icon: BarChart3},
  {id: 'warranties', label: 'Warranty tracker', Icon: ShieldCheck},
  {id: 'notifications', label: 'Notifications', Icon: Bell},
] as const;

export default function App() {
  return <AuthGate>{({session, signOut}) => <WorkspaceAccess key={session.user.id} session={session} signOut={signOut}/>}</AuthGate>;
}

function WorkspaceAccess({session, signOut}: {session: Session; signOut: () => Promise<void>}) {
  const cache = useQueryClient();
  const access = useQuery({queryKey: ['warehouse-access', session.user.id], queryFn: warehouseApi.access, refetchInterval: 15000, retry: 1});
  const [activeScope, setActiveScope] = useState(''), [error, setError] = useState('');
  const nextScope = access.data && !access.error ? `${session.user.id}:${access.data.owner_id}:${access.data.role}` : '';
  useEffect(() => {
    if (activeScope === nextScope) return;
    // A role/workspace change must not reuse records from the previous access scope.
    cache.removeQueries({predicate: query => query.queryKey[0] !== 'warehouse-access'});
    setActiveScope(nextScope);
  }, [activeScope, nextScope, cache]);
  if (access.error) return <div className="damany-access-screen"><Brand/><section className="panel"><h1>Workspace access unavailable</h1><FormError message={warehouseError(access.error)}/><p>Your company administrator manages access. If your role was just updated, try again.</p><FormError message={error}/><div className="damany-access-actions"><Button onClick={() => access.refetch()}><RefreshCw size={16}/>Try again</Button><Button variant="secondary" onClick={async () => {try {await signOut();} catch (value) {setError(errorMessage(value));}}}>Sign out</Button></div></section></div>;
  if (access.isPending || !access.data || nextScope !== activeScope) return <div className="damany-access-screen"><Brand/><Loading/></div>;
  return <WorkspaceApp key={activeScope} session={session} access={access.data} signOut={signOut}/>;
}

function WorkspaceApp({session, access, signOut}: {session: Session; access: WarehouseAccess; signOut: () => Promise<void>}) {
  const cache = useQueryClient(), canEdit = access.role === 'admin', mode = 'live' as const;
  const [view, setView] = useState<WorkspaceView>('overview');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<ModalState>(null), [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState(''), [signingOut, setSigningOut] = useState(false);
  const [theme, setTheme] = useState(() => {try {return localStorage.getItem('solara-theme') || 'system';} catch {return 'system';}});
  const [dark, setDark] = useState(false);
  const workspace = useQuery({queryKey: ['workspace', mode, session.user.id, access.owner_id, access.role], queryFn: warehouseApi.workspace, refetchInterval: 60000, refetchOnWindowFocus: true});
  const needsLocations = view === 'inventory' || view === 'reports';
  const locations = useQuery({queryKey: ['damany-locations', access.owner_id], queryFn: warehouseApi.locations, enabled: needsLocations});
  const warehouseData: WarehouseSnapshot = workspace.data || {...emptyData, inventory_units: []};
  const data = warehouseData as Snapshot, m = metrics(data), notices = notifications(data);
  const unread = notices.filter(notice => !notice.read).length;
  const navigate = (next: WorkspaceView, nextFilter = 'all') => {setView(next); setFilter(nextFilter); setQuery(''); setMobile(false); window.scrollTo({top: 0});};
  const open = (next: ModalState) => {
    if (!canEdit && next && !['site-detail', 'client-detail', 'item-detail'].includes(next.type)) {setToast('Your account has viewer access. Ask an admin to make this change.'); return;}
    setModal(next);
  };
  useEffect(() => {
    try {localStorage.setItem('solara-theme', theme);} catch { /* Theme still works when browser storage is unavailable. */ }
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {const enabled = theme === 'dark' || theme === 'system' && mq.matches; document.documentElement.classList.toggle('dark', enabled); setDark(enabled);};
    apply(); mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {if (toast) {const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer);}}, [toast]);
  const [, tick] = useState(0);
  useEffect(() => {const timer = setInterval(() => tick(value => value + 1), 60000); return () => clearInterval(timer);}, []);
  const logout = async () => {setSigningOut(true); try {await signOut();} catch (value) {setToast(errorMessage(value));} finally {setSigningOut(false);}};
  const refreshWarehouse = async () => {
    await Promise.all([cache.invalidateQueries({queryKey: ['workspace']}, {throwOnError: true}), cache.invalidateQueries({queryKey: ['damany-locations']}, {throwOnError: true}), cache.invalidateQueries({queryKey: ['damany-report']}, {throwOnError: true})]);
  };
  const props = {data, query, setQuery, open, navigate, filter, setFilter};
  const formProps = {mode, onClose: () => setModal(null), onSuccess: (message: string) => {setModal(null); setToast(message);}};
  const title = view === 'settings' ? 'Settings' : nav.find(item => item.id === view)?.label;
  const searchVisible = !['reports', 'settings'].includes(view);

  return <div className="app-shell damany-shell">
    {mobile && <button className="mobile-overlay" aria-label="Close navigation" onClick={() => setMobile(false)}/>}
    <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
      <Brand/>
      <div className="nav-label">WORKSPACE</div>
      <nav className="damany-navigation" aria-label="Main navigation">{nav.map(({id, label, Icon}) => <button key={id} aria-current={view === id ? 'page' : undefined} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={19} strokeWidth={1.7}/><span>{label}</span>{id === 'notifications' && unread > 0 ? <span className="nav-count">{unread}</span> : id === 'warranties' && m.in60.length > 0 ? <span className="nav-count">{m.in60.length}</span> : id === 'inventory' && m.low.length > 0 ? <span className="nav-small-dot"/> : null}</button>)}</nav>
      <div className="sidebar-bottom">
        <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><SettingsIcon size={19}/><span>Settings</span></button>
        <div className="sidebar-profile"><span className="profile-avatar">D</span><div><strong>{canEdit ? 'Administrator' : 'Viewer · read only'}</strong><small title={session.user.email}>{session.user.email || 'Company account'}</small></div></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><IconButton label="Open navigation" className="mobile-menu" onClick={() => setMobile(true)}><Menu size={20}/></IconButton><span>Workspace</span><ChevronRight size={13}/><strong>{title}</strong></div>
        <div className="topbar-actions">
          {searchVisible && <div className="top-search"><Search size={16}/><input aria-label="Search current view" placeholder="Search this view…" value={query} onChange={event => {setQuery(event.target.value); if (view === 'overview') {setView('installations'); setFilter('all');}}}/></div>}
          <span className="mode-indicator live"><i/>Live workspace</span><span className="topbar-divider"/>
          <IconButton label={`Open notifications: ${unread} unread`} onClick={() => navigate('notifications')}><Bell size={19}/>{unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}</IconButton>
          <IconButton label={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={dark} className="damany-theme-toggle" onClick={() => setTheme(dark ? 'light' : 'dark')}><Sun size={19}/></IconButton>
          <button className="top-avatar" title={session.user.email} aria-label="Open profile settings" onClick={() => navigate('settings')}>{(session.user.email || 'DM').slice(0, 2).toUpperCase()}</button>
          <IconButton label="Sign out" disabled={signingOut} onClick={logout}><LogOut size={18}/></IconButton>
        </div>
      </header>
      <main id="main-content">
        {!canEdit && <div className="dw-notice" role="status">Viewer access · You can read records and reports. An admin must make changes.</div>}
        {view === 'settings' ? <Settings theme={theme} setTheme={setTheme} email={session.user.email} role={access.role} signOut={signOut}/> : workspace.isPending ? <Loading/> : workspace.error ? <div className="panel error-state"><h2>We couldn't load your workspace</h2><FormError message={warehouseError(workspace.error)}/><Button onClick={() => workspace.refetch()}><RefreshCw size={16}/>Try again</Button></div> : needsLocations && locations.isPending ? <Loading/> : needsLocations && locations.error ? <div className="panel error-state"><FormError message={warehouseError(locations.error)}/><Button onClick={() => locations.refetch()}><RefreshCw size={16}/>Try again</Button></div> :
          view === 'overview' ? <Overview {...props}/> :
          view === 'clients' ? <Clients {...props}/> :
          view === 'installations' ? <Installations {...props}/> :
          view === 'invoices' ? <Invoices {...props} mode={mode} userId={session.user.id}/> :
          view === 'quotations' ? <Quotations {...props} mode={mode} userId={session.user.id} canEdit={canEdit}/> :
          view === 'inventory' ? <Warehouse search={query} setSearch={setQuery} data={warehouseData} locations={locations.data || []} canEdit={canEdit} refresh={refreshWarehouse} dirty={() => setToast('Stock movement saved.')}>{actions => <Inventory {...props} canEdit={canEdit} actions={actions}/>}</Warehouse> :
          view === 'reports' ? <Reports locations={locations.data || []} ownerId={access.owner_id}/> :
          view === 'notifications' ? <Notifications {...props} mode={mode}/> : <Warranties {...props}/>}
      </main>
    </div>
    {canEdit && modal?.type === 'client' && <ClientForm key={modal.client?.id || 'new'} client={modal.client} {...formProps}/>}
    {canEdit && modal?.type === 'site' && <SiteForm data={data} clientId={modal.clientId} {...formProps}/>}
    {canEdit && modal?.type === 'stock' && <StockForm data={data} itemId={modal.itemId} {...formProps}/>}
    {canEdit && modal?.type === 'assign' && <AssignForm data={data} site={modal.site} {...formProps}/>}
    {canEdit && modal?.type === 'rma' && <RmaForm data={data} component={modal.component} {...formProps} onSuccess={message => {setToast(message); setModal({type: 'site-detail', id: modal.component.installation_id});}}/>}
    {canEdit && modal?.type === 'edit-site' && <EditSiteForm site={modal.site} {...formProps}/>}
    {modal && ['site-detail', 'client-detail', 'item-detail'].includes(modal.type) && <Details key={'id' in modal ? modal.id : modal.type} modal={modal} data={data} open={open} onClose={() => setModal(null)} mode={mode} notify={setToast}/>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={19}/><span>{toast}</span><IconButton label="Dismiss notification" onClick={() => setToast('')}><X size={16}/></IconButton></div>}
  </div>;
}
