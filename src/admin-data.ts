export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Won' | 'Lost';
export type Lead = { id: string; name: string; company: string; email: string; service: string; status: LeadStatus; createdAt: string; notes: string; source: string; followUp: string };
export type Order = { id: string; leadId: string; title: string; client: string; service: string; status: 'Planning' | 'In progress' | 'Review' | 'Delivered'; amount: number; due: string };
export type DayStat = { date: string; visitors: number; pageviews: number; enquiries: number };
export type Settings = { studioName: string; replyEmail: string; notifications: boolean; assistantInstructions: string };
export type Workspace = { leads: Lead[]; orders: Order[]; daily: DayStat[]; pages: { path: string; views: number }[]; sources: { name: string; visits: number }[]; settings: Settings };

export const adminBase = (import.meta.env.VITE_ADMIN_API_BASE || '').replace(/\/$/, '');

export class AdminError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(message: string, status = 0, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function adminRequest<T>(path: string, options: RequestInit = {}, csrf = ''): Promise<T> {
  if (!adminBase) throw new AdminError('سرویس مدیریت متصل نیست.');
  const response = await fetch(`${adminBase}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...options.headers },
    signal: options.signal || AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try { body = await response.json() as Record<string, unknown>; } catch { /* empty body */ }
    const message = typeof body.error === 'string' ? body.error
      : response.status === 401 || response.status === 403 ? 'نشست شما معتبر نیست. دوباره وارد شوید.'
      : 'سرور نتوانست این درخواست را کامل کند.';
    throw new AdminError(message, response.status, body);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function demoWorkspace(): Workspace {
  const date = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
  const leads: Lead[] = [
    ['Avery Morgan', 'Forma Studio', 'web-design', 'New', 0, 'Direct'],
    ['Jordan Ellis', 'Cobalt Goods', 'ai-advertising-videos', 'Qualified', -1, 'Organic search'],
    ['Riley Chen', 'Northline', 'brand-identity', 'Contacted', -2, 'Referral'],
    ['Taylor Brooks', 'Arc Objects', 'ai-video-editing', 'Won', -3, 'Direct'],
    ['Casey Rivera', 'Fieldwork', 'ui-ux-design', 'New', -5, 'Organic search'],
    ['Morgan Lee', 'Still House', 'prompt-engineering', 'Lost', -7, 'Referral'],
    ['Alex Parker', 'Orbit Supply', 'web-design', 'Won', -9, 'Organic search'],
    ['Sam Quinn', 'Everform', 'ai-advertising-videos', 'Qualified', -12, 'Direct'],
  ].map(([name, company, service, status, days, source], i) => ({ id: `DEMO-${1001 + i}`, name: String(name), company: String(company), email: `contact${i + 1}@example.com`, service: String(service), status: status as LeadStatus, createdAt: date(Number(days)), source: String(source), notes: i === 1 ? 'برای یک تیزر ۲۰ ثانیه‌ای معرفی محصول مشتاق است. دربارهٔ تاریخ عرضه و کانال‌های منتخب بپرس.' : '', followUp: i === 1 ? date(2) : '' }));
  return {
    leads,
    orders: [
      { id: 'DEMO-P101', leadId: leads[3].id, title: 'Spring campaign edits', client: 'Arc Objects', service: 'ai-video-editing', status: 'In progress', amount: 1200, due: date(7) },
      { id: 'DEMO-P102', leadId: leads[6].id, title: 'Orbit brand website', client: 'Orbit Supply', service: 'web-design', status: 'Review', amount: 3600, due: date(3) },
    ],
    daily: Array.from({ length: 30 }, (_, i) => ({ date: date(i - 29), visitors: 35 + ((i * 17 + 9) % 64), pageviews: 74 + ((i * 23 + 11) % 117), enquiries: i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : 0 })),
    pages: [{ path: '/', views: 1682 }, { path: '/services/ai-advertising-videos', views: 846 }, { path: '/services/web-design', views: 632 }, { path: '/start', views: 324 }],
    sources: [{ name: 'Organic search', visits: 856 }, { name: 'Direct', visits: 614 }, { name: 'Referral', visits: 312 }],
    settings: { studioName: 'SESEMI', replyEmail: '', notifications: false, assistantInstructions: 'Help visitors explore web design, AI advertising films, editing, brand identity and prompt engineering. Be concise. Never invent prices, delivery dates or client work.' },
  };
}

export function csvDownload(rows: (string | number)[][], name: string) {
  const safe = (value: string | number) => {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(['\uFEFF' + rows.map(row => row.map(safe).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
