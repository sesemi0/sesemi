import { useId } from 'react';

export default function Mascot({ large = false }: { large?: boolean }) {
  const unique = useId().replaceAll(':', '');
  return <svg className={`sesemi-mascot ${large ? 'large' : ''}`} viewBox="0 0 120 130" fill="none" aria-hidden="true">
    <defs><linearGradient id={`${unique}-bot`} x1="15" y1="15" x2="105" y2="115" gradientUnits="userSpaceOnUse"><stop stopColor="#bceeff" /><stop offset=".42" stopColor="#54baff" /><stop offset="1" stopColor="#2551ba" /></linearGradient></defs>
    <ellipse cx="60" cy="121" rx="29" ry="5" fill="#43a8ff" opacity=".17" />
    <g className="mascot-body">
      <path d="M96 21H46C29 21 21 31 21 45c0 11 6 18 17 23l39 17c4 2 5 4 5 7 0 4-3 6-8 6H24l-8 17h59c19 0 30-10 30-25 0-12-6-20-18-25L48 48c-5-2-6-4-6-7 0-4 3-6 8-6h38Z" fill={`url(#${unique}-bot)`} stroke="#9edaff" strokeWidth="1" />
      <rect x="43" y="39" width="45" height="23" rx="11" fill="#081d40" transform="rotate(12 65 50)" />
      <g className="mascot-eyes"><ellipse cx="57" cy="49" rx="3" ry="4" fill="#b9f4ff" /><ellipse cx="74" cy="52" rx="3" ry="4" fill="#b9f4ff" /></g>
      <path d="M59 58q6 5 11 1" stroke="#7fd9ff" strokeWidth="1.5" strokeLinecap="round" />
      <path className="mascot-hand" d="M99 65q15-12 10-22" stroke="#73c9ff" strokeWidth="8" strokeLinecap="round" />
      <path d="m25 69-11 9" stroke="#73c9ff" strokeWidth="8" strokeLinecap="round" />
      <path d="m42 113-3 8m35-8 3 8" stroke="#62acfa" strokeWidth="6" strokeLinecap="round" />
      <path d="m61 23 4-11" stroke="#75caff" strokeWidth="3" strokeLinecap="round" /><circle cx="66" cy="9" r="4" fill="#a4edff" />
    </g>
  </svg>;
}

