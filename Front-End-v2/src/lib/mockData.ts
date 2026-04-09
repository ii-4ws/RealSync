// Mock data — reconstructed from compiled bundle
// All data is static for demo purposes

export type SessionStatus = 'connected' | 'joining' | 'completed';
export type SessionType = 'official' | 'business' | 'friends';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Session {
  id: string;
  title: string;
  type: SessionType;
  createdAt: string;
  duration: string;
  status: SessionStatus;
  alerts: number;
  zoomUrl?: string;
}

export interface AlertItem {
  id: number;
  sev: AlertSeverity;
  cat: string;
  msg: string;
  time: string;
}

export interface TrustPoint {
  t: string;
  score: number;
}

export interface Report {
  id: string;
  title: string;
  date: string;
  duration: string;
  durationMins: number;
  participants: number;
  trustAvg: number;
  alerts: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  timeline: AlertItem[];
  trustCurve: TrustPoint[];
}

export interface FaqCategory {
  category: string;
  iconName: string;
  items: { q: string; a: string }[];
}

// Dashboard live alerts
export const LIVE_ALERTS: AlertItem[] = [
  { id: 1, sev: 'critical', cat: 'IDENTITY', msg: 'Face substitution pattern — participant #2', time: '14:31' },
  { id: 2, sev: 'high', cat: 'DEEPFAKE', msg: 'Neural synthesis artifacts in video stream', time: '14:28' },
  { id: 3, sev: 'medium', cat: 'EMOTION', msg: 'Sustained elevated anger — participant #3', time: '14:19' },
  { id: 4, sev: 'low', cat: 'AUDIO', msg: 'Codec degradation on audio channel 2', time: '14:07' },
];

// Dashboard timeline data (30-min session)
export const TIMELINE_DATA: TrustPoint[] = Array.from({ length: 30 }, (_, i) => ({
  t: `${i}:00`,
  score: Math.round(85 + Math.random() * 14 + (i > 20 ? 3 : 0)),
}));

// Sessions list
export const INITIAL_SESSIONS: Session[] = [
  { id: 's-001', title: 'Q1 Board Review', type: 'official', createdAt: 'Mar 25, 2026', duration: '42:17', status: 'connected', alerts: 3, zoomUrl: 'https://zoom.us/j/123456789' },
  { id: 's-002', title: 'Investor Sync — Series B', type: 'business', createdAt: 'Mar 25, 2026', duration: '08:04', status: 'joining', alerts: 0, zoomUrl: 'https://zoom.us/j/987654321' },
  { id: 's-003', title: 'Product Strategy Workshop', type: 'business', createdAt: 'Mar 24, 2026', duration: '1:14:52', status: 'completed', alerts: 7 },
  { id: 's-004', title: 'Engineering All-Hands', type: 'official', createdAt: 'Mar 23, 2026', duration: '58:31', status: 'completed', alerts: 1 },
  { id: 's-005', title: 'Team Retrospective', type: 'friends', createdAt: 'Mar 22, 2026', duration: '34:09', status: 'completed', alerts: 0 },
  { id: 's-006', title: 'UX Review — Dashboard v3', type: 'business', createdAt: 'Mar 21, 2026', duration: '47:58', status: 'completed', alerts: 2 },
];

// Reports list
export const REPORTS: Report[] = [
  {
    id: 'rpt-001',
    title: 'Q1 Board Review',
    date: 'Mar 24, 2026',
    duration: '47m 12s',
    durationMins: 47,
    participants: 6,
    trustAvg: 94,
    alerts: { total: 4, critical: 1, high: 1, medium: 1, low: 1 },
    timeline: [
      { id: 1, sev: 'low', cat: 'AUDIO', msg: 'Minor codec artefacts on channel 3', time: '09:04' },
      { id: 2, sev: 'medium', cat: 'EMOTION', msg: 'Elevated stress markers — participant #4', time: '09:21' },
      { id: 3, sev: 'high', cat: 'DEEPFAKE', msg: 'Neural synthesis artefacts in video stream', time: '09:38' },
      { id: 4, sev: 'critical', cat: 'IDENTITY', msg: 'Face substitution pattern — participant #2', time: '09:44' },
    ],
    trustCurve: [
      { t: '00m', score: 97 }, { t: '05m', score: 96 }, { t: '10m', score: 95 },
      { t: '15m', score: 96 }, { t: '20m', score: 93 }, { t: '25m', score: 91 },
      { t: '30m', score: 89 }, { t: '35m', score: 88 }, { t: '40m', score: 87 },
      { t: '45m', score: 90 }, { t: '47m', score: 94 },
    ],
  },
  {
    id: 'rpt-002',
    title: 'Investor Briefing — Series B',
    date: 'Mar 22, 2026',
    duration: '1h 14m',
    durationMins: 74,
    participants: 4,
    trustAvg: 98,
    alerts: { total: 1, critical: 0, high: 0, medium: 1, low: 0 },
    timeline: [
      { id: 1, sev: 'medium', cat: 'BEHAVIOR', msg: 'Unusual gaze pattern — participant #1', time: '11:52' },
    ],
    trustCurve: [
      { t: '00m', score: 99 }, { t: '10m', score: 98 }, { t: '20m', score: 99 },
      { t: '30m', score: 97 }, { t: '40m', score: 98 }, { t: '50m', score: 97 },
      { t: '60m', score: 98 }, { t: '70m', score: 99 }, { t: '74m', score: 98 },
    ],
  },
  {
    id: 'rpt-003',
    title: 'Engineering All-Hands',
    date: 'Mar 20, 2026',
    duration: '58m 40s',
    durationMins: 58,
    participants: 12,
    trustAvg: 91,
    alerts: { total: 5, critical: 0, high: 2, medium: 2, low: 1 },
    timeline: [
      { id: 1, sev: 'low', cat: 'AUDIO', msg: 'Background noise spike — participant #7', time: '14:03' },
      { id: 2, sev: 'medium', cat: 'EMOTION', msg: 'Frustration pattern — participant #3', time: '14:17' },
      { id: 3, sev: 'high', cat: 'DEEPFAKE', msg: 'Compression artefact signature detected', time: '14:29' },
      { id: 4, sev: 'medium', cat: 'BEHAVIOR', msg: 'Off-camera glance pattern — participant #9', time: '14:38' },
      { id: 5, sev: 'high', cat: 'IDENTITY', msg: 'Partial face occlusion — participant #11', time: '14:51' },
    ],
    trustCurve: [
      { t: '00m', score: 94 }, { t: '10m', score: 93 }, { t: '20m', score: 92 },
      { t: '30m', score: 90 }, { t: '40m', score: 88 }, { t: '50m', score: 91 },
      { t: '58m', score: 91 },
    ],
  },
  {
    id: 'rpt-004',
    title: 'Legal — NDA Signing Call',
    date: 'Mar 18, 2026',
    duration: '22m 05s',
    durationMins: 22,
    participants: 3,
    trustAvg: 99,
    alerts: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
    timeline: [],
    trustCurve: [
      { t: '00m', score: 99 }, { t: '05m', score: 100 }, { t: '10m', score: 99 },
      { t: '15m', score: 100 }, { t: '20m', score: 99 }, { t: '22m', score: 99 },
    ],
  },
  {
    id: 'rpt-005',
    title: 'Product Roadmap Sync',
    date: 'Mar 15, 2026',
    duration: '35m 20s',
    durationMins: 35,
    participants: 5,
    trustAvg: 96,
    alerts: { total: 2, critical: 0, high: 0, medium: 1, low: 1 },
    timeline: [
      { id: 1, sev: 'low', cat: 'AUDIO', msg: 'Echo detected on participant #2', time: '10:11' },
      { id: 2, sev: 'medium', cat: 'EMOTION', msg: 'Disengagement pattern — participant #5', time: '10:28' },
    ],
    trustCurve: [
      { t: '00m', score: 97 }, { t: '05m', score: 97 }, { t: '10m', score: 96 },
      { t: '15m', score: 96 }, { t: '20m', score: 95 }, { t: '25m', score: 96 },
      { t: '30m', score: 97 }, { t: '35m', score: 96 },
    ],
  },
];

// FAQ data
export const FAQ_DATA: FaqCategory[] = [
  {
    category: 'Getting Started',
    iconName: 'zap',
    items: [
      { q: 'How does RealSync detect deepfakes?', a: 'RealSync uses an ensemble of 5 AI models — XceptionNet, EfficientNet, audio analysis, emotion detection, and behavioral analysis — to analyze video meeting participants in real-time. Each model provides a confidence score, which are fused into a unified trust score.' },
      { q: 'What meeting platforms are supported?', a: 'Currently, RealSync supports Zoom meetings. The bot joins as a headless participant via the meeting URL and captures video frames, audio streams, and closed captions for analysis.' },
      { q: 'How do I start my first session?', a: 'Navigate to Sessions, click "New Session", enter your Zoom meeting URL and a title, then click Start. The RealSync bot will join the meeting within 10-15 seconds and begin real-time analysis.' },
    ],
  },
  {
    category: 'Detection & Analysis',
    iconName: 'shield',
    items: [
      { q: 'What is the Trust Score?', a: 'The Trust Score is a weighted composite of all detection models (visual deepfake, audio manipulation, emotion analysis, and behavioral patterns). A score above 95% indicates high confidence in participant authenticity. Scores below 85% trigger alerts.' },
      { q: 'How accurate is the deepfake detection?', a: 'Our ensemble approach achieves 98.65% accuracy on standard benchmarks (FaceForensics++, DFDC). Real-world accuracy depends on video quality, lighting, and the sophistication of the deepfake technique.' },
      { q: 'What triggers an alert?', a: 'Alerts are triggered by the Alert Fusion Engine when any detection model exceeds configured thresholds. Alert severity (critical, high, medium, low) is determined by the confidence level and threat type.' },
    ],
  },
  {
    category: 'Privacy & Security',
    iconName: 'lock',
    items: [
      { q: 'Is meeting data stored?', a: 'Session metrics, alerts, and transcripts are stored in Supabase with row-level security. Video frames are processed in real-time and never stored permanently. You can delete session data at any time from the Reports screen.' },
      { q: 'Who can access my session data?', a: 'Only the session creator can view their session data, alerts, and reports. Authentication is enforced via Supabase Auth with JWT tokens. Corporate email verification is required.' },
      { q: 'Does RealSync record meetings?', a: 'No. RealSync captures individual video frames (at ~0.5 FPS) and audio chunks for analysis only. These are processed in real-time by the AI service and discarded after analysis. No continuous recording is stored.' },
    ],
  },
  {
    category: 'Account & Access',
    iconName: 'users',
    items: [
      { q: "Why can't I sign in with Gmail?", a: 'RealSync requires corporate or institutional email addresses for security. Personal email providers (Gmail, Yahoo, Outlook, etc.) are blocked. Contact your IT administrator if you need access.' },
      { q: 'How do I enable two-factor authentication?', a: 'Go to Settings → Security and toggle "Two-Factor Authentication". You\'ll be prompted to scan a QR code with your authenticator app (Google Authenticator, Authy, etc.).' },
    ],
  },
];
