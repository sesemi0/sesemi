import { useEffect, useMemo, useRef, useState } from 'react';
import 'vazirmatn/Vazirmatn-Variable-font-face.css';
import { Icon, Ribbon } from './Visuals';
import services from './services.json';
import { adminBase, adminRequest, csvDownload, demoWorkspace, type Lead, type Order, type Settings, type Workspace } from './admin-data';
import './admin.css';

/**
 * ورک‌اسپیس خصوصی مالک — کاملاً فارسی و راست‌چین، با فونت وزیرمتن.
 * داده‌ها از بک‌اند کلادفلر (/api/admin) می‌آید؛ بدون نشست معتبر چیزی بارگذاری نمی‌شود.
 */

type View = 'Overview' | 'Enquiries' | 'Projects' | 'Analytics' | 'Settings' | 'Connections';
const navigation: [View, string, string][] = [
  ['Overview', 'design', 'نمای کلی'],
  ['Enquiries', 'mail', 'پیام‌ها'],
  ['Projects', 'brand', 'پروژه‌ها'],
  ['Analytics', 'ai', 'آمار'],
  ['Settings', 'edit', 'تنظیمات'],
  ['Connections', 'code', 'اتصال‌ها'],
];
const initial: Workspace = { leads: [], orders: [], daily: [], pages: [], sources: [], settings: { studioName: 'SESEMI', replyEmail: '', notifications: false, assistantInstructions: '' } };
const titles: Record<View, [string, string]> = {
  Overview: ['کمی شفافیت، خیلی امکان.', 'استودیو در یک نگاه.'],
  Enquiries: ['هر گفت‌وگو از همین‌جا شروع می‌شود.', 'پیام‌ها و ارتباط‌ها'],
  Projects: ['از یک بریف خوب تا کارِ بزرگ.', 'مسیر خلاقانهٔ پروژه‌ها.'],
  Analytics: ['مسیر مخاطب را بفهم، نه فقط عددش را.', 'دید روشن‌تر از مخاطب‌ها.'],
  Settings: ['ورک‌اسپیس را مال خودت کن.', 'تنظیمات استودیو.'],
  Connections: ['اتصال‌های درست، کارِ درست.', 'اتاق کنترل استودیو.'],
};
const STATUS_FA: Record<string, string> = { New: 'جدید', Contacted: 'تماس گرفته شد', Qualified: 'تایید اولیه', Won: 'برنده', Lost: 'منصرف' };
const ORDER_STATUS_FA: Record<string, string> = { Planning: 'برنامه‌ریزی', 'In progress': 'در حال انجام', Review: 'بازبینی', Delivered: 'تحویل شده' };
const SERVICE_FA: Record<string, string> = {
  'web-design': 'طراحی و توسعهٔ وب',
  'ai-advertising-videos': 'فیلم تبلیغاتی هوش مصنوعی',
  'ai-video-editing': 'تدوین ویدیو با هوش مصنوعی',
  'ui-ux-design': 'طراحی رابط و تجربهٔ کاربری',
  'brand-identity': 'لوگو و هویت بصری',
  'prompt-engineering': 'مهندسی پرامپت خلاقانه',
  'Web design': 'طراحی وب',
  'AI advertising films': 'فیلم تبلیغاتی AI',
  'AI video editing': 'تدوین ویدیو AI',
  'UI/UX design': 'طراحی UI/UX',
  'Brand identity': 'هویت برند',
  'Prompt engineering': 'مهندسی پرامپت',
};
const statuses = Object.keys(STATUS_FA);
const faDate = (value: string) => value ? new Intl.DateTimeFormat('fa-IR', { month: 'long', day: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : 'تنظیم نشده';
const faNumber = (value: number) => value.toLocaleString('fa-IR');
const serviceFa = (value: string) => SERVICE_FA[value] || value || '—';

function Badge({ value }: { value: string }) {
  const label = STATUS_FA[value] || ORDER_STATUS_FA[value] || value;
  return <span className={`status-badge ${value.toLowerCase().replaceAll(' ', '-')}`}><i />{label}</span>;
}

type SystemInfo = { ai: { enabled: boolean; provider: string; model: string }; mail: { enabled: boolean } };

export default function Admin() {
  const [mode, setMode] = useState<'checking' | 'locked' | 'setup' | 'demo' | 'live'>('checking');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [csrf, setCsrf] = useState('');
  const [workspace, setWorkspace] = useState<Workspace>(initial);
  const [view, setView] = useState<View>('Overview');
  const [range, setRange] = useState(30);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All stages');
  const [layout, setLayout] = useState<'table' | 'board'>('table');
  const [drawer, setDrawer] = useState<Lead | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLead, setNewLead] = useState({ name: '', email: '', company: '', service: services[0].slug });
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const session = await adminRequest<{ role: string; csrfToken: string }>('/session');
        if (session.role !== 'owner' || !session.csrfToken) throw new Error('دسترسی مالک لازم است.');
        const data = await adminRequest<Workspace>('/workspace');
        setCsrf(session.csrfToken); setWorkspace(data); setSettings(data.settings); setMode('live');
      } catch (error) {
        const body = (error as { body?: { setup?: boolean } }).body;
        setAuthMessage(error instanceof Error && error.message ? error.message : 'برای ادامه وارد شوید.');
        setMode(body?.setup ? 'setup' : 'locked');
      }
    })();
  }, []);
  useEffect(() => {
    if (mode !== 'live') return;
    adminRequest<SystemInfo>('/system').then(setSystem).catch(() => setSystem(null));
  }, [mode]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    if (drawer || adding) {
      lastFocus.current = document.activeElement as HTMLElement;
      requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>('button,input')?.focus());
    } else lastFocus.current?.focus();
  }, [!!drawer, adding]);

  const daily = useMemo(() => workspace.daily.filter(d => new Date(`${d.date}T00:00:00`) >= new Date(new Date().setDate(new Date().getDate() - range))), [workspace.daily, range]);
  const leadsInRange = workspace.leads.filter(l => new Date(`${l.createdAt.slice(0, 10)}T00:00:00`) >= new Date(new Date().setDate(new Date().getDate() - range)));
  const visitors = daily.reduce((a, d) => a + d.visitors, 0);
  const pageviews = daily.reduce((a, d) => a + d.pageviews, 0);
  const converted = leadsInRange.filter(l => l.status === 'Won').length;
  const rate = leadsInRange.length ? `${Math.round(converted / leadsInRange.length * 100).toLocaleString('fa-IR')}٪` : '—';
  const filtered = leadsInRange.filter(l => (filter === 'All stages' || l.status === filter) && `${l.name} ${l.company} ${l.email} ${l.service}`.toLowerCase().includes(search.toLowerCase()));
  const demo = mode === 'demo';

  function openLead(lead: Lead) { setDrawer({ ...lead }); }
  async function saveLead(lead: Lead) {
    setBusy(true);
    try {
      const saved = demo ? lead : await adminRequest<Lead>(`/leads/${encodeURIComponent(lead.id)}`, { method: 'PATCH', body: JSON.stringify({ status: lead.status, notes: lead.notes, followUp: lead.followUp }) }, csrf);
      setWorkspace(w => ({ ...w, leads: w.leads.map(l => l.id === saved.id ? saved : l) }));
      setDrawer(null); setToast(demo ? 'پیام نمونه به‌روزرسانی شد؛ تغییرات فقط برای همین نشست است.' : 'پیام به‌روزرسانی شد.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'ذخیره نشد.'); } finally { setBusy(false); }
  }
  async function addLead() {
    if (busy) return;
    setBusy(true);
    try {
      const value: Lead = { ...newLead, id: `LOCAL-${crypto.randomUUID().slice(0, 8)}`, status: 'New', createdAt: new Date().toISOString(), notes: '', followUp: '', source: 'Manual' };
      const saved = demo ? value : await adminRequest<Lead>('/leads', { method: 'POST', body: JSON.stringify(newLead) }, csrf);
      setWorkspace(w => ({ ...w, leads: [saved, ...w.leads] })); setAdding(false); setNewLead({ name: '', email: '', company: '', service: services[0].slug }); setToast(demo ? 'پیام نمونه اضافه شد.' : 'پیام اضافه شد.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'افزودن پیام ممکن نشد.'); } finally { setBusy(false); }
  }
  async function convertToProject(lead: Lead) {
    if (workspace.orders.some(o => o.leadId === lead.id)) { setToast('برای این پیام قبلاً پروژه ساخته شده است.'); return; }
    setBusy(true);
    try {
      const order: Order = { id: `PROJECT-${crypto.randomUUID().slice(0, 6)}`, leadId: lead.id, title: `${lead.company || lead.name} · ${serviceFa(lead.service)}`, client: lead.company || lead.name, service: lead.service, status: 'Planning', amount: 0, due: '' };
      const result = demo ? { order, lead: { ...lead, status: 'Won' as Lead['status'] } } : await adminRequest<{ order: Order; lead: Lead }>(`/leads/${encodeURIComponent(lead.id)}/convert`, { method: 'POST' }, csrf);
      setWorkspace(w => ({ ...w, orders: [...w.orders, result.order], leads: w.leads.map(l => l.id === lead.id ? result.lead : l) }));
      setDrawer(null); setView('Projects'); setToast('پروژه ساخته شد. ارزش و تاریخ تحویل را در کارت پروژه تنظیم کنید.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'ساخت پروژه ممکن نشد.'); } finally { setBusy(false); }
  }
  async function updateOrder(order: Order) {
    setBusy(true);
    try {
      const saved = demo ? order : await adminRequest<Order>(`/orders/${encodeURIComponent(order.id)}`, { method: 'PATCH', body: JSON.stringify({ status: order.status, amount: order.amount, due: order.due }) }, csrf);
      setWorkspace(w => ({ ...w, orders: w.orders.map(o => o.id === saved.id ? saved : o) })); setToast(demo ? 'پروژهٔ نمونه به‌روزرسانی شد.' : 'پروژه به‌روزرسانی شد.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'به‌روزرسانی ممکن نشد.'); } finally { setBusy(false); }
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!adminBase || authBusy) return;
    setAuthBusy(true); setAuthMessage('');
    try {
      const session = await adminRequest<{ role: string; csrfToken: string }>('/login', { method: 'POST', body: JSON.stringify(credentials) });
      setCsrf(session.csrfToken);
      const data = await adminRequest<Workspace>('/workspace');
      setWorkspace(data); setSettings(data.settings); setCredentials({ username: '', password: '' }); setMode('live');
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : 'ورود ممکن نشد.'); }
    finally { setAuthBusy(false); }
  }
  async function createOwner(event: React.FormEvent) {
    event.preventDefault();
    if (!adminBase || authBusy) return;
    setAuthBusy(true); setAuthMessage('');
    try {
      const session = await adminRequest<{ role: string; csrfToken: string }>('/setup', { method: 'POST', body: JSON.stringify(credentials) });
      setCsrf(session.csrfToken);
      const data = await adminRequest<Workspace>('/workspace');
      setWorkspace(data); setSettings(data.settings); setCredentials({ username: '', password: '' }); setMode('live');
      setToast('حساب ساخته شد. حالا متغیر ALLOW_SETUP را از تنظیمات سرور حذف کنید.');
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : 'ساخت حساب ممکن نشد.'); }
    finally { setAuthBusy(false); }
  }
  async function signOut() {
    if (demo) { setWorkspace(initial); setMode('locked'); return; }
    setBusy(true);
    try { await adminRequest('/logout', { method: 'POST' }, csrf); setWorkspace(initial); setCsrf(''); setMode('locked'); }
    catch { setToast('خروج انجام نشد. قبل از ترک این دستگاه دوباره تلاش کنید.'); }
    finally { setBusy(false); }
  }
  async function testAi() {
    setBusy(true);
    try { const result = await adminRequest<{ ok: boolean; sample: string }>('/test-ai', { method: 'POST' }, csrf); setToast(`دستیار پاسخ داد: ${result.sample.slice(0, 90)}`); }
    catch (error) { setToast(error instanceof Error ? error.message : 'تست ممکن نشد.'); }
    finally { setBusy(false); }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!adminBase || pwBusy) return;
    if (pwForm.next !== pwForm.confirm) { setToast('گذرواژهٔ جدید و تکرارش یکسان نیستند.'); return; }
    setPwBusy(true);
    try {
      await adminRequest('/password', { method: 'POST', body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }) }, csrf);
      setWorkspace(initial); setCsrf(''); setCredentials({ username: '', password: '' }); setMode('locked');
      setAuthMessage('گذرواژه عوض شد. حالا با گذرواژهٔ جدید وارد شو.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'تغییر گذرواژه ممکن نشد.'); }
    finally { setPwBusy(false); }
  }
  function exportLeads() { csvDownload([['ID', 'Name', 'Company', 'Email', 'Service', 'Status', 'Created', 'Follow up'], ...filtered.map(l => [l.id, l.name, l.company, l.email, l.service, l.status, l.createdAt, l.followUp])], `sesemi-${demo ? 'demo-' : ''}enquiries.csv`); setToast('خروجی پیام‌های فیلترشده آماده شد. اطلاعات مشتری را خصوصی نگه دارید.'); }

  if (mode === 'checking') return <div className="admin-loading">در حال بررسی نشست شما…</div>;

  if (mode === 'locked' || mode === 'setup') return <div className="admin-auth" dir="rtl">
    <a href="/" className="brand"><Ribbon small /><span>SESEMI<span className="brand-dot">.</span></span></a>
    <div className="auth-panel">
      <div className="auth-lock"><Icon name="shield" size={28} /></div>
      <div className="eyebrow">ورک‌اسپیس مالک</div>
      <h1>{mode === 'setup' ? <>حساب مدیر را<br /><span>همین‌جا بساز.</span></> : <>فضای خصوصیِ<br /><span>مدیریت استودیو.</span></>}</h1>
      <p>{mode === 'setup' ? 'این فرم فقط یک بار کار می‌کند و فقط اولین حساب را می‌سازد.' : 'پیام‌ها، پروژه‌ها و آمار سایت — جدا از سایت عمومی.'}</p>
      <form onSubmit={mode === 'setup' ? createOwner : signIn}>
        <label>نام کاربری<input dir="ltr" value={credentials.username} onChange={e => setCredentials({ ...credentials, username: e.target.value })} placeholder="مثلاً studio-owner" required autoComplete="username" maxLength={40} /></label>
        <label>گذرواژه<input dir="ltr" type="password" value={credentials.password} onChange={e => setCredentials({ ...credentials, password: e.target.value })} placeholder={mode === 'setup' ? 'دست‌کم ۸ کاراکتر' : 'گذرواژهٔ شما'} required autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} maxLength={100} /></label>
        <button className="button" disabled={!adminBase || authBusy}>{authBusy ? 'در حال بررسی…' : mode === 'setup' ? 'ساخت حساب و ورود' : 'ورود'} <Icon /></button>
      </form>
      {authMessage && <p className="auth-notice" role="status">{authMessage}</p>}
      {!adminBase && <div className="auth-notice"><Icon name="shield" size={17} /><span>سرویس مدیریت متصل نیست. دسترسی واقعی قفل است و هیچ دادهٔ خصوصی بارگذاری نمی‌شود.</span></div>}
      {mode === 'setup' && <div className="auth-notice"><Icon name="shield" size={17} /><span>بعد از ساخت حساب، متغیر ALLOW_SETUP را از تنظیمات سرور حذف کنید تا این فرم برای همیشه بسته شود.</span></div>}
      <div className="auth-divider"><span>طرح را ببینید</span></div>
      <button className="button secondary" onClick={() => { const data = demoWorkspace(); setWorkspace(data); setSettings(data.settings); setMode('demo'); }}>باز کردن نمونهٔ آزمایشی <span>↗</span></button>
      <small>فقط دادهٔ تخیلی. بدون دور زدن گذرواژه و بدون رکورد واقعی.</small>
    </div>
    <a className="auth-back" href="/">← بازگشت به استودیو</a>
  </div>;

  const chartMax = Math.max(1, ...daily.map(d => d.visitors));
  const chart = <div className="traffic-chart" role="img" aria-label={`بازدید روزانه در بازهٔ انتخابی: ${faNumber(visitors)} بازدید. مراجعهٔ تکراری در روزهای مختلف دوباره شمرده می‌شود.`}>
    <div className="chart-grid"><span>{faNumber(chartMax)}</span><span>{faNumber(Math.round(chartMax / 2))}</span><span>۰</span></div>
    <div className="chart-bars">{daily.map(d => <div className="chart-bar-col" key={d.date}><div className="chart-bar" style={{ height: `${Math.max(2, d.visitors / chartMax * 100)}%` }} title={`${faDate(d.date)}: ${faNumber(d.visitors)} بازدید`} /><span>{faDate(d.date)}</span></div>)}</div>
  </div>;

  const leadTable = (rows: Lead[], compact = false) => <div className="table-scroll"><table className="leads-table">
    <thead><tr><th>مخاطب</th><th>علاقه‌مندی</th><th>مرحله</th>{!compact && <th>تاریخ</th>}<th><span className="sr-only">باز کردن پیام</span></th></tr></thead>
    <tbody>{rows.map(l => <tr key={l.id}>
      <td><button className="contact-cell" onClick={() => openLead(l)}><span className="contact-avatar">{l.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><span><strong>{l.name}</strong><small>{l.company || l.email}</small></span></button></td>
      <td>{serviceFa(l.service)}</td>
      <td><Badge value={l.status} /></td>
      {!compact && <td>{faDate(l.createdAt)}</td>}
      <td><button className="row-open" onClick={() => openLead(l)} aria-label={`باز کردن پیام ${l.name}`}>↖</button></td>
    </tr>)}</tbody>
  </table>
    {!rows.length && <div className="admin-empty"><Icon name="mail" size={30} /><h3>پیامی در این نما نیست.</h3><p>فیلتر دیگری را امتحان کنید، یا پیام تازه اضافه کنید.</p><button className="button secondary" onClick={() => { setSearch(''); setFilter('All stages'); }}>پاک کردن فیلترها</button></div>}
  </div>;

  return <div className="admin-app" dir="rtl">
    <aside className="admin-sidebar">
      <a href="/admin" className="brand"><Ribbon small /><span>SESEMI<span className="brand-dot">.</span></span></a>
      <div className="workspace-label"><span className="workspace-avatar">س.</span><div>ورک‌اسپیس استودیو<small>{demo ? 'پیش‌نمایش تعاملی' : 'دسترسی مالک'}</small></div><Icon name="shield" size={15} /></div>
      <span className="sidebar-section">ورک‌اسپیس</span>
      <nav aria-label="ناوبری ورک‌اسپیس">{navigation.map(([label, icon, fa]) => <button className={view === label ? 'active' : ''} key={label} onClick={() => { setView(label); setSearch(''); setFilter('All stages'); }}><Icon name={icon} size={19} /><span>{fa}</span>{label === 'Enquiries' && <small>{workspace.leads.filter(l => l.status === 'New').length.toLocaleString('fa-IR')}</small>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="studio-note"><span className="live-dot" /><strong>{demo ? 'جای امنی برای گشت‌وگذار' : 'ورک‌اسپیس خصوصی تو'}</strong><p>{demo ? 'همه‌چیز دادهٔ نمونه است. ابزارها را امتحان کن — چیزی به مشتری واقعی نمی‌رسد.' : 'مدیریت دسترسی‌ها با نشست امن سمت سرور انجام می‌شود.'}</p></div>
        <a className="view-site" href="/" target="_blank" rel="noreferrer">دیدن سایت عمومی <span>↗</span></a>
        <button className="sign-out" onClick={signOut} disabled={busy}>{demo ? 'خروج از پیش‌نمایش' : 'خروج از حساب'} <span>←</span></button>
        <div className="owner-profile"><span className="contact-avatar">س</span><div>مدیر استودیو<small>{demo ? 'ورک‌اسپیس آزمایشی' : 'نشست تاییدشده'}</small></div></div>
      </div>
    </aside>

    <div className="admin-body">
      <header className="admin-topbar">
        <div><span>ورک‌اسپیس</span><span>/</span><strong>{titles[view][1]}</strong></div>
        <div><span className={`mode-pill ${demo ? '' : 'live'}`}><i />{demo ? 'دادهٔ نمونه' : 'ورک‌اسپیس واقعی'}</span><a href="/" target="_blank" rel="noreferrer" className="admin-icon-button" aria-label="باز کردن سایت عمومی"><Icon size={19} /></a></div>
      </header>
      {demo && <div className="demo-banner"><span><Icon name="shield" size={15} /> پیش‌نمایش تعاملی — همهٔ افراد، ترافیک و ارزش‌ها تخیلی هستند.</span><button onClick={() => setView('Connections')}>وصل کردن دادهٔ واقعی <span>→</span></button></div>}

      <main className="admin-main">
        <div className="admin-page-heading">
          <div><div className="eyebrow">سسِمی / {titles[view][1]}</div><h1>{titles[view][1]}</h1><p>{titles[view][0]}</p></div>
          {['Overview', 'Enquiries', 'Analytics'].includes(view) && <select aria-label="بازهٔ گزارش" value={range} onChange={e => setRange(Number(e.target.value))}><option value={7}>۷ روز گذشته</option><option value={30}>۳۰ روز گذشته</option><option value={90}>۹۰ روز گذشته</option></select>}
          {view === 'Projects' && <button className="button" onClick={() => { setView('Enquiries'); setToast('یک پیام را باز کنید تا به پروژه تبدیلش کنید.'); }}>ساخت از روی پیام +</button>}
        </div>

        {view === 'Overview' && <>
          <div className="metric-grid">{[
            ['بازدید روزانه (جمع)', faNumber(visitors), 'شبه‌ناشناس؛ افراد شناسایی نمی‌شوند', 'ai'],
            ['پیام‌های جدید', faNumber(leadsInRange.length), 'پیام‌های دریافتی در این بازه', 'mail'],
            ['پروژه‌های فعال', faNumber(workspace.orders.filter(o => o.status !== 'Delivered').length), 'در حال حاضر در مسیر استودیو', 'brand'],
            ['نرخ تبدیل پیام', rate, 'پیام‌های برنده تقسیم بر همهٔ پیام‌ها', 'design'],
          ].map(([title, value, desc, icon]) => <div className="metric-card" key={title}><div><span>{title}</span><Icon name={icon} size={18} /></div><strong>{value}</strong><small>{desc}</small></div>)}</div>
          <div className="overview-middle">
            <section className="admin-card"><div className="admin-card-heading"><div><h2>مردمی که استودیو را پیدا می‌کنند</h2><p>بازدید روزانه · بازهٔ انتخابی</p></div><span className="chart-legend"><i />بازدید</span></div>{chart}<div className="chart-footer"><span>{faDate(daily[0]?.date || '')}</span><span>{faDate(daily.at(-1)?.date || '')}</span></div></section>
            <section className="admin-card pipeline-summary"><div className="admin-card-heading"><div><h2>از «سلام» تا پروژه</h2><p>مسیر پیام‌ها</p></div><Icon name="mail" size={20} /></div>
              {statuses.map(status => { const n = leadsInRange.filter(l => l.status === status).length; return <button key={status} onClick={() => { setView('Enquiries'); setFilter(status); }}><Badge value={status} /><span className="pipeline-meter"><i style={{ width: `${leadsInRange.length ? n / leadsInRange.length * 100 : 0}%` }} /></span><strong>{faNumber(n)}</strong><span>›</span></button>; })}
              <p>برای جلو بردن یک گفت‌وگو، مرحله‌اش را به‌روزرسانی کنید.</p>
            </section>
          </div>
          <section className="admin-card recent-enquiries"><div className="admin-card-heading"><div><h2>آخرین گفت‌وگوها</h2><p>قدم خوب بعدی با یک سلام ساده شروع می‌شود.</p></div><button className="text-button" onClick={() => setView('Enquiries')}>دیدن همهٔ پیام‌ها ←</button></div>{leadTable([...leadsInRange].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4), true)}</section>
        </>}

        {view === 'Enquiries' && <>
          <div className="enquiry-toolbar">
            <div className="admin-search"><Icon name="ai" size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="جست‌وجوی نام، برند یا خدمت…" aria-label="جست‌وجوی پیام‌ها" /></div>
            <select value={filter} onChange={e => setFilter(e.target.value)} aria-label="فیلتر بر اساس مرحله"><option value="All stages">همهٔ مراحل</option>{statuses.map(s => <option key={s} value={s}>{STATUS_FA[s]}</option>)}</select>
            <div className="layout-toggle"><button className={layout === 'table' ? 'active' : ''} onClick={() => setLayout('table')} aria-pressed={layout === 'table'}>لیست</button><button className={layout === 'board' ? 'active' : ''} onClick={() => setLayout('board')} aria-pressed={layout === 'board'}>بورد</button></div>
            <button className="button secondary" onClick={exportLeads}>خروجی CSV ↓</button>
            <button className="button" onClick={() => setAdding(true)}>پیام جدید +</button>
          </div>
          <p className="results-count">{faNumber(filtered.length)} پیام در این نما</p>
          {layout === 'table' ? <section className="admin-card">{leadTable(filtered)}</section>
            : <div className="kanban-board">{statuses.filter(s => filter === 'All stages' || s === filter).map(status => <section key={status} className="kanban-column"><header><Badge value={status} /><span>{faNumber(filtered.filter(l => l.status === status).length)}</span></header>
              {filtered.filter(l => l.status === status).map(l => <button className="kanban-lead" onClick={() => openLead(l)} key={l.id}><span className="kanban-brand">{l.company || 'مشتری مستقل'}</span><strong>{l.name}</strong><span>{serviceFa(l.service)}</span><small>{faDate(l.createdAt)} <span>↖</span></small></button>)}
              {!filtered.some(l => l.status === status) && <p className="kanban-empty">فعلاً پیامی این‌جا نیست.</p>}
            </section>)}</div>}
        </>}

        {view === 'Projects' && <>
          <div className="project-stage-tabs">{['All projects', 'Planning', 'In progress', 'Review', 'Delivered'].map(s => <button className={(filter === s || (filter === 'All stages' && s === 'All projects')) ? 'active' : ''} onClick={() => setFilter(s)} key={s}>{s === 'All projects' ? 'همهٔ پروژه‌ها' : ORDER_STATUS_FA[s]}<span>{faNumber(workspace.orders.filter(o => s === 'All projects' || o.status === s).length)}</span></button>)}</div>
          <div className="admin-project-grid">{workspace.orders.filter(o => filter === 'All stages' || filter === 'All projects' || o.status === filter).map(order => <ProjectCard key={order.id} order={order} busy={busy} save={updateOrder} />)}</div>
          {!workspace.orders.some(o => filter === 'All stages' || filter === 'All projects' || o.status === filter) && <div className="admin-empty"><h3>پروژه‌ای در این مرحله نیست.</h3><p>برای شروع، یک پیام واجد شرایط را به پروژه تبدیل کنید.</p><button className="button" onClick={() => setView('Enquiries')}>رفتن به پیام‌ها ←</button></div>}
          <p className="admin-footnote">ارزش پروژه‌ها تخمین به دلار است؛ فاکتور یا پرداخت‌شده محسوب نمی‌شود.</p>
        </>}

        {view === 'Analytics' && <>
          <div className="metric-grid">{[
            ['بازدید روزانه (جمع)', faNumber(visitors)],
            ['نمایش صفحه', faNumber(pageviews)],
            ['پیام‌های دریافتی', faNumber(leadsInRange.length)],
            ['نرخ پیام به نمایش', pageviews ? `${(leadsInRange.length / pageviews * 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪` : '—'],
          ].map(([title, value]) => <div className="metric-card" key={title}><div><span>{title}</span><Icon name="ai" size={17} /></div><strong>{value}</strong><small>بازهٔ گزارش انتخابی</small></div>)}</div>
          <section className="admin-card"><div className="admin-card-heading"><div><h2>ترافیک در طول زمان</h2><p>فقط بازدیدهای با رضایت. شمارندهٔ روزانه، یکتا بین روزها نیست.</p></div><button className="text-button" onClick={() => csvDownload([['Date', 'Visitors', 'Page views', 'Enquiries'], ...daily.map(d => [d.date, d.visitors, d.pageviews, d.enquiries])], 'sesemi-traffic.csv')}>خروجی داده ↓</button></div>{chart}</section>
          <div className="analytics-bottom">
            <section className="admin-card"><div className="admin-card-heading"><div><h2>صفحات پربازدید</h2><p>تمام داده‌های موجود</p></div></div>{workspace.pages.map(p => <div className="analytics-row" key={p.path}><span dir="ltr">{p.path}</span><strong>{faNumber(p.views)}</strong></div>)}{!workspace.pages.length && <p className="admin-footnote">هنوز دادهٔ صفحه‌ای موجود نیست.</p>}</section>
            <section className="admin-card"><div className="admin-card-heading"><div><h2>از کجا پیدایت می‌کنند</h2><p>کانال‌های ارجاع · تمام داده‌های موجود</p></div></div>{workspace.sources.map(s => <div className="analytics-row" key={s.name}><span dir="ltr">{s.name}</span><div className="source-meter"><i style={{ width: `${s.visits / Math.max(1, ...workspace.sources.map(a => a.visits)) * 100}%` }} /></div><strong>{faNumber(s.visits)}</strong></div>)}{!workspace.sources.length && <p className="admin-footnote">هنوز دادهٔ ارجاعی موجود نیست.</p>}</section>
          </div>
          <div className="privacy-callout"><Icon name="shield" /><div><h3>بازدیدها را بفهم؛ به مردم احترام بگذار.</h3><p>بازدیدکنندهٔ ناشناس قابل شناسایی نیست. یک نفر فقط وقتی خودش جزئیاتش را بفرستد به «پیام شناخته‌شده» تبدیل می‌شود. هیچ ردیابی هویت پنهان یا لاگ بازدید بدون رضایت در اینجا وجود ندارد.</p></div></div>
        </>}

        {view === 'Settings' && <form className="settings-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setSettingsSaved(false); try { const saved = demo ? settings : await adminRequest<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(settings) }, csrf); setWorkspace(w => ({ ...w, settings: saved })); setSettings(saved); setSettingsSaved(true); setToast(demo ? 'تنظیمات نمونه فقط در همین پیش‌نمایش ذخیره شد.' : 'تنظیمات ذخیره شد.'); } catch (error) { setToast(error instanceof Error ? error.message : 'ذخیرهٔ تنظیمات ممکن نشد.'); } finally { setBusy(false); } }}>
          <section className="admin-card"><div className="admin-card-heading"><div><h2>جزئیات استودیو</h2><p>تنظیمات ورک‌اسپیس. متن سایت عمومی در فایل‌های سورس مدیریت می‌شود.</p></div></div>
            <div className="admin-field-grid">
              <label>نام استودیو<input required value={settings.studioName} onChange={e => { setSettings({ ...settings, studioName: e.target.value }); setSettingsSaved(false); }} maxLength={100} /></label>
              <label>ایمیل پاسخ <span>اختیاری</span><input type="email" dir="ltr" placeholder="ایمیل واقعی استودیو" value={settings.replyEmail} onChange={e => { setSettings({ ...settings, replyEmail: e.target.value }); setSettingsSaved(false); }} /></label>
            </div>
            <label className="admin-checkbox"><input type="checkbox" checked={settings.notifications} onChange={e => setSettings({ ...settings, notifications: e.target.checked })} /><span>اطلاع‌رسانی پیام جدید<small>به سرویس اطلاع‌رسانی متصل روی سرور نیاز دارد.</small></span></label>
          </section>
          <section className="admin-card"><div className="admin-card-heading"><div><h2>دستورات دستیار سسِمی</h2><p>برای عامل سمت سرور. راهنمای محلیِ بدون کلید از این متن استفاده نمی‌کند.</p></div></div>
            <label>متن دستورات<textarea rows={6} value={settings.assistantInstructions} onChange={e => { setSettings({ ...settings, assistantInstructions: e.target.value }); setSettingsSaved(false); }} maxLength={6000} /></label>
            <p className="admin-footnote">کلیدهای API و دسترسی‌های مالک هرگز این‌جا نباشند؛ این‌ها به سرور تعلق دارند.</p>
          </section>
          <section className="admin-card"><div className="admin-card-heading"><div><h2>تغییر گذرواژه</h2><p>گذرواژه‌ای که جایی تایپ یا ارسال شده (مثل چت‌ها) دیگر امن نیست — همین‌جا عوضش کن.</p></div><Icon name="shield" size={20} /></div>
            <form onSubmit={changePassword}>
              <div className="admin-field-grid">
                <label>گذرواژهٔ فعلی<input type="password" dir="ltr" required autoComplete="current-password" value={pwForm.current} onChange={e => setPwForm({ ...pwForm, current: e.target.value })} maxLength={100} /></label>
                <label>گذرواژهٔ جدید (۸ کاراکتر به بالا)<input type="password" dir="ltr" required minLength={8} autoComplete="new-password" value={pwForm.next} onChange={e => setPwForm({ ...pwForm, next: e.target.value })} maxLength={100} /></label>
              </div>
              <label>تکرار گذرواژهٔ جدید<input type="password" dir="ltr" required autoComplete="new-password" value={pwForm.confirm} onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })} maxLength={100} /></label>
              <button className="button" disabled={pwBusy || !pwForm.current || pwForm.next.length < 8}>{pwBusy ? 'در حال تغییر…' : 'ذخیرهٔ گذرواژهٔ جدید'} <Icon size={16} /></button>
            </form>
            <p className="admin-footnote">بعد از تغییر، همهٔ نشست‌ها بسته می‌شوند و با گذرواژهٔ جدید دوباره وارد می‌شوی.</p>
          </section>
          <div className="settings-submit">{settingsSaved && <span role="status">{demo ? 'فقط در همین نشست آزمایشی ذخیره شد.' : 'در ورک‌اسپیس ذخیره شد.'}</span>}<button className="button" disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تنظیمات'} <Icon size={16} /></button></div>
        </form>}

        {view === 'Connections' && <>
          <div className="connection-grid">{[
            ['احراز هویت مالک', !demo, 'نشست تاییدشدهٔ سمت سرور، کوکی امن HttpOnly و فقط یک حساب مالک.', 'shield', null],
            ['تحویل پیام‌ها', Boolean(import.meta.env.VITE_CONTACT_ENDPOINT), 'دریافت بریف‌های پروژه با اعتبارسنجی سمت سرور و ذخیره در دیتابیس.', 'mail', system ? `اطلاع‌رسانی ایمیل: ${system.mail.enabled ? 'فعال' : 'خاموش'}` : null],
            ['آمار بازدید', Boolean(import.meta.env.VITE_ANALYTICS_ENDPOINT), 'رویدادهای شبه‌ناشناس فقط با رضایت بازدیدکننده.', 'ai', null],
            ['دستیار هوش مصنوعی', Boolean(system?.ai.enabled), system?.ai.enabled ? `متصل از طریق ${system.ai.provider}${system.ai.model ? ` · ${system.ai.model}` : ''}. کلید فقط روی سرور است.` : 'کلید سمت سرور تنظیم نشده؛ چت سایت فعلاً از راهنمای محلی استفاده می‌کند.', 'code', 'test'],
          ].map(([title, connected, description, icon, extra]) => <section className="admin-card connection-card" key={String(title)}>
            <span className="connection-icon"><Icon name={String(icon)} size={25} /></span>
            <h2>{String(title)}</h2>
            <p>{String(description)}</p>
            {extra === 'test' ? <button className="button secondary" onClick={() => void testAi()} disabled={busy || !connected}>تست اتصال</button> : extra ? <span className="connection-extra">{extra}</span> : null}
            <span className={`connection-state ${connected ? 'configured' : ''}`}><i />{connected ? 'تنظیم شده · تحویل سمت سرور را بررسی کنید' : 'متصل نیست'}</span>
          </section>)}</div>
          <section className="admin-card security-checklist"><div className="admin-card-heading"><div><h2>ورک‌اسپیس خصوصی به بک‌اند واقعی نیاز دارد.</h2><p>هیچ گذرواژه‌ای در مرورگر ذخیره نمی‌شود و کنترل دسترسی فقط سمت سرور است.</p></div><Icon name="shield" size={24} /></div>
            {['حساب مالک با گذرواژهٔ هش‌شده (PBKDF2) و فهرست مجاز تک‌کاربره.', 'محافظت از همهٔ درخواست‌های API پشت نشست معتبر، نه فقط صفحهٔ ورود.', 'کوکی امن HttpOnly با SameSite و توکن CSRF برای تغییرات.', 'ذخیرهٔ پیام‌ها در دیتابیس با سیاست دسترسی فقط-مالک.', 'کلیدهای ایمیل و هوش مصنوعی فقط به‌صورت secret روی سرور.'].map((t, i) => <div key={t}><span>{faNumber(i + 1)}</span><p>{t}</p></div>)}
            <p className="admin-footnote">قراردادهای راه‌اندازی در فایل INTEGRATIONS.md مستند شده‌اند.</p>
          </section>
        </>}

        <div className="admin-bottom-note"><span>ورک‌اسپیس خصوصی استودیو سسِمی</span><span>{demo ? 'رکوردهای تخیلی · تغییرات فقط برای همین نشست' : 'ورک‌اسپیس خصوصی · دسترسی با نشست تاییدشدهٔ سرور'}</span></div>
      </main>
    </div>

    {toast && <div className="admin-toast" role="status"><Icon name="check" size={17} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="بستن اعلان">×</button></div>}

    {(drawer || adding) && <div className="drawer-backdrop" onClick={() => { if (!busy) { setDrawer(null); setAdding(false); } }}>
      <section className="admin-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label={adding ? 'پیام جدید' : 'جزئیات پیام'} onClick={e => e.stopPropagation()} onKeyDown={e => {
        if (e.key === 'Escape' && !busy) { setDrawer(null); setAdding(false); }
        if (e.key === 'Tab') { const items = drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]'); if (items?.length) { const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }
      }}>
        <div className="drawer-header"><span className="eyebrow">{adding ? 'گفت‌وگوی تازه' : drawer?.id}</span><button className="chat-close" onClick={() => { setDrawer(null); setAdding(false); }} disabled={busy} aria-label="بستن جزئیات">×</button></div>
        {adding ? <form onSubmit={e => { e.preventDefault(); void addLead(); }}>
          <h2>یه ارتباط جدید.</h2>
          <p className="drawer-subtitle">پیامی که خارج از سایت دریافت کرده‌ای.</p>
          <label>نام کامل<input required value={newLead.name} onChange={e => setNewLead({ ...newLead, name: e.target.value })} maxLength={100} /></label>
          <label>برند یا شرکت<input value={newLead.company} onChange={e => setNewLead({ ...newLead, company: e.target.value })} maxLength={150} /></label>
          <label>ایمیل<input type="email" dir="ltr" required value={newLead.email} onChange={e => setNewLead({ ...newLead, email: e.target.value })} /></label>
          <label>علاقه‌مندی<select value={newLead.service} onChange={e => setNewLead({ ...newLead, service: e.target.value })}>{services.map(s => <option key={s.slug} value={s.slug}>{serviceFa(s.slug)}</option>)}</select></label>
          <button className="button" disabled={busy}>{busy ? 'در حال افزودن…' : 'افزودن پیام'} +</button>
        </form>
          : drawer && <>
            <span className="drawer-avatar">{drawer.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
            <h2>{drawer.name}</h2>
            <p className="drawer-subtitle">{drawer.company || 'مشتری مستقل'} · {serviceFa(drawer.service)}</p>
            <div className="drawer-facts">
              <div><span>ایمیل</span><a href={`mailto:${drawer.email}`} dir="ltr">{drawer.email}</a></div>
              <div><span>دریافت</span><strong>{faDate(drawer.createdAt)}</strong></div>
              <div><span>منبع</span><strong>{drawer.source === 'Website' ? 'فرم سایت' : drawer.source === 'Manual' ? 'افزودن دستی' : drawer.source}</strong></div>
            </div>
            <label>مرحلهٔ ارتباط<select value={drawer.status} onChange={e => setDrawer({ ...drawer, status: e.target.value as Lead['status'] })}>{statuses.map(s => <option key={s} value={s}>{STATUS_FA[s]}</option>)}</select></label>
            <label>تاریخ پیگیری<input type="date" dir="ltr" value={drawer.followUp} onChange={e => setDrawer({ ...drawer, followUp: e.target.value })} /></label>
            <label>یادداشت خصوصی<textarea value={drawer.notes} onChange={e => setDrawer({ ...drawer, notes: e.target.value })} rows={7} placeholder="زمینه، قدم بعدی، مسیر خلاقانه…" maxLength={6000} /></label>
            <button className="button" onClick={() => void saveLead(drawer)} disabled={busy}>{busy ? 'در حال ذخیره…' : 'ذخیرهٔ تغییرات'} <Icon size={17} /></button>
            <button className="button secondary" onClick={() => void convertToProject(drawer)} disabled={busy || workspace.orders.some(o => o.leadId === drawer.id)}>{workspace.orders.some(o => o.leadId === drawer.id) ? 'پروژه قبلاً ساخته شده' : 'تبدیل به پروژه'} ↗</button>
            <p className="admin-footnote">{demo ? 'مخاطب تخیلی؛ تغییرات فقط در همین پیش‌نمایش است.' : 'یادداشت‌ها خصوصی‌اند و باید با سیاست‌های سرور محافظت شوند.'}</p>
          </>}
      </section>
    </div>}
  </div>;
}

function ProjectCard({ order, busy, save }: { order: Order; busy: boolean; save: (order: Order) => Promise<void> }) {
  const [draft, setDraft] = useState(order);
  useEffect(() => setDraft(order), [order]);
  return <form className="admin-card admin-project-card" onSubmit={e => { e.preventDefault(); void save(draft); }}>
    <div className="project-card-top"><span dir="ltr">{order.id}</span><Badge value={order.status} /></div>
    <span className="project-service-icon"><Icon name={order.service.includes('video') || order.service.includes('film') ? 'video' : 'code'} size={29} /></span>
    <h2>{order.title}</h2>
    <p>{order.client} · {order.service ? (SERVICE_FA[order.service] || order.service) : '—'}</p>
    <label>مرحله<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Order['status'] })}>{['Planning', 'In progress', 'Review', 'Delivered'].map(s => <option key={s} value={s}>{ORDER_STATUS_FA[s]}</option>)}</select></label>
    <div className="admin-field-grid">
      <label>ارزش پروژه (دلار)<input type="number" min={0} step=".01" value={draft.amount} onChange={e => setDraft({ ...draft, amount: Number(e.target.value) })} /></label>
      <label>تحویل هدف<input type="date" dir="ltr" value={draft.due} onChange={e => setDraft({ ...draft, due: e.target.value })} /></label>
    </div>
    <button className="button secondary" disabled={busy || JSON.stringify(draft) === JSON.stringify(order)}>ذخیرهٔ تغییرات پروژه <Icon size={16} /></button>
  </form>;
}
