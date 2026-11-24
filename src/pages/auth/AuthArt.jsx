import { ChartColumnIncreasing, SquareCheckBig, Target, Users } from 'lucide-react';

/* Shared by the sign-in page and the app chooser, so the two look the same. */

export const FEATURES = [
  { icon: SquareCheckBig, title: 'Organize', sub: 'Your work' },
  { icon: Users, title: 'Collaborate', sub: 'With your team' },
  { icon: ChartColumnIncreasing, title: 'Track', sub: 'Progress' },
  { icon: Target, title: 'Achieve', sub: 'Your goals' },
];

/** Decorative leaves + hill in the bottom-left corner. */
export function CornerArt() {
  return (
    <svg className="lg-corner" viewBox="0 0 520 360" aria-hidden="true">
      <defs>
        <linearGradient id="lgHill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4CBF7A" />
          <stop offset="1" stopColor="#16A34A" />
        </linearGradient>
        <linearGradient id="lgLeaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5FA77A" />
          <stop offset="1" stopColor="#2F7A4C" />
        </linearGradient>
      </defs>
      <circle cx="210" cy="420" r="300" fill="#CFEFDB" />
      <circle cx="120" cy="470" r="280" fill="url(#lgHill)" opacity=".9" />
      <path d="M400 360C330 250 230 190 60 150" stroke="#9BD7B1" strokeWidth="1.5" fill="none" />
      <g opacity=".85">
        <path d="M30 160C40 110 60 70 40 20C10 60 0 120 30 160z" fill="url(#lgLeaf)" />
        <path d="M40 200C80 170 120 140 130 90C90 100 50 140 40 200z" fill="url(#lgLeaf)" />
        <path d="M20 260C60 250 100 230 120 190C80 190 40 220 20 260z" fill="url(#lgLeaf)" opacity=".8" />
        <path d="M30 160C30 210 25 250 10 300" stroke="#2F7A4C" strokeWidth="3" fill="none" />
      </g>
    </svg>
  );
}
