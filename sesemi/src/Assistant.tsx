import { useEffect, useRef, useState } from 'react';
import Mascot from './Mascot';
import services from './services.json';
import { trackEvent } from './analytics';

type Message = { role: 'user' | 'assistant'; content: string };
const agentEndpoint = import.meta.env.VITE_AGENT_ENDPOINT || '';
const contactEndpoint = import.meta.env.VITE_CONTACT_ENDPOINT || '';
const greeting: Message = { role: 'assistant', content: "Hi, I’m Sesi, your studio guide. A new website, a brand film, or a fresh visual identity — what are you imagining?" };

function guide(text: string) {
  if (/price|cost|budget|quote/i.test(text)) return "Every project is scoped individually. Share what you need, your timeline and any budget range through the short brief. This guide cannot provide a binding quote.";
  if (/video|film|teaser|advert|reel|edit/i.test(text)) return "We create AI advertising films and brand teasers, and edit footage into polished promotional content. Think concept, storyboard, AI visuals, editing and channel-ready exports. Is this for a brand launch, a product or social media?";
  if (/logo|identity|brand/i.test(text)) return "We can help with a logo, color and typography direction, and a cohesive visual identity. Is this a new brand or a refresh of an existing one?";
  if (/prompt|workflow/i.test(text)) return "We develop structured prompt libraries and repeatable image and video workflows around your brand. What do you want to create more consistently?";
  if (/web|site|landing|shop|ui|ux/i.test(text)) return "We design and build responsive brand websites and landing pages, with clear user journeys and on-page SEO. What should your visitors do: enquire, discover a product, or get in touch?";
  if (/hello|hi\\b|hey/i.test(text)) return "Hello! Happy to help you find the right service. Tell me a little about your brand and what you want to make.";
  if (/human|contact|start|book|call|person/i.test(text)) return "Use “Start a brief” below to leave your preferred contact details. I’m a local studio guide, not a live team member. If delivery is not connected, the brief will clearly say so.";
  return "I’m a local guide with preset answers, not a live AI agent. I can explain web design, AI advertising films, video editing, branding or prompt engineering. Which one are you interested in?";
}

export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const show = () => { trigger.current = document.activeElement as HTMLElement; setOpen(true); trackEvent('assistant_open'); };
    window.addEventListener('sesemi:chat', show);
    return () => { window.removeEventListener('sesemi:chat', show); abort.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, pending, open]);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : launcher.current)?.focus({ preventScroll: true }));
  }
  async function send(value: string) {
    if (!value.trim() || sending.current) return;
    sending.current = true;
    const next: Message[] = [...messages, { role: 'user', content: value.trim().slice(0, 2000) }];
    setMessages(next); setInput(''); setPending(true); setError('');
    if (!agentEndpoint) { setMessages([...next, { role: 'assistant', content: guide(value) }]); setPending(false); sending.current = false; return; }
    const controller = new AbortController();
    abort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(agentEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.slice(-20), language: 'en' }), signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error();
      setMessages([...next, { role: 'assistant', content: data.reply }]);
    } catch {
      if (!controller.signal.aborted || abort.current === controller) {
        setError('Couldn’t reach the assistant. Your message is preserved. Try again.');
        setInput(value); setMessages(next.slice(0, -1));
      }
    } finally { clearTimeout(timeout); setPending(false); sending.current = false; }
  }
  return <div className="assistant-root">
    {open && <section ref={panel} className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="sesi-title" onKeyDown={e => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const items = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }}>
      <header className="assistant-head"><Mascot /><div><strong id="sesi-title">Sesi, your studio sidekick</strong><small><span className="live-dot" /> {agentEndpoint ? 'Connected assistant' : 'Local guide · not a live agent'}</small></div><button onClick={close} className="chat-close" aria-label="Close chat">×</button></header>
      <div className="chat-mode-note">A little direction for your next big idea. No sensitive details, please.</div>
      <div ref={log} className="chat-messages" data-lenis-prevent role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text">{messages.map((m, i) => <div className={`chat-bubble ${m.role}`} key={i}><span className="sr-only">{m.role === 'assistant' ? 'Sesi: ' : 'You: '}</span>{m.content}</div>)}{pending && <div className="typing" role="status" aria-label="Preparing a reply"><i /><i /><i /></div>}</div>
      <div className="chat-suggestions">{['I need a website', 'An AI brand film', 'Logo & identity'].map(text => <button key={text} onClick={() => void send(text)} disabled={pending}>{text}</button>)}</div>
      {error && <p className="chat-error" role="alert">{error}</p>}
      <form className="chat-composer" onSubmit={e => { e.preventDefault(); void send(input); }}><input ref={field} aria-label="Your message" placeholder="Tell me what you have in mind…" value={input} onChange={e => setInput(e.target.value)} maxLength={2000} readOnly={pending} /><button type="submit" disabled={!input.trim() || pending} aria-label="Send message">↑</button></form>
      <div className="chat-bottom"><button onClick={() => { if (!pending) { setMessages([greeting]); setError(''); setInput(''); } }} disabled={pending}>New conversation</button><a href="/start" onClick={close}>Start a brief ↗</a></div>
    </section>}
    <button ref={launcher} className={`assistant-launcher ${open ? 'is-open' : ''}`} onClick={() => { if (open) close(); else { trigger.current = launcher.current; setOpen(true); trackEvent('assistant_open'); } }} aria-expanded={open} aria-label={open ? 'Close Sesi' : 'Ask Sesi, the studio guide'}><Mascot /><span>Ask Sesi<small>A little help getting started</small></span><span className="launcher-plus">{open ? '−' : '+'}</span></button>
    {open && <button className="chat-scrim" aria-label="Close conversation" onClick={close} tabIndex={-1} />}
  </div>;
}

export function QuickContact({ page = false }: { page?: boolean }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [service, setService] = useState(() => new URLSearchParams(location.search).get('service') || '');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'draft' | 'error'>('idle');
  const [copyState, setCopyState] = useState('');
  const [agreed, setAgreed] = useState(false);
  const busy = useRef(false);
  const summary = `SESEMI project brief\nName: ${name}\nContact: ${contact}\nService: ${services.find(s => s.slug === service)?.title || 'Not sure yet'}\nProject: ${message}`;
  async function submit() {
    if (busy.current) return;
    if (!contactEndpoint) { setState('draft'); return; }
    busy.current = true; setState('sending');
    try {
      const response = await fetch(contactEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, contact, message, service, consent: agreed }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.ok !== true) throw new Error();
      setState('sent'); trackEvent('brief_submitted');
    } catch { setState('error'); } finally { busy.current = false; }
  }
  return <section className={page ? 'container quick-page' : 'section container contact-section'} id="contact">
    <div className="contact-copy">{page && <a className="back-link" href="/">← Back to the studio</a>}<div className="eyebrow section-kicker"><span /> BIG IDEAS. SIMPLE BEGINNINGS.</div><h1 className={page ? 'contact-title' : 'sr-only'}>{page ? 'Let’s make something good.' : 'Start a project with SESEMI'}</h1>{!page && <h2>Something in mind?<br /><span>Let’s give it a start.</span></h2>}<p>No long questionnaires. Just a name, a way to reach you<br className="desktop-break" /> and a little about what you want to create.</p><button className="button secondary" onClick={() => window.dispatchEvent(new Event('sesemi:chat'))}>Ask Sesi first <span>↗</span></button><div className="contact-mascot"><Mascot large /><span>Your spark.<br /><strong>Our creative energy.</strong></span></div></div>
    <div className="contact-form-wrap">{state === 'sent' ? <div className="success" role="status"><h2>Brief received.</h2><p>Thanks, {name}. We’ll use your preferred contact details to continue the conversation.</p><button className="button secondary" onClick={() => { setState('idle'); setName(''); setContact(''); setMessage(''); setAgreed(false); }}>Create another brief</button></div> : state === 'draft' ? <div className="success" role="status"><h2>Your brief is ready.</h2><p>Delivery is not connected yet. Nothing has been sent or saved to the studio CRM. You can copy your brief below.</p><pre className="contact-summary">{summary}</pre><button className="button" onClick={async () => { try { await navigator.clipboard.writeText(summary); setCopyState('Copied to clipboard'); } catch { setCopyState('Copy unavailable. Select and copy the summary above.'); } }}>Copy my brief</button><p aria-live="polite">{copyState}</p><button className="quiet-link" onClick={() => setState('idle')}>Edit details</button></div> : <form onSubmit={e => { e.preventDefault(); void submit(); }}><div className="form-title"><h2>A simple hello.</h2><span>ABOUT A MINUTE</span></div><div className="form-row"><label>Your name<input value={name} onChange={e => setName(e.target.value)} required autoComplete="name" placeholder="What should we call you?" maxLength={100} /></label><label>Email address<input type="email" value={contact} onChange={e => setContact(e.target.value)} required autoComplete="email" maxLength={150} placeholder="you@yourbrand.com" /></label></div><label>I’m interested in<select value={service} onChange={e => setService(e.target.value)}><option value="">Let’s figure it out together</option>{services.map(s => <option key={s.slug} value={s.slug}>{s.short}</option>)}</select></label><label>A little about your idea <span className="optional">optional</span><textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="A website for my brand, a product teaser, a fresh identity…" rows={3} maxLength={3000} /></label><label className="consent-check"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} required /><span>I agree to the use of these details to respond to my enquiry. <a href="/privacy">Privacy notice</a></span></label>{state === 'error' && <p role="alert" className="chat-error">We couldn’t deliver your brief. Your details are still here. Please try again.</p>}<button className="button submit" disabled={state === 'sending'} type="submit">{state === 'sending' ? 'Sending your brief…' : contactEndpoint ? 'Send my brief' : 'Prepare my brief'} <span>→</span></button><p className="privacy">{contactEndpoint ? 'Used only to respond to your enquiry. No marketing sign-up.' : 'Preview mode · delivery will be enabled when the service is connected.'}</p></form>}</div>
  </section>;
}
