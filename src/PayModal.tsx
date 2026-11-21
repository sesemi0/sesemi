import { useEffect, useRef, useState } from 'react';
import { getLang, onLang, t } from './i18n';
import { Icon } from './Visuals';

/**
 * Crypto checkout — wallet info comes from the server env (PAY_WALLET_ADDRESS
 * as a Cloudflare secret, never in the repo); the visitor pays on-chain and
 * submits the TXID, which lands in the owner's admin panel + Telegram.
 */
export interface PayIntent { service: string; amount: string }

type PayInfo = { wallet: string; network: string; configured: boolean };

export default function PayModal({ intent, onClose }: { intent: PayIntent; onClose: () => void }) {
  const [, bump] = useState(0);
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', txid: '', note: '', consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => onLang(() => bump(x => x + 1)), []);
  useEffect(() => {
    fetch('/api/pay/info').then(r => r.json()).then(setInfo).catch(() => setInfo({ wallet: '', network: '', configured: false }));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyWallet = async () => {
    if (!info?.wallet) return;
    try { await navigator.clipboard.writeText(info.wallet); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* blocked */ }
  };

  const submit = async () => {
    if (busy) return;
    if (!form.name.trim()) { setError(t('pay.name')); return; }
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(form.email.trim())) { setError(t('pay.email')); return; }
    if (!/^[A-Za-z0-9]{12,100}$/.test(form.txid.trim())) { setError(t('pay.txid')); return; }
    if (!form.consent) { setError(t('pay.consent')); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, service: intent.service, amount: intent.amount.replace(/[^\d.]/g, '') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Error');
      else { setDone(true); }
    } catch { setError('Network error'); }
    setBusy(false);
  };

  const field = (label: string, node: React.ReactNode) => <label className="pay-field"><span>{label}</span>{node}</label>;

  return <div className="pay-scrim" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('pay.title')}>
    <div className="pay-modal" ref={dialogRef} onClick={e => e.stopPropagation()}>
      <div className="pay-head">
        <strong>{t('pay.title')}</strong>
        <button className="pay-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
      </div>

      {done ? <div className="pay-done">
        <span className="pay-done-icon"><Icon name="check" size={30} /></span>
        <p>{t('pay.ok')}</p>
        <button className="button" onClick={onClose}>{t('common.close')}</button>
      </div>
      : <>
        <div className="pay-intent">
          <span>{t('pay.service')}: <strong>{intent.service}</strong></span>
          <strong className="pay-amount">{intent.amount}</strong>
        </div>

        {info === null ? <p className="pay-hint">…</p>
          : !info.configured ? <p className="pay-hint warn">{t('pay.notConfigured')}</p>
          : <>
            <div className="pay-step">{t('pay.step1')}</div>
            <div className="pay-wallet-card">
              <div className="pay-wallet-row"><span>{t('pay.network')}</span><b>{info.network}</b></div>
              <div className="pay-wallet-row"><span>{t('pay.wallet')}</span>
                <code dir="ltr">{info.wallet.slice(0, 18)}…{info.wallet.slice(-8)}</code>
                <button className="pay-copy" onClick={copyWallet}>{copied ? t('pay.copied') : t('pay.copy')}</button>
              </div>
              <p className="pay-hint">{t('pay.exact')}</p>
            </div>

            <div className="pay-step">{t('pay.step2')}</div>
            {field(t('pay.name'), <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={100} />)}
            {field(t('pay.email'), <input type="email" dir="ltr" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} maxLength={150} />)}
            {field(t('pay.txid'), <input dir="ltr" value={form.txid} onChange={e => setForm({ ...form, txid: e.target.value })} maxLength={100} placeholder="0x… / T…" />)}
            {field(t('pay.note'), <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2} maxLength={400} />)}
            <label className="pay-consent"><input type="checkbox" checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} /><span>{t('pay.consent')}</span></label>
            {error && <p className="pay-error" role="alert">{error}</p>}
            <button className="button pay-submit" onClick={submit} disabled={busy}>{busy ? t('pay.sending') : t('pay.submit')} <Icon /></button>
          </>}
      </>}
    </div>
  </div>;
}
