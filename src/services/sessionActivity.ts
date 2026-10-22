import type {Session} from '@supabase/supabase-js';

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ACTIVITY_KEY = 'damany-session-activity-v1';
export const IDLE_MESSAGE = 'You were signed out after 30 minutes without activity. Please sign in again.';
type StoredActivity = {user: string; session: string; at: number};
type ActivityStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// This identifies a session; Supabase still verifies authentication and database permissions.
function identity(session: Session) {
  try {
    const token = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(token));
    return String(payload.session_id || session.user.last_sign_in_at || session.user.id);
  } catch {return session.user.last_sign_in_at || session.user.id;}
}

export class SessionActivity {
  private listeners = new Set<(session?: Session) => void>();
  private storageFailed = false;
  constructor(private storage: ActivityStorage, private now: () => number = Date.now) {}
  private read(): StoredActivity | null {
    try {
      const value = JSON.parse(this.storage.getItem(ACTIVITY_KEY) || 'null') as StoredActivity | null;
      return value && typeof value.user === 'string' && typeof value.session === 'string' &&
        Number.isFinite(value.at) && value.at <= this.now() ? value : null;
    } catch {return null;}
  }
  remaining(session: Session): number {
    if (this.storageFailed) return 0;
    const value = this.read();
    if (!value || value.user !== session.user.id || value.session !== identity(session)) return 0;
    return Math.max(0, IDLE_TIMEOUT_MS - (this.now() - value.at));
  }
  belongsTo(session: Session) {
    const value = this.read();
    return value?.user === session.user.id && value.session === identity(session);
  }
  /** Call only after a successful password login or a fresh recovery link. */
  start(session: Session) {
    try {this.storage.setItem(ACTIVITY_KEY, JSON.stringify({user:session.user.id, session:identity(session), at:this.now()}));}
    catch {throw new Error('Allow browser storage for this site, then sign in again.');}
    this.storageFailed = false;
    this.listeners.forEach(listener => listener(session));
  }
  touch(session: Session) {
    // Check BEFORE writing: returning to an expired tab must not revive its login.
    if (!this.remaining(session)) return false;
    try {this.storage.setItem(ACTIVITY_KEY, JSON.stringify({user:session.user.id, session:identity(session), at:this.now()}));}
    catch {return false;}
    return true;
  }
  end() {
    try {this.storage.removeItem(ACTIVITY_KEY);} catch {this.storageFailed = true;}
    this.listeners.forEach(listener => listener());
  }
  subscribe(listener: (session?: Session) => void) {
    this.listeners.add(listener);
    return () => {this.listeners.delete(listener);};
  }
}

let browserActivity: SessionActivity | undefined;
export function getSessionActivity(): SessionActivity | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!browserActivity) {
    // Fail closed if storage is blocked: a saved session is never silently accepted.
    const unavailable: ActivityStorage = {getItem:()=>null, setItem:()=>{throw new Error('Storage unavailable');}, removeItem:()=>{}};
    let storage: ActivityStorage;
    try {storage = window.localStorage || unavailable;} catch {storage = unavailable;}
    browserActivity = new SessionActivity(storage);
  }
  return browserActivity;
}

/** Activity in any open tab counts; background requests and token refreshes do not. */
export function watchSessionActivity(activity: SessionActivity, session: Session, expire: () => void,
  win: Window = window, doc: Document = document) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let lastMove = 0;
  const check = () => {
    if (stopped) return false;
    clearTimeout(timer);
    const remaining = activity.remaining(session);
    if (!remaining) {stopped = true; expire(); return false;}
    timer = setTimeout(check, remaining);
    return true;
  };
  const interact = (event: Event) => {
    if (!event.isTrusted || doc.visibilityState === 'hidden' || !check()) return;
    if (event.type === 'pointermove' && Date.now() - lastMove < 1000) return;
    lastMove = Date.now();
    if (!activity.touch(session)) {stopped = true; expire(); return;}
    check();
  };
  const onStorage = (event: StorageEvent) => {if (event.key === ACTIVITY_KEY || event.key === null) check();};
  const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'];
  events.forEach(event => win.addEventListener(event, interact, {capture:true, passive:true}));
  win.addEventListener('storage', onStorage);
  win.addEventListener('focus', check);
  win.addEventListener('pageshow', check);
  doc.addEventListener('visibilitychange', check);
  check();
  return () => {
    stopped = true; clearTimeout(timer);
    events.forEach(event => win.removeEventListener(event, interact, true));
    win.removeEventListener('storage', onStorage); win.removeEventListener('focus', check);
    win.removeEventListener('pageshow', check); doc.removeEventListener('visibilitychange', check);
  };
}
