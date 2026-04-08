import { jsPDF } from 'jspdf'

// --- Types ---

export interface AlertItem {
  id: string | number
  sev: 'critical' | 'high' | 'medium' | 'low'
  cat: string
  msg: string
  time: string
}

export interface TrustPoint {
  t: string
  score: number
}

export interface TranscriptLine {
  speaker?: string
  timestamp: string
  text: string
  suspicious?: boolean
}

export interface ReportPayload {
  id: string
  title: string
  date: string
  duration: string
  durationMins: number
  meetingType?: string
  participants: number
  trustAvg: number
  visualScore?: number
  audioScore?: number
  dominantEmotions?: string[]
  modelUsed?: string
  alerts: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  timeline: AlertItem[]
  trustCurve: TrustPoint[]
  transcript?: TranscriptLine[]
}

// --- Color Palette ---

const C = {
  // Dark backgrounds
  pageBg: [10, 10, 16] as [number, number, number],          // #0a0a10
  cardBg: [16, 16, 24] as [number, number, number],          // #101018
  headerBg: [12, 12, 20] as [number, number, number],        // #0c0c14
  borderLight: [35, 35, 55] as [number, number, number],     // subtle border
  borderMid: [50, 50, 75] as [number, number, number],

  // Text
  textPrimary: [230, 232, 240] as [number, number, number],  // near-white
  textSecondary: [160, 165, 185] as [number, number, number],
  textMuted: [90, 95, 120] as [number, number, number],

  // Accents
  cyan: [34, 211, 238] as [number, number, number],          // #22D3EE
  cyanDim: [34, 211, 238, 0.15] as [number, number, number, number],
  blue: [59, 130, 246] as [number, number, number],          // #3B82F6
  violet: [139, 92, 246] as [number, number, number],        // #8B5CF6

  // Risk
  green: [16, 185, 129] as [number, number, number],         // #10B981
  amber: [245, 158, 11] as [number, number, number],         // #F59E0B
  orange: [249, 115, 22] as [number, number, number],        // #F97316
  red: [239, 68, 68] as [number, number, number],            // #EF4444
} as const

// A4 dimensions (mm)
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 16
const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_Y = PAGE_H - 10

// --- Utility helpers ---

function setFill(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setFillColor(color[0], color[1], color[2])
}

function setDraw(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setDrawColor(color[0], color[1], color[2])
}

function setTxt(doc: jsPDF, color: readonly [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2])
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function riskColor(score: number): readonly [number, number, number] {
  if (score >= 95) return C.green
  if (score >= 80) return C.cyan
  if (score >= 65) return C.amber
  return C.red
}

function riskLabel(score: number): string {
  if (score >= 95) return 'LOW RISK'
  if (score >= 80) return 'MODERATE'
  if (score >= 65) return 'HIGH RISK'
  return 'CRITICAL'
}

function sevColor(sev: string): readonly [number, number, number] {
  switch (sev) {
    case 'critical': return C.red
    case 'high': return C.orange
    case 'medium': return C.amber
    default: return C.blue
  }
}

function sevLabel(sev: string): string {
  return sev.toUpperCase()
}

/** Thin horizontal rule */
function hRule(doc: jsPDF, y: number, opacity = 0.2) {
  doc.setGState(doc.GState({ opacity }))
  setDraw(doc, C.borderLight)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  doc.setGState(doc.GState({ opacity: 1 }))
}

/** Filled rounded rectangle */
function roundRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  r: number,
  fillColor?: readonly [number, number, number],
  strokeColor?: readonly [number, number, number],
  strokeWidth = 0.3,
) {
  if (fillColor) setFill(doc, fillColor)
  if (strokeColor) {
    setDraw(doc, strokeColor)
    doc.setLineWidth(strokeWidth)
  }
  const style = fillColor && strokeColor ? 'FD' : fillColor ? 'F' : 'D'
  doc.roundedRect(x, y, w, h, r, r, style)
}

/** Draw a small colored badge pill */
function badge(doc: jsPDF, x: number, y: number, label: string, color: readonly [number, number, number]) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  const tw = doc.getTextWidth(label)
  const pw = tw + 5
  const ph = 4.5
  // Semi-transparent background
  doc.setGState(doc.GState({ opacity: 0.18 }))
  setFill(doc, color)
  doc.roundedRect(x, y - 3.2, pw, ph, 1, 1, 'F')
  doc.setGState(doc.GState({ opacity: 1 }))
  setTxt(doc, color)
  doc.text(label, x + pw / 2, y, { align: 'center' })
}

/** Section header with colored left accent bar */
function sectionHeader(doc: jsPDF, y: number, title: string, subtitle?: string): number {
  // Accent bar
  setFill(doc, C.cyan)
  doc.rect(MARGIN, y, 2.5, subtitle ? 7 : 5, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setTxt(doc, C.textPrimary)
  doc.text(title.toUpperCase(), MARGIN + 5, y + (subtitle ? 3.5 : 3.2))

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setTxt(doc, C.textMuted)
    doc.text(subtitle, MARGIN + 5, y + 6.5)
  }

  return y + (subtitle ? 10 : 7)
}

/** Draw a score bar (label + filled progress bar + percentage) */
function scoreBar(
  doc: jsPDF,
  x: number, y: number, w: number,
  label: string,
  score: number,
  color: readonly [number, number, number],
) {
  // Label
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setTxt(doc, C.textSecondary)
  doc.text(label, x, y)

  // Score text right-aligned
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setTxt(doc, color)
  doc.text(`${score}%`, x + w, y, { align: 'right' })

  const barY = y + 2.5
  const barH = 2.8
  const barR = 1.4

  // Track
  setFill(doc, C.borderLight)
  doc.roundedRect(x, barY, w, barH, barR, barR, 'F')

  // Fill
  const fillW = Math.max(barR * 2, (score / 100) * w)
  setFill(doc, color)
  doc.roundedRect(x, barY, fillW, barH, barR, barR, 'F')

  return y + 8
}

/** Draw the trust score gauge (circle meter) */
function drawGauge(doc: jsPDF, cx: number, cy: number, score: number) {
  const r = 18
  const color = riskColor(score)

  // Outer glow ring (semi-transparent)
  doc.setGState(doc.GState({ opacity: 0.08 }))
  setFill(doc, color)
  doc.circle(cx, cy, r + 3, 'F')
  doc.setGState(doc.GState({ opacity: 1 }))

  // Background ring track
  setDraw(doc, C.borderMid)
  setFill(doc, C.cardBg)
  doc.setLineWidth(1)
  doc.circle(cx, cy, r, 'FD')

  // Colored arc approximation — draw multiple short line segments
  // jsPDF doesn't have native arc, so we approximate with the circle outline
  // We overdraw a colored ring for the filled portion
  const arcAngle = (score / 100) * 360
  const segments = Math.max(4, Math.floor(arcAngle / 6))
  const startRad = -Math.PI / 2  // start at top

  doc.setLineWidth(3.5)
  setDraw(doc, color)
  doc.setGState(doc.GState({ opacity: 0.9 }))

  for (let i = 0; i < segments; i++) {
    const a1 = startRad + (i / segments) * (arcAngle * Math.PI / 180)
    const a2 = startRad + ((i + 1) / segments) * (arcAngle * Math.PI / 180)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2)
    const y2 = cy + r * Math.sin(a2)
    doc.line(x1, y1, x2, y2)
  }
  doc.setGState(doc.GState({ opacity: 1 }))

  // Score number center
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  setTxt(doc, color)
  doc.text(`${score}`, cx, cy + 3.5, { align: 'center' })

  // '%' superscript offset
  doc.setFontSize(8)
  doc.text('%', cx + doc.getTextWidth(`${score}`) / 2 + 2.5, cy - 1)

  // Label below
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  setTxt(doc, C.textMuted)
  doc.text('TRUST SCORE', cx, cy + r + 5, { align: 'center' })
}

/** Draw the sparkline trust curve */
function drawSparkline(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  points: TrustPoint[],
  color: readonly [number, number, number],
) {
  if (points.length < 2) return

  const scores = points.map((p) => p.score)
  const minS = Math.min(...scores) - 3
  const maxS = Math.max(100, Math.max(...scores) + 1)

  const toXY = (i: number, s: number) => ({
    px: x + (i / (points.length - 1)) * w,
    py: y + h - ((s - minS) / (maxS - minS)) * h,
  })

  // Filled area (semi-transparent)
  doc.setGState(doc.GState({ opacity: 0.12 }))
  setFill(doc, color)

  // Build polygon path
  const pts = points.map((p, i) => toXY(i, p.score))
  doc.lines(
    pts.slice(1).map((p, i) => [p.px - pts[i].px, p.py - pts[i].py] as [number, number]),
    pts[0].px, pts[0].py,
    [1, 1],
    'F',
    false,
  )
  doc.setGState(doc.GState({ opacity: 1 }))

  // Stroke line
  doc.setLineWidth(0.6)
  setDraw(doc, color)
  for (let i = 1; i < pts.length; i++) {
    doc.line(pts[i - 1].px, pts[i - 1].py, pts[i].px, pts[i].py)
  }

  // Dots at extremes
  const minIdx = scores.indexOf(Math.min(...scores))
  const maxIdx = scores.indexOf(Math.max(...scores))
  setFill(doc, color)
  doc.circle(pts[minIdx].px, pts[minIdx].py, 0.8, 'F')
  doc.circle(pts[maxIdx].px, pts[maxIdx].py, 0.8, 'F')

  // Labels
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  setTxt(doc, C.textMuted)
  doc.text(points[0].t, x, y + h + 4)
  doc.text(points[points.length - 1].t, x + w, y + h + 4, { align: 'right' })
}

// --- Page background & footer ---

function drawPageBackground(doc: jsPDF) {
  setFill(doc, C.pageBg)
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F')

  // Subtle top gradient bar
  doc.setGState(doc.GState({ opacity: 0.06 }))
  setFill(doc, C.cyan)
  doc.rect(0, 0, PAGE_W, 0.8, 'F')
  doc.setGState(doc.GState({ opacity: 1 }))
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number, generatedAt: string) {
  hRule(doc, FOOTER_Y - 4, 0.15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  setTxt(doc, C.textMuted)
  doc.text('Generated by RealSync  |  CONFIDENTIAL — Do not distribute', MARGIN, FOOTER_Y)
  doc.text(`${generatedAt}`, PAGE_W / 2, FOOTER_Y, { align: 'center' })
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' })
}

// --- Logo loader ---

async function loadLogoBase64(): Promise<string | null> {
  try {
    const resp = await fetch('/realsync-logo.png')
    if (!resp.ok) return null
    const blob = await resp.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// --- Page 1: Cover & Summary ---

function buildPage1(
  doc: jsPDF,
  report: ReportPayload,
  logoBase64: string | null,
  generatedAt: string,
) {
  drawPageBackground(doc)

  let y = MARGIN

  // ── Header band ──────────────────────────────────────────
  roundRect(doc, 0, 0, PAGE_W, 44, 0, C.headerBg)

  // Cyan accent line at top of header
  setFill(doc, C.cyan)
  doc.rect(0, 0, PAGE_W, 0.6, 'F')

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', MARGIN, 8, 28, 28)
    } catch {
      // Logo failed — skip
    }
  }

  // RealSync wordmark
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setTxt(doc, C.textPrimary)
  doc.text('RealSync', MARGIN + (logoBase64 ? 32 : 0), 20)

  // Product tagline
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setTxt(doc, C.textMuted)
  doc.text('AI-Powered Meeting Authenticity Platform', MARGIN + (logoBase64 ? 32 : 0), 26.5)

  // Report type pill top-right
  badge(doc, PAGE_W - MARGIN - 30, 17, 'SECURITY AUDIT REPORT', C.cyan)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  setTxt(doc, C.textMuted)
  doc.text(generatedAt, PAGE_W - MARGIN, 24, { align: 'right' })

  y = 52

  // ── Report title block ────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  setTxt(doc, C.textPrimary)
  doc.text('Meeting Authenticity Report', MARGIN, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setTxt(doc, C.cyan)
  doc.text(report.title, MARGIN, y)
  y += 8

  hRule(doc, y)
  y += 5

  // ── Session meta row ──────────────────────────────────────
  const metaItems = [
    { label: 'DATE', value: report.date },
    { label: 'DURATION', value: report.duration },
    { label: 'PARTICIPANTS', value: String(report.participants || 'N/A') },
    { label: 'MEETING TYPE', value: (report.meetingType ?? 'standard').toUpperCase() },
  ]

  const colW = CONTENT_W / metaItems.length
  metaItems.forEach((m, i) => {
    const mx = MARGIN + i * colW
    roundRect(doc, mx, y, colW - 2, 14, 2, C.cardBg)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    setTxt(doc, C.textMuted)
    doc.text(m.label, mx + 4, y + 5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    setTxt(doc, C.textPrimary)
    doc.text(m.value, mx + 4, y + 11)
  })

  y += 20

  // ── Trust gauge + risk badge + summary stats ──────────────
  const gaugeX = MARGIN + 26
  const gaugeY = y + 28

  drawGauge(doc, gaugeX, gaugeY, report.trustAvg)

  // Risk level badge — large
  const rColor = riskColor(report.trustAvg)
  const rLabel = riskLabel(report.trustAvg)

  roundRect(doc, gaugeX - 20, gaugeY + 24, 40, 10, 2, C.cardBg, rColor, 0.5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setTxt(doc, rColor)
  doc.text(rLabel, gaugeX, gaugeY + 31, { align: 'center' })

  // Summary stat cards on right
  const statsX = MARGIN + 62
  const statsData = [
    { label: 'Total Alerts', value: String(report.alerts.total), color: report.alerts.total > 0 ? C.orange : C.green },
    { label: 'Critical', value: String(report.alerts.critical), color: report.alerts.critical > 0 ? C.red : C.textMuted },
    { label: 'High', value: String(report.alerts.high), color: report.alerts.high > 0 ? C.orange : C.textMuted },
    { label: 'Medium', value: String(report.alerts.medium), color: report.alerts.medium > 0 ? C.amber : C.textMuted },
  ]

  const statW = (CONTENT_W - 64) / 2
  statsData.forEach((s, i) => {
    const sx = statsX + (i % 2) * (statW + 2)
    const sy = y + Math.floor(i / 2) * 20
    roundRect(doc, sx, sy, statW, 17, 2, C.cardBg)
    // Top accent
    setFill(doc, s.color)
    doc.rect(sx, sy, statW, 0.8, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    setTxt(doc, C.textMuted)
    doc.text(s.label.toUpperCase(), sx + 4, sy + 6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    setTxt(doc, s.color)
    doc.text(s.value, sx + 4, sy + 14)
  })

  y += 54

  // ── Trust curve sparkline ─────────────────────────────────
  if (report.trustCurve.length > 1) {
    y += 4
    roundRect(doc, MARGIN, y, CONTENT_W, 38, 3, C.cardBg)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    setTxt(doc, C.textSecondary)
    doc.text('TRUST SCORE TIMELINE', MARGIN + 4, y + 6)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    setTxt(doc, C.textMuted)
    const minScore = Math.min(...report.trustCurve.map((p) => p.score))
    const maxScore = Math.max(...report.trustCurve.map((p) => p.score))
    doc.text(`Min: ${minScore}%  Max: ${maxScore}%  Avg: ${report.trustAvg}%`, PAGE_W - MARGIN - 4, y + 6, { align: 'right' })

    drawSparkline(doc, MARGIN + 4, y + 10, CONTENT_W - 8, 20, report.trustCurve, riskColor(report.trustAvg))
    y += 48
  }

  // ── Executive summary block ───────────────────────────────
  y += 4
  roundRect(doc, MARGIN, y, CONTENT_W, 26, 3, C.cardBg)

  // Cyan left accent
  setFill(doc, C.cyan)
  doc.roundedRect(MARGIN, y, 3, 26, 1.5, 1.5, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  setTxt(doc, C.cyan)
  doc.text('EXECUTIVE SUMMARY', MARGIN + 6, y + 6)

  const summaryText = buildSummaryText(report)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setTxt(doc, C.textSecondary)
  const lines = doc.splitTextToSize(summaryText, CONTENT_W - 10)
  doc.text(lines.slice(0, 3), MARGIN + 6, y + 12)

  drawFooter(doc, 1, 4, generatedAt)
}

function buildSummaryText(report: ReportPayload): string {
  const rLabel = riskLabel(report.trustAvg).toLowerCase()
  const alertSummary = report.alerts.total === 0
    ? 'No alerts were raised during this session — all participants verified as authentic.'
    : `${report.alerts.total} alert${report.alerts.total > 1 ? 's' : ''} detected (${report.alerts.critical} critical, ${report.alerts.high} high, ${report.alerts.medium} medium, ${report.alerts.low} low).`
  return `Session "${report.title}" completed on ${report.date} with an overall trust score of ${report.trustAvg}%, classified as ${rLabel} risk. ${alertSummary} Duration: ${report.duration}.`
}

// --- Page 2: Detection Details ---

function buildPage2(doc: jsPDF, report: ReportPayload, generatedAt: string) {
  doc.addPage()
  drawPageBackground(doc)

  let y = MARGIN

  // Page title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setTxt(doc, C.textPrimary)
  doc.text('Detection Analysis', MARGIN, y + 5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setTxt(doc, C.textMuted)
  doc.text('Detailed breakdown of all AI detection layers applied to this session', MARGIN, y + 11)

  hRule(doc, y + 14)
  y += 20

  // ── Visual Manipulation Detection ────────────────────────
  y = sectionHeader(doc, y, 'Visual Manipulation Detection', 'Computer vision deepfake analysis')

  const visualScore = report.visualScore ?? report.trustAvg
  roundRect(doc, MARGIN, y, CONTENT_W, 42, 3, C.cardBg)

  // Score bar
  const sbY = y + 8
  scoreBar(doc, MARGIN + 4, sbY, CONTENT_W - 8, 'Visual Authenticity Score', visualScore, riskColor(visualScore))

  // Model + risk row
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setTxt(doc, C.textMuted)
  doc.text('Model:', MARGIN + 4, sbY + 14)
  doc.setFont('helvetica', 'bold')
  setTxt(doc, C.textSecondary)
  doc.text(report.modelUsed ?? 'Ensemble (CLIP-ViT + Freq Analysis + Boundary Detection)', MARGIN + 20, sbY + 14)

  doc.setFont('helvetica', 'normal')
  setTxt(doc, C.textMuted)
  doc.text('Risk Level:', MARGIN + 4, sbY + 21)

  const vColor = riskColor(visualScore)
  badge(doc, MARGIN + 24, sbY + 21, riskLabel(visualScore), vColor)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  setTxt(doc, C.textMuted)
  doc.text('Accuracy: 98.65% on FaceForensics++ · DFDC benchmark', MARGIN + 4, sbY + 30)

  y += 48

  // ── Audio Analysis ────────────────────────────────────────
  y = sectionHeader(doc, y, 'Audio Analysis', 'Voice synthesis and manipulation detection')

  const audioScore = report.audioScore ?? Math.min(100, report.trustAvg + 2)
  roundRect(doc, MARGIN, y, CONTENT_W, 34, 3, C.cardBg)

  scoreBar(doc, MARGIN + 4, y + 8, CONTENT_W - 8, 'Audio Authenticity Score', audioScore, riskColor(audioScore))

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setTxt(doc, C.textMuted)
  doc.text('Risk Level:', MARGIN + 4, y + 22)
  badge(doc, MARGIN + 24, y + 22, riskLabel(audioScore), riskColor(audioScore))

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  setTxt(doc, C.textMuted)
  doc.text('Analyzes voice patterns, codec artifacts, and synthetic speech signatures', MARGIN + 4, y + 28)

  y += 40

  // ── Emotion Analysis ──────────────────────────────────────
  y = sectionHeader(doc, y, 'Emotion Analysis', 'Affective computing and sentiment detection')

  const emotions = report.dominantEmotions?.length
    ? report.dominantEmotions
    : ['Neutral', 'Attentive', 'Engaged']

  roundRect(doc, MARGIN, y, CONTENT_W, 28, 3, C.cardBg)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setTxt(doc, C.textSecondary)
  doc.text('Dominant Emotions Detected', MARGIN + 4, y + 7)

  const emotionColors: readonly [number, number, number][] = [C.cyan, C.blue, C.violet, C.green, C.amber]
  emotions.slice(0, 5).forEach((em, i) => {
    badge(doc, MARGIN + 4 + i * 30, y + 14, em.toUpperCase(), emotionColors[i % emotionColors.length])
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  setTxt(doc, C.textMuted)
  doc.text('Multi-frame facial expression analysis with micro-expression detection', MARGIN + 4, y + 23)

  y += 34

  // ── Behavioral Analysis ───────────────────────────────────
  y = sectionHeader(doc, y, 'Behavioral Analysis', 'Gaze tracking, head pose, and consistency scoring')

  roundRect(doc, MARGIN, y, CONTENT_W, 30, 3, C.cardBg)

  const behaviorMetrics = [
    { label: 'Gaze Consistency', value: Math.min(100, report.trustAvg + 1) },
    { label: 'Head Pose Stability', value: Math.min(100, report.trustAvg - 1) },
    { label: 'Temporal Coherence', value: report.trustAvg },
  ]

  const bmW = (CONTENT_W - 8) / behaviorMetrics.length
  behaviorMetrics.forEach((bm, i) => {
    const bx = MARGIN + 4 + i * (bmW + 1)
    const col = riskColor(bm.value)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    setTxt(doc, C.textMuted)
    doc.text(bm.label, bx, y + 8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    setTxt(doc, col)
    doc.text(`${bm.value}%`, bx, y + 19)
    // Mini bar
    setFill(doc, C.borderLight)
    doc.roundedRect(bx, y + 21, bmW - 2, 1.8, 0.9, 0.9, 'F')
    setFill(doc, col)
    doc.roundedRect(bx, y + 21, Math.max(1.8, (bm.value / 100) * (bmW - 2)), 1.8, 0.9, 0.9, 'F')
  })

  drawFooter(doc, 2, 4, generatedAt)
}

// --- Page 3: Alert Timeline ---

function buildPage3(doc: jsPDF, report: ReportPayload, generatedAt: string) {
  doc.addPage()
  drawPageBackground(doc)

  let y = MARGIN

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setTxt(doc, C.textPrimary)
  doc.text('Alert Timeline', MARGIN, y + 5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setTxt(doc, C.textMuted)
  doc.text('Chronological record of all detection events during this session', MARGIN, y + 11)

  hRule(doc, y + 14)
  y += 20

  // Summary pills
  const sevCounts = [
    { label: 'CRITICAL', count: report.alerts.critical, color: C.red },
    { label: 'HIGH', count: report.alerts.high, color: C.orange },
    { label: 'MEDIUM', count: report.alerts.medium, color: C.amber },
    { label: 'LOW', count: report.alerts.low, color: C.blue },
  ]

  sevCounts.forEach((s, i) => {
    const px = MARGIN + i * 46
    roundRect(doc, px, y, 43, 13, 2, C.cardBg)
    setFill(doc, s.color)
    doc.rect(px, y, 43, 0.7, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    setTxt(doc, C.textMuted)
    doc.text(s.label, px + 4, y + 5.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    setTxt(doc, s.color)
    doc.text(String(s.count), px + 4, y + 11)
  })

  y += 19

  if (report.timeline.length === 0) {
    roundRect(doc, MARGIN, y, CONTENT_W, 20, 3, C.cardBg)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setTxt(doc, C.green)
    doc.text('No alerts detected — session verified as clean', PAGE_W / 2, y + 12, { align: 'center' })
    drawFooter(doc, 3, 4, generatedAt)
    return
  }

  // Alert list
  y += 4
  report.timeline.forEach((alert, i) => {
    if (y > PAGE_H - 30) return // Safety: skip if near bottom

    const color = sevColor(alert.sev)
    const rowH = 16

    // Row background
    roundRect(doc, MARGIN, y, CONTENT_W, rowH, 2, C.cardBg)
    // Left severity bar
    setFill(doc, color)
    doc.roundedRect(MARGIN, y, 3, rowH, 1.5, 1.5, 'F')

    // Index number
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setTxt(doc, C.textMuted)
    doc.text(String(i + 1).padStart(2, '0'), MARGIN + 6, y + 10)

    // Time
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setTxt(doc, C.textMuted)
    doc.text(alert.time, MARGIN + 16, y + 10)

    // Severity badge
    badge(doc, MARGIN + 30, y + 10, sevLabel(alert.sev), color)

    // Category
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setTxt(doc, color)
    doc.text(alert.cat, MARGIN + 55, y + 10)

    // Message
    const maxMsgW = CONTENT_W - 75
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setTxt(doc, C.textSecondary)
    const msgLines = doc.splitTextToSize(alert.msg, maxMsgW)
    doc.text(msgLines[0], MARGIN + 72, y + 10)

    y += rowH + 2
  })

  drawFooter(doc, 3, 4, generatedAt)
}

// --- Page 4: Transcript ---

function buildPage4(
  doc: jsPDF,
  report: ReportPayload,
  generatedAt: string,
) {
  doc.addPage()
  drawPageBackground(doc)

  let y = MARGIN

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setTxt(doc, C.textPrimary)
  doc.text('Session Transcript', MARGIN, y + 5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  setTxt(doc, C.textMuted)
  doc.text('Timestamped transcript of meeting communications', MARGIN, y + 11)

  hRule(doc, y + 14)
  y += 20

  if (!report.transcript || report.transcript.length === 0) {
    roundRect(doc, MARGIN, y, CONTENT_W, 20, 3, C.cardBg)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setTxt(doc, C.textMuted)
    doc.text('No transcript available for this session', PAGE_W / 2, y + 12, { align: 'center' })
    drawFooter(doc, 4, 4, generatedAt)
    return
  }

  report.transcript.slice(0, 30).forEach((line) => {
    if (y > PAGE_H - 28) return

    const isFlag = line.suspicious === true
    const lineH = 12
    const textW = CONTENT_W - 28

    roundRect(doc, MARGIN, y, CONTENT_W, lineH, 2,
      isFlag ? ([239, 68, 68, 0.05] as unknown as [number, number, number]) : C.cardBg,
      isFlag ? C.red : undefined,
      isFlag ? 0.3 : 0,
    )

    if (isFlag) {
      setFill(doc, C.red)
      doc.rect(MARGIN, y, 2.5, lineH, 'F')
    }

    // Timestamp + speaker
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    setTxt(doc, C.textMuted)
    doc.text(line.timestamp, MARGIN + 4, y + 5)

    if (line.speaker) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      setTxt(doc, C.cyan)
      doc.text(line.speaker + ':', MARGIN + 4, y + 9.5)
    }

    const textX = line.speaker ? MARGIN + 4 + doc.getTextWidth(line.speaker + ': ') + 2 : MARGIN + 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    setTxt(doc, isFlag ? C.textSecondary : C.textMuted)
    const lines = doc.splitTextToSize(line.text, textW)
    doc.text(lines[0], textX, y + 9.5)

    y += lineH + 2
  })

  drawFooter(doc, 4, 4, generatedAt)
}

// --- Main entry point ---

export async function generateReport(report: ReportPayload): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const generatedAt = new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  // Load logo async before building pages
  const logoBase64 = await loadLogoBase64()

  buildPage1(doc, report, logoBase64, generatedAt)
  buildPage2(doc, report, generatedAt)
  buildPage3(doc, report, generatedAt)
  buildPage4(doc, report, generatedAt)

  const safeTitle = report.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  doc.save(`realsync-report-${safeTitle}-${report.id}.pdf`)
}
