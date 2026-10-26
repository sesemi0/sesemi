export function Icon({ name = 'arrow', size = 22 }: { name?: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <><path d="M18 12H6m6-6-6 6 6 6" /></>,
    code: <><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 20" /></>,
    phone: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 18h4" /></>,
    design: <><path d="m14 3 7 7-11 11H3v-7ZM11 6l7 7M3 21l6-6" /><path d="m5 3 3 3M3 5l3 3" /></>,
    ai: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4" /></>,
    video: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3ZM7 2v3m10-3v3M7 19v3m10-3v3" /></>,
    edit: <><path d="M4 7h16M4 17h16M8 3v8m8 2v8M2 12h20" /><circle cx="8" cy="12" r="2" /></>,
    brand: <><path d="m12 2 9 10-9 10L3 12ZM3 12h18M12 2v20" /></>,
    cloud: <><path d="M7 18a5 5 0 0 1-1-10 6 6 0 0 1 11-2 6 6 0 0 1 1 12M12 13v9m-3-3 3 3 3-3" /></>,
    shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6ZM8 12l3 3 5-6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 6 9 7 9-7" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.arrow}</svg>;
}

export function Ribbon({ small = false }: { small?: boolean }) {
  return <img className={small ? 'brand-symbol' : 'ribbon'} src={small ? '/brand/sesemi-mark.png' : '/brand/sesemi-star.webp'} alt="" aria-hidden="true" />;
}
