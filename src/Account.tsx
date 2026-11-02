import { useEffect, useState } from 'react';
import { Icon } from './Visuals';
import { Words } from './Motion';

export interface AuthUser { name: string; email: string; picture: string }
interface AuthStatus { enabled: boolean; user: AuthUser | null }

let statusCache: Promise<AuthStatus> | null = null;

/** One shared fetch — the header, the brief success card and /account all read it. */
export function authStatus(): Promise<AuthStatus> {
  if (!statusCache) {
    statusCache = fetch('/api/auth/status')
      .then(r => r.ok ? r.json() : { enabled: false, user: null })
      .catch(() => ({ enabled: false, user: null }) as AuthStatus);
  }
  return statusCache;
}

export function invalidateAuthStatus(): void { statusCache = null; }

export function useAuthStatus(): { loading: boolean; enabled: boolean; user: AuthUser | null } {
  const [state, setState] = useState<AuthStatus | null>(null);
  useEffect(() => { let alive = true; void authStatus().then(s => { if (alive) setState(s); }); return () => { alive = false; }; }, []);
  return { loading: state === null, enabled: state?.enabled ?? false, user: state?.user ?? null };
}

export function GoogleMark({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.1 3.7-8.6z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.2-7-5.1L1.2 17.2C3.2 21.2 7.3 24 12 24z" />
    <path fill="#FBBC05" d="M5 14.3c-.3-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.2 6.8C.4 8.4 0 10.1 0 12s.4 3.6 1.2 5.2L5 14.3z" />
    <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.2 2.8 1.2 6.8L5 9.7c1-2.9 3.8-5 7-5z" />
  </svg>;
}

/** Compact header element: "Sign in" chip when logged out, avatar + name when in. */
export function HeaderAuth() {
  const { loading, enabled, user } = useAuthStatus();
  if (loading || !enabled) return null;
  if (!user) return <a className="auth-chip" href="/api/auth/google/start"><GoogleMark size={15} /><span>Sign in</span></a>;
  return <a className="auth-chip is-user" href="/account" aria-label="My space">
    {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="auth-initial">{(user.name || user.email)[0]?.toUpperCase() || '?'}</span>}
    <span className="auth-name">{user.name?.split(' ')[0] || 'My space'}</span>
  </a>;
}

function statusClass(status: string): string {
  if (status === 'Delivered') return 'done';
  if (status === 'In progress' || status === 'Planning' || status === 'Planning together') return 'active';
  if (status === 'Closed') return 'muted';
  return '';
}

interface AccountData { name: string; email: string; picture: string; projects: { id: string; service: string; status: string; createdAt: string; message: string }[] }

export default function AccountPage() {
  const { loading, enabled, user } = useAuthStatus();
  const [data, setData] = useState<AccountData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loading || !enabled || !user) return;
    let alive = true;
    fetch('/api/account/projects')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(payload => { if (alive) setData({ name: payload.user?.name || user.name, email: payload.user?.email || user.email, picture: payload.user?.picture || '', projects: Array.isArray(payload.projects) ? payload.projects : [] }); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [loading, enabled, user]);

  const error = new URLSearchParams(location.search).get('error');
  const errorNote = error === 'unavailable' ? 'Google sign-in is not connected yet — the studio is wiring it up.'
    : error === 'state' || error === 'google' ? 'Google sign-in could not be completed. Please try again.'
    : error === 'rate' ? 'Too many sign-in attempts. Please try again in a little while.'
    : '';

  if (loading) return <article className="container detail-page account-page"><div className="account-loading">Opening your space…</div></article>;

  if (!enabled) return <article className="container detail-page account-page">
    <div className="detail-heading"><div className="eyebrow section-kicker"><span /> MY SPACE</div>
      <h1>Your space<span className="title-period">.</span></h1>
      <p>A personal corner of the studio: the briefs you send and their live status, kept in one place. Sign-in is optional and is being connected right now — check back soon.</p></div>
  </article>;

  if (!user) return <article className="container detail-page account-page">
    {errorNote && <p className="account-error" role="alert">{errorNote}</p>}
    <div className="account-card account-signin">
      <div className="eyebrow section-kicker"><span /> MY SPACE — OPTIONAL SIGN-IN</div>
      <h1>Track your projects<span className="title-period">.</span></h1>
      <p>Continue with Google and every brief you send lives in your own space with its live status. No password to remember — and completely optional: you can always contact the studio without an account.</p>
      <a className="button google-button" href="/api/auth/google/start"><GoogleMark size={17} /> Continue with Google</a>
      <small>We only read your name, email and profile photo. No posts, no contacts, no extras.</small>
    </div>
  </article>;

  return <article className="container detail-page account-page">
    <header className="account-head">
      <div className="account-who">
        {data?.picture
          ? <img className="account-avatar" src={data.picture} alt="" referrerPolicy="no-referrer" />
          : <span className="account-avatar account-avatar-text">{(user.name || user.email)[0]?.toUpperCase()}</span>}
        <div><span className="eyebrow section-kicker"><span /> MY SPACE</span>
          <h1>{data?.name || user.name || 'Welcome'}<span className="title-period">.</span></h1>
          <p className="account-email">{data?.email || user.email}</p></div>
      </div>
      <button className="button secondary small" onClick={async () => {
        invalidateAuthStatus();
        await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        location.href = '/';
      }}>Sign out <Icon size={15} /></button>
    </header>

    <section className="account-projects">
      <h2><Words>Your projects.</Words></h2>
      {!data && !failed && <p className="account-note">Loading your briefs…</p>}
      {failed && <p className="account-note">Your projects could not be loaded right now — refresh in a moment.</p>}
      {data && data.projects.length === 0 && <div className="account-empty">
        <p>No briefs yet. Send your first project brief and it appears here with its live status.</p>
        <a className="button small" href="/start">Start a project <Icon size={15} /></a>
      </div>}
      {data && data.projects.length > 0 && <div className="project-list">
        {data.projects.map(p => <div className="project-row" key={p.id}>
          <div className="project-row-main">
            <strong>{p.service ? p.service.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Custom request'}</strong>
            <span className="project-date">{new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            {p.message && <p>{p.message.slice(0, 180)}{p.message.length > 180 ? '…' : ''}</p>}
          </div>
          <span className={`status-pill ${statusClass(p.status)}`}>{p.status}</span>
        </div>)}
      </div>}
    </section>
  </article>;
}
