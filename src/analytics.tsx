import { useEffect, useState } from 'react';

const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT || '';
type Consent = 'accepted' | 'declined' | null;
function readConsent(): Consent {
  try { const value = localStorage.getItem('sesemi-analytics-consent'); return value === 'accepted' || value === 'declined' ? value : null; } catch { return null; }
}
export function trackEvent(name: 'page_view' | 'assistant_open' | 'brief_submitted') {
  if (!endpoint || readConsent() !== 'accepted' || location.pathname.startsWith('/admin') || navigator.doNotTrack === '1') return;
  try {
    let sessionId = sessionStorage.getItem('sesemi-session');
    if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem('sesemi-session', sessionId); }
    let referrer = '';
    try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch { /* No valid referrer. */ }
    void fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', keepalive: true, body: JSON.stringify({ name, path: location.pathname, sessionId, referrer, at: new Date().toISOString() }) }).catch(() => {});
  } catch { /* Storage restrictions disable analytics, not the website. */ }
}
export function AnalyticsConsent() {
  const [visible, setVisible] = useState(false);
  const [consent, setConsent] = useState<Consent>(readConsent);
  useEffect(() => {
    if (endpoint && !consent) setVisible(true);
    const show = () => setVisible(true);
    window.addEventListener('sesemi:privacy', show);
    const pageKey = `${location.pathname}:${performance.timeOrigin}`;
    const timer = setTimeout(() => {
      try {
        if (readConsent() === 'accepted' && sessionStorage.getItem('sesemi-last-view') !== pageKey) {
          trackEvent('page_view');
          sessionStorage.setItem('sesemi-last-view', pageKey);
        }
      } catch { /* No tracking if storage is unavailable. */ }
    }, 50);
    return () => { clearTimeout(timer); window.removeEventListener('sesemi:privacy', show); };
  }, [consent]);
  if (!visible) return null;
  function choose(value: 'accepted' | 'declined') {
    try { localStorage.setItem('sesemi-analytics-consent', value); } catch { /* Choice applies for this view only. */ }
    setConsent(value); setVisible(false);
  }
  return <section className="consent-panel" role="dialog" aria-label="Analytics preferences"><div className="eyebrow">A LITTLE TRANSPARENCY</div><h2>Your visit. Your choice.</h2><p>{endpoint ? 'Allow optional, pseudonymous visit analytics to help us understand what works. We do not identify visitors by name.' : 'Analytics is not connected. No visit events are being collected. You can set your preference for when it is enabled.'}</p><a href="/privacy">Read the privacy notice</a><div><button className="button secondary" onClick={() => choose('declined')}>No thanks</button><button className="button" onClick={() => choose('accepted')}>Allow analytics</button></div></section>;
}
