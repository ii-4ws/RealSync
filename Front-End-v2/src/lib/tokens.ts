// Design tokens — CSS variable references + static color values
// Matches the :root definitions in index.css

export const t = {
  // Backgrounds (CSS vars — theme-aware)
  bg0: 'var(--bg0)',
  bg1: 'var(--bg1)',
  bg2: 'var(--bg2)',
  bg3: 'var(--bg3)',
  bg4: 'var(--bg4)',

  // Text (CSS vars — theme-aware)
  t1: 'var(--t1)',
  t2: 'var(--t2)',
  t3: 'var(--t3)',
  t4: 'var(--t4)',

  // Borders (CSS vars — theme-aware)
  b1: 'var(--b1)',
  b2: 'var(--b2)',
  b3: 'var(--b3)',

  // Accent colors (static — same in both themes)
  cyan: '#22D3EE',
  blue: '#3B82F6',
  violet: '#8B5CF6',
  green: '#10B981',
  red: '#EF4444',
  amber: '#F59E0B',
  orange: '#F97316',
} as const;

// Default export for shorter import alias ($)
export default t;

// Severity level configs
export const SEVERITY_CONFIG = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', label: 'Critical' },
  high: { color: '#F97316', bg: 'rgba(249,115,22,0.08)', label: 'High' },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', label: 'Medium' },
  low: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', label: 'Low' },
} as const;

// Easing curve used throughout the app (custom ease)
export const EASE = [0.16, 1, 0.3, 1] as const;

// Shared label style
export const LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: t.t3,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 500,
};

// Shared mono/tabular-nums style
export const MONO_STYLE: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontFeatureSettings: "'tnum' 1",
  fontVariantNumeric: 'tabular-nums',
};

// Get trust score color based on value
export function trustColor(score: number): string {
  if (score >= 97) return t.green;
  if (score >= 90) return t.cyan;
  if (score >= 80) return t.amber;
  return t.red;
}

// Theme helpers
export function getTheme(): 'dark' | 'light' {
  return (localStorage.getItem('rs-theme') ?? 'dark') as 'dark' | 'light';
}

export function setTheme(theme: 'dark' | 'light') {
  const root = document.documentElement;
  if (theme === 'light') {
    root.classList.add('light');
  } else {
    root.classList.remove('light');
  }
  localStorage.setItem('rs-theme', theme);
}

export function initTheme() {
  setTheme(getTheme());
}
