/**
 * generate-sample-report.cjs
 *
 * Generates a branded RealSync PDF report with embedded logo and
 * the app's cyan/blue/purple color scheme.
 *
 * Usage:  node generate-sample-report.cjs
 * Output: /Users/ahmed/Desktop/RealSync_Sample_Report.pdf
 */

const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable');

// Apply the autoTable plugin to jsPDF (needed in Node.js CJS context)
if (typeof autoTable.applyPlugin === 'function') {
  autoTable.applyPlugin(jsPDF);
} else if (typeof autoTable.default === 'function') {
  autoTable.default(jsPDF);
}

// ── Load logos as base64 data URIs ──
// Original logo (white text) — for dark backgrounds (header banner)
const logoPath = path.join(__dirname, 'src/assets/4401d6799dc4e6061a79080f8825d69ae920f198.png');
const logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
// Light logo (dark text) — for white/light backgrounds (footer, body sections)
const logoLightPath = path.join(__dirname, 'src/assets/realsync-logo-light.png');
let logoLightBase64 = logoBase64; // fallback to original
try {
  logoLightBase64 = 'data:image/png;base64,' + fs.readFileSync(logoLightPath).toString('base64');
} catch (e) {
  console.warn('Light logo not found — using original for all placements.');
}

// ── Brand Colors (from the RealSync logo & UI) ──
const BRAND = {
  cyan:       [34, 211, 238],    // #22D3EE — brand primary cyan
  cyanDark:   [6, 182, 212],     // #06B6D4 — cyan hover
  blue:       [59, 130, 246],    // #3B82F6 — blue accent
  purple:     [109, 40, 217],    // #6D28D9 — purple from logo
  indigo:     [55, 48, 163],     // Deep indigo
  green:      [16, 185, 129],    // Green from logo accents
  greenLight: [74, 222, 128],    // #4ADE80 — low severity
  orange:     [249, 115, 22],    // #F97316 — warning orange
  red:        [248, 113, 113],   // #F87171 — brand critical red
  yellow:     [250, 204, 21],    // #FACC15 — brand medium yellow
  darkBg:     [15, 15, 30],      // #0F0F1E — app dark background
  cardBg:     [26, 26, 46],      // #1A1A2E — card background
  textDark:   [40, 40, 40],
  textMid:    [100, 100, 100],
  textLight:  [150, 150, 150],
  divider:    [200, 200, 210],
  white:      [255, 255, 255],
};

// ── Helpers ──
function formatDuration(start, end) {
  if (!end) return 'In progress';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

function getOverallRisk(breakdown) {
  if (breakdown.critical > 0) return 'critical';
  if (breakdown.high > 0) return 'high';
  if (breakdown.medium > 0) return 'medium';
  return 'low';
}

function severityColor(sev) {
  switch (sev) {
    case 'critical': return BRAND.red;
    case 'high': return BRAND.orange;
    case 'medium': return BRAND.yellow;
    default: return BRAND.greenLight;
  }
}

function categoryIcon(cat) {
  switch (cat) {
    case 'deepfake': return '\u26A0'; // ⚠
    case 'identity': return '\uD83D\uDC64'; // 👤 (won't render in PDF, use text)
    case 'fraud': return '\u26A0';
    case 'emotion': return '\u25CF'; // ●
    default: return '\u25CF';
  }
}

// ══════════════════════════════════════════════════════════════
// Sample Data
// ══════════════════════════════════════════════════════════════

const summary = {
  sessionId: 'a7b3c8d1-e924-4f5b-8c67-2d9e0f1a3b5c',
  title: 'Q1 Financial Review - Board Meeting',
  meetingType: 'official',
  createdAt: '2025-02-07T09:00:00Z',
  endedAt: '2025-02-07T09:47:23Z',
  totalAlerts: 11,
  totalTranscriptLines: 15,
  severityBreakdown: { critical: 1, high: 3, medium: 5, low: 2 },
  generatedAt: new Date().toISOString(),
};

const alerts = [
  { alertId: 'a1', ts: '2025-02-07T09:03:12Z', severity: 'critical', category: 'deepfake', title: 'Deepfake Detected', message: "Participant 'John Reynolds' video feed shows manipulated facial features with 94% confidence" },
  { alertId: 'a2', ts: '2025-02-07T09:05:44Z', severity: 'high', category: 'identity', title: 'Identity Mismatch', message: "Face embedding for 'Sarah Chen' does not match registered profile (cosine distance: 0.68)" },
  { alertId: 'a3', ts: '2025-02-07T09:08:31Z', severity: 'medium', category: 'fraud', title: 'Suspicious Language Pattern', message: 'Financial terminology anomaly detected: unusual urgency in investment discussion' },
  { alertId: 'a4', ts: '2025-02-07T09:12:15Z', severity: 'high', category: 'deepfake', title: 'Lip-Sync Anomaly', message: 'Audio-visual synchronization offset detected for Participant 3 (delay: 340ms)' },
  { alertId: 'a5', ts: '2025-02-07T09:15:02Z', severity: 'low', category: 'emotion', title: 'Stress Indicators', message: "Elevated stress markers detected in speaker 'Mark Davis' during budget review" },
  { alertId: 'a6', ts: '2025-02-07T09:18:47Z', severity: 'medium', category: 'fraud', title: 'Pressure Tactics', message: "Repeated use of urgency language: 'must act now', 'limited window'" },
  { alertId: 'a7', ts: '2025-02-07T09:22:33Z', severity: 'high', category: 'identity', title: 'New Face Detected', message: 'Unregistered participant joined at 09:22 - face not in session baseline' },
  { alertId: 'a8', ts: '2025-02-07T09:25:10Z', severity: 'medium', category: 'emotion', title: 'Deception Indicators', message: 'Micro-expression analysis suggests potential deception in speaker response' },
  { alertId: 'a9', ts: '2025-02-07T09:30:55Z', severity: 'medium', category: 'fraud', title: 'Wire Transfer Request', message: 'Discussion of immediate fund transfer flagged for review' },
  { alertId: 'a10', ts: '2025-02-07T09:35:18Z', severity: 'low', category: 'emotion', title: 'Engagement Drop', message: 'Participant attention scores dropped below 40% threshold' },
  { alertId: 'a11', ts: '2025-02-07T09:41:02Z', severity: 'medium', category: 'deepfake', title: 'Video Artifact', message: "Brief visual artifact detected in participant 2's video stream (2 frames)" },
];

const transcript = [
  { ts: '2025-02-07T09:00:15Z', speaker: 'Moderator', text: "Good morning everyone, let's begin our Q1 financial review." },
  { ts: '2025-02-07T09:00:42Z', speaker: 'John Reynolds', text: "Thank you. I'll start with the revenue overview for the quarter." },
  { ts: '2025-02-07T09:01:30Z', speaker: 'John Reynolds', text: "We've seen a 12% increase in recurring revenue compared to Q4." },
  { ts: '2025-02-07T09:02:15Z', speaker: 'Sarah Chen', text: 'Can you break down the regional performance?' },
  { ts: '2025-02-07T09:03:05Z', speaker: 'John Reynolds', text: 'Certainly. APAC grew by 18%, EMEA by 9%, and North America by 14%.' },
  { ts: '2025-02-07T09:04:22Z', speaker: 'Mark Davis', text: "The operating margins look strong. What's driving the improvement?" },
  { ts: '2025-02-07T09:05:10Z', speaker: 'John Reynolds', text: 'Primarily our cost optimization initiative from last quarter.' },
  { ts: '2025-02-07T09:06:45Z', speaker: 'Sarah Chen', text: "I'd like to discuss the investment proposal for the new platform." },
  { ts: '2025-02-07T09:08:20Z', speaker: 'Mark Davis', text: 'We need to act quickly on this. The market window is closing fast.' },
  { ts: '2025-02-07T09:10:15Z', speaker: 'John Reynolds', text: 'I agree. We should authorize the wire transfer today if possible.' },
  { ts: '2025-02-07T09:12:30Z', speaker: 'Sarah Chen', text: "Let's review the risk assessment first before any commitments." },
  { ts: '2025-02-07T09:15:00Z', speaker: 'Moderator', text: 'Good point. Mark, can you present the risk analysis?' },
  { ts: '2025-02-07T09:18:33Z', speaker: 'Mark Davis', text: 'The projected ROI is 340% over 18 months with minimal downside.' },
  { ts: '2025-02-07T09:22:45Z', speaker: 'Unknown', text: "Sorry I'm late. Can someone catch me up on where we are?" },
  { ts: '2025-02-07T09:25:00Z', speaker: 'Sarah Chen', text: "We're reviewing the Q1 numbers and an investment proposal." },
];

// ══════════════════════════════════════════════════════════════
// PDF Generation — Branded Design
// ══════════════════════════════════════════════════════════════

const s = summary;
const risk = getOverallRisk(s.severityBreakdown);

const doc = new jsPDF();
const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
const margin = 14;
const contentW = pageW - margin * 2;
let y = 0;

// ─────────────────────────────────────────────────
// HEADER BANNER — dark gradient bar with logo
// ─────────────────────────────────────────────────
function drawHeaderBanner() {
  // Dark banner background
  doc.setFillColor(...BRAND.darkBg);
  doc.rect(0, 0, pageW, 42, 'F');

  // Cyan accent line at bottom of banner
  doc.setFillColor(...BRAND.cyan);
  doc.rect(0, 42, pageW, 1.5, 'F');

  // Gradient-like accent strip (purple to cyan)
  doc.setFillColor(...BRAND.purple);
  doc.rect(0, 42, pageW * 0.3, 1.5, 'F');
  doc.setFillColor(...BRAND.blue);
  doc.rect(pageW * 0.3, 42, pageW * 0.3, 1.5, 'F');
  doc.setFillColor(...BRAND.cyan);
  doc.rect(pageW * 0.6, 42, pageW * 0.4, 1.5, 'F');

  // Logo image (left side of banner — includes "RealSync" text)
  try {
    doc.addImage(logoBase64, 'PNG', 10, 2, 44, 31);
  } catch (e) {
    // Fallback if image fails
    doc.setFontSize(18);
    doc.setTextColor(...BRAND.cyan);
    doc.text('RealSync', 14, 22);
  }

  // Subtitle centered under the logo
  doc.setFontSize(7);
  doc.setTextColor(180, 180, 200);
  doc.text('AI-Powered Meeting Security', 32, 36, { align: 'center' });

  // Report title (right-aligned)
  doc.setFontSize(14);
  doc.setTextColor(...BRAND.white);
  doc.text('Meeting Analysis Report', pageW - margin, 15, { align: 'right' });

  doc.setFontSize(8);
  doc.setTextColor(150, 150, 170);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - margin, 22, { align: 'right' });

  // Risk badge in banner
  const riskColor = severityColor(risk);
  const riskLabel = risk.toUpperCase() + ' RISK';
  doc.setFontSize(8);
  const badgeTextW = doc.getTextWidth(riskLabel);
  const badgeW = badgeTextW + 14;
  const badgeH = 10;
  const badgeX = pageW - margin - badgeW;
  const badgeY = 28;
  doc.setFillColor(...riskColor);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'F');
  doc.setTextColor(...BRAND.white);
  doc.text(riskLabel, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1, { align: 'center' });
}

drawHeaderBanner();
y = 52;

// ─────────────────────────────────────────────────
// SECTION HEADING HELPER
// ─────────────────────────────────────────────────
function sectionHeading(title, yPos) {
  // Cyan left accent bar — tall, bold, and aligned to the text baseline
  doc.setFillColor(...BRAND.cyan);
  doc.roundedRect(margin, yPos - 5, 3.5, 9, 1, 1, 'F');

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND.textDark);
  doc.text(title, margin + 8, yPos);
  doc.setFont('helvetica', 'normal');
  return yPos + 8;
}

// ─────────────────────────────────────────────────
// MEETING INFORMATION — card-style
// ─────────────────────────────────────────────────
y = sectionHeading('Meeting Information', y);

// Card background
doc.setFillColor(245, 247, 250);
doc.roundedRect(margin, y - 2, contentW, 42, 2, 2, 'F');
doc.setDrawColor(220, 225, 235);
doc.roundedRect(margin, y - 2, contentW, 42, 2, 2, 'S');

const col1X = margin + 6;
const col2X = margin + contentW / 2 + 6;
const labelW = 32;
let infoY = y + 5;

const infoLeft = [
  ['Title', s.title],
  ['Session ID', s.sessionId.slice(0, 8)],
  ['Date', new Date(s.createdAt).toLocaleDateString('en-AU', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })],
];
const infoRight = [
  ['Duration', formatDuration(s.createdAt, s.endedAt)],
  ['Type', (s.meetingType || '--').charAt(0).toUpperCase() + (s.meetingType || '--').slice(1)],
  ['Participants', '4 detected'],
];

doc.setFontSize(9);
infoLeft.forEach(([label, val], i) => {
  const row = infoY + i * 11;
  doc.setTextColor(...BRAND.textLight);
  doc.text(`${label}:`, col1X, row);
  doc.setTextColor(...BRAND.textDark);
  doc.text(String(val), col1X + labelW, row);
});
infoRight.forEach(([label, val], i) => {
  const row = infoY + i * 11;
  doc.setTextColor(...BRAND.textLight);
  doc.text(`${label}:`, col2X, row);
  doc.setTextColor(...BRAND.textDark);
  doc.text(String(val), col2X + labelW, row);
});

y += 48;

// ─────────────────────────────────────────────────
// EXECUTIVE SUMMARY — brief overview box
// ─────────────────────────────────────────────────
y = sectionHeading('Executive Summary', y);

const summaryLines = [
  `This report summarizes the security analysis for "${s.title}", held on ${new Date(s.createdAt).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`,
  `RealSync's AI engine monitored the session in real time, analyzing video feeds for deepfake manipulation, verifying participant identities via facial embeddings, scanning dialogue for fraud indicators, and tracking emotional cues.`,
  `Over the ${formatDuration(s.createdAt, s.endedAt)} session, ${s.totalAlerts} alerts were raised — ${s.severityBreakdown.critical} critical, ${s.severityBreakdown.high} high, ${s.severityBreakdown.medium} medium, and ${s.severityBreakdown.low} low severity. Key concerns include a high-confidence deepfake detection, an identity mismatch, and suspicious financial pressure language. A full breakdown of each alert, along with the complete meeting transcript, follows below.`,
];
const summaryText = summaryLines.join(' ');

doc.setFontSize(9);
doc.setTextColor(60, 60, 70);
const sumTextLines = doc.splitTextToSize(summaryText, contentW - 16);
const sumBoxH = sumTextLines.length * 4.5 + 10;

// Branded summary box with cyan left border
doc.setFillColor(240, 250, 255);
doc.roundedRect(margin, y - 2, contentW, sumBoxH, 2, 2, 'F');
doc.setDrawColor(200, 235, 245);
doc.roundedRect(margin, y - 2, contentW, sumBoxH, 2, 2, 'S');
doc.setFillColor(...BRAND.cyan);
doc.rect(margin, y - 2, 3, sumBoxH, 'F'); // cyan left accent

doc.text(sumTextLines, margin + 8, y + 4);
y += sumBoxH + 6;

// ─────────────────────────────────────────────────
// OVERALL ASSESSMENT
// ─────────────────────────────────────────────────
y = sectionHeading('Overall Assessment', y);

let assessment;
if (s.totalAlerts === 0) {
  assessment = 'This meeting showed no security concerns. All participants were verified as authentic with high confidence scores across all detection models.';
} else if (s.severityBreakdown.critical > 0 || s.severityBreakdown.high > 0) {
  assessment = `Significant security concerns were identified during this meeting. ${s.severityBreakdown.critical} critical and ${s.severityBreakdown.high} high severity alerts were raised across deepfake detection, identity verification, and fraud analysis modules. Immediate review of the alert timeline is recommended, with particular attention to the deepfake detection at 09:03 and the identity mismatch at 09:05.`;
} else {
  assessment = `Minor concerns were detected during this meeting (${s.severityBreakdown.medium} medium, ${s.severityBreakdown.low} low severity), but overall the session was within acceptable parameters.`;
}

// Assessment box with left border
doc.setFillColor(255, 250, 245);
doc.roundedRect(margin, y - 2, contentW, 0, 2, 2, 'F'); // placeholder, we'll size after text
doc.setFontSize(9);
doc.setTextColor(80, 70, 60);
const assessLines = doc.splitTextToSize(assessment, contentW - 16);
const assessBoxH = assessLines.length * 4.5 + 8;

// Draw assessment box
doc.setFillColor(255, 248, 240);
doc.roundedRect(margin, y - 2, contentW, assessBoxH, 2, 2, 'F');
doc.setFillColor(...BRAND.orange);
doc.rect(margin, y - 2, 3, assessBoxH, 'F'); // orange left border for warnings

doc.text(assessLines, margin + 8, y + 4);
y += assessBoxH + 6;

// ─────────────────────────────────────────────────
// SEVERITY BREAKDOWN — stat cards + stacked bar
// ─────────────────────────────────────────────────
y = sectionHeading('Severity Breakdown', y);

const severities = [
  { label: 'Critical', count: s.severityBreakdown.critical, color: BRAND.red },
  { label: 'High', count: s.severityBreakdown.high, color: BRAND.orange },
  { label: 'Medium', count: s.severityBreakdown.medium, color: BRAND.yellow },
  { label: 'Low', count: s.severityBreakdown.low, color: BRAND.greenLight },
];

const cardW = (contentW - 12) / 4;
severities.forEach((sev, i) => {
  const cx = margin + i * (cardW + 4);

  // Card background
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(cx, y - 1, cardW, 22, 2, 2, 'F');

  // Color accent top bar
  doc.setFillColor(...sev.color);
  doc.rect(cx, y - 1, cardW, 3, 'F');
  // Round top corners
  doc.roundedRect(cx, y - 1, cardW, 4, 2, 2, 'F');
  doc.setFillColor(245, 247, 250);
  doc.rect(cx, y + 2, cardW, 2, 'F');

  // Count
  doc.setFontSize(16);
  doc.setTextColor(...sev.color);
  doc.text(String(sev.count), cx + cardW / 2, y + 12, { align: 'center' });

  // Label
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.textMid);
  doc.text(sev.label, cx + cardW / 2, y + 18, { align: 'center' });
});

y += 27;

// Stacked bar chart
if (s.totalAlerts > 0) {
  const barH = 6;
  const barY = y;
  let barX = margin;

  severities.forEach((sev) => {
    if (sev.count > 0) {
      const segW = (sev.count / s.totalAlerts) * contentW;
      doc.setFillColor(...sev.color);
      doc.roundedRect(barX, barY, segW, barH, 1, 1, 'F');
      barX += segW;
    }
  });

  // Total label
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.textMid);
  doc.text(`Total: ${s.totalAlerts} alerts`, margin + contentW, barY + barH + 5, { align: 'right' });
  y += barH + 10;
}

y += 4;

// ─────────────────────────────────────────────────
// ALERT TIMELINE TABLE
// ─────────────────────────────────────────────────
if (y > 230) { doc.addPage(); y = 20; }
y = sectionHeading('Alert Timeline', y);

doc.autoTable({
  startY: y,
  head: [['Time', 'Sev.', 'Category', 'Title', 'Description']],
  body: alerts.map((a) => [
    new Date(a.ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    a.severity.toUpperCase(),
    a.category.charAt(0).toUpperCase() + a.category.slice(1),
    a.title,
    a.message.length > 65 ? a.message.slice(0, 65) + '\u2026' : a.message,
  ]),
  theme: 'grid',
  headStyles: {
    fillColor: BRAND.darkBg,
    textColor: BRAND.cyan,
    fontSize: 7.5,
    fontStyle: 'bold',
    halign: 'left',
  },
  styles: {
    fontSize: 7.5,
    cellPadding: 2.5,
    lineColor: [220, 225, 235],
    lineWidth: 0.3,
  },
  alternateRowStyles: {
    fillColor: [248, 250, 252],
  },
  columnStyles: {
    0: { cellWidth: 22, halign: 'center' },
    1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
    2: { cellWidth: 24 },
    3: { cellWidth: 34 },
    4: { cellWidth: contentW - 22 - 18 - 24 - 34 },
  },
  // Color severity cells
  didParseCell: function (data) {
    if (data.section === 'body' && data.column.index === 1) {
      const sevText = data.cell.raw.toLowerCase();
      const color = severityColor(sevText);
      data.cell.styles.textColor = color;
    }
  },
  margin: { left: margin, right: margin, top: 20, bottom: 20 },
  tableWidth: contentW,
});

y = doc.lastAutoTable.finalY + 10;

// ─────────────────────────────────────────────────
// TRANSCRIPT TABLE
// ─────────────────────────────────────────────────
if (y > 230) { doc.addPage(); y = 20; }
y = sectionHeading(`Transcript (${transcript.length} lines)`, y);

doc.autoTable({
  startY: y,
  head: [['Time', 'Speaker', 'Text']],
  body: transcript.map((line) => [
    new Date(line.ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    line.speaker || '--',
    line.text.length > 90 ? line.text.slice(0, 90) + '\u2026' : line.text,
  ]),
  theme: 'grid',
  headStyles: {
    fillColor: BRAND.darkBg,
    textColor: BRAND.cyan,
    fontSize: 7.5,
    fontStyle: 'bold',
  },
  styles: {
    fontSize: 7.5,
    cellPadding: 2.5,
    lineColor: [220, 225, 235],
    lineWidth: 0.3,
  },
  alternateRowStyles: {
    fillColor: [248, 250, 252],
  },
  columnStyles: {
    0: { cellWidth: 22, halign: 'center' },
    1: { cellWidth: 30, textColor: BRAND.cyanDark, fontStyle: 'bold' },
    2: { cellWidth: contentW - 22 - 30 },
  },
  margin: { left: margin, right: margin, top: 20, bottom: 20 },
  tableWidth: contentW,
});

y = doc.lastAutoTable.finalY + 10;

// ─────────────────────────────────────────────────
// FOOTER on every page
// ─────────────────────────────────────────────────
const totalPages = doc.internal.getNumberOfPages();
for (let i = 1; i <= totalPages; i++) {
  doc.setPage(i);

  // Bottom accent line (matching header gradient)
  doc.setFillColor(...BRAND.purple);
  doc.rect(0, pageH - 12, pageW * 0.3, 1, 'F');
  doc.setFillColor(...BRAND.blue);
  doc.rect(pageW * 0.3, pageH - 12, pageW * 0.3, 1, 'F');
  doc.setFillColor(...BRAND.cyan);
  doc.rect(pageW * 0.6, pageH - 12, pageW * 0.4, 1, 'F');

  // Footer text
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.textLight);
  doc.text(
    'RealSync \u2014 AI-Powered Meeting Security  |  Confidential',
    pageW / 2,
    pageH - 6,
    { align: 'center' }
  );
  doc.text(
    `Page ${i} of ${totalPages}`,
    pageW - margin,
    pageH - 6,
    { align: 'right' }
  );

  // Small logo in footer (left side) — use light logo for white background
  try {
    doc.addImage(logoLightBase64, 'PNG', margin, pageH - 10, 8, 5.5);
  } catch (e) {
    // skip if image fails
  }
}

// ── Save to disk ──
const outputPath = '/Users/ahmed/Desktop/RealSync_Sample_Report.pdf';
const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outputPath, pdfBuffer);
console.log(`\nPDF generated successfully!`);
console.log(`  File:  ${outputPath}`);
console.log(`  Pages: ${totalPages}`);
console.log(`  Size:  ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
