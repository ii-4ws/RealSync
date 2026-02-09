/**
 * RealSync Light Logo Usage Sheet — PDF Generator
 * ================================================
 * Shows the light-background logo variants in real-world mockups:
 *   Page 1: Dark vs Light variant comparison
 *   Page 2: Email signature, letterhead, business card, presentation slide
 *
 * Run:  node generate-light-logo-sheet.cjs
 * Output: ~/Desktop/RealSync_Light_Logo_Sheet.pdf
 */

const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');

// ──────────────────────────────────────────
// LOGO LOADING (base64)
// ──────────────────────────────────────────
const assetsDir = path.join(__dirname, 'src', 'assets');

function loadImg(filename) {
  const p = path.join(assetsDir, filename);
  try {
    return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
  } catch (e) {
    console.warn(`  Warning: ${filename} not found`);
    return null;
  }
}

const logoDarkFull  = loadImg('4401d6799dc4e6061a79080f8825d69ae920f198.png');
const logoDarkEye   = loadImg('realsync-eye-only.png');
const logoLightFull = loadImg('realsync-logo-light.png');
const logoLightEye  = loadImg('realsync-eye-light.png');

// ──────────────────────────────────────────
// BRAND COLORS
// ──────────────────────────────────────────
const C = {
  cyan:       [34, 211, 238],
  blue:       [59, 130, 246],
  purpleDeep: [109, 40, 217],
  orange:     [251, 146, 60],
  sevLow:     [74, 222, 128],
  bgDeep:     [10, 10, 20],
  bgBase:     [15, 15, 30],
  bgCard:     [26, 26, 46],
  bgElevated: [42, 42, 62],
  white:      [255, 255, 255],
  gray100:    [243, 244, 246],
  gray200:    [229, 231, 235],
  gray300:    [209, 213, 219],
  gray400:    [156, 163, 175],
  gray500:    [107, 114, 128],
  borderDef:  [31, 41, 55],
  textDark:   [40, 40, 40],
};

// ──────────────────────────────────────────
// DOC SETUP
// ──────────────────────────────────────────
const doc = new jsPDF();
const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
const margin = 14;
const contentW = pageW - margin * 2;

function drawGradientStrip(x, y, w, h) {
  const third = w / 3;
  doc.setFillColor(...C.purpleDeep);
  doc.rect(x, y, third, h, 'F');
  doc.setFillColor(...C.blue);
  doc.rect(x + third, y, third, h, 'F');
  doc.setFillColor(...C.cyan);
  doc.rect(x + third * 2, y, third + 0.5, h, 'F');
}

// ══════════════════════════════════════════
// PAGE 1: DARK vs LIGHT COMPARISON
// ══════════════════════════════════════════

// White background
doc.setFillColor(...C.white);
doc.rect(0, 0, pageW, pageH, 'F');

// Title
doc.setFillColor(...C.cyan);
doc.roundedRect(margin, 20, 3.5, 9, 1, 1, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(15);
doc.setTextColor(...C.textDark);
doc.text('Logo Variants: Dark & Light', margin + 8, 26);

doc.setFont('helvetica', 'normal');
doc.setFontSize(9);
doc.setTextColor(...C.gray500);
doc.text('RealSync provides two logo variants optimized for different background contexts.', margin + 8, 34);

let y = 48;

// ── ROW 1: FULL LOCKUP ──

doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.textDark);
doc.text('Full Lockup', margin, y);
y += 6;

// Dark variant card
doc.setFillColor(...C.bgDeep);
doc.roundedRect(margin, y, 86, 70, 4, 4, 'F');
if (logoDarkFull) {
  try { doc.addImage(logoDarkFull, 'PNG', margin + 13, y + 8, 60, 41.8); } catch (e) {}
}
doc.setFont('helvetica', 'bold');
doc.setFontSize(7);
doc.setTextColor(...C.cyan);
doc.text('Dark Background Variant', margin + 43, y + 58, { align: 'center' });
doc.setFont('helvetica', 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray400);
doc.text('For app UI, dark presentations, reports', margin + 43, y + 63, { align: 'center' });

// Light variant card
const lightX = margin + 96;
doc.setFillColor(...C.white);
doc.roundedRect(lightX, y, 86, 70, 4, 4, 'F');
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.5);
doc.roundedRect(lightX, y, 86, 70, 4, 4, 'S');
if (logoLightFull) {
  try { doc.addImage(logoLightFull, 'PNG', lightX + 13, y + 8, 60, 41.8); } catch (e) {}
}
doc.setFont('helvetica', 'bold');
doc.setFontSize(7);
doc.setTextColor(...C.purpleDeep);
doc.text('Light Background Variant', lightX + 43, y + 58, { align: 'center' });
doc.setFont('helvetica', 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray500);
doc.text('For emails, letterheads, white papers, print', lightX + 43, y + 63, { align: 'center' });

y += 80;

// ── ROW 2: EYE-ONLY ──

doc.setFont('helvetica', 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.textDark);
doc.text('Eye-Only Icon', margin, y);
y += 6;

// Dark variant
doc.setFillColor(...C.bgDeep);
doc.roundedRect(margin, y, 86, 55, 4, 4, 'F');
if (logoDarkEye) {
  try { doc.addImage(logoDarkEye, 'PNG', margin + 13, y + 10, 60, 28.2); } catch (e) {}
}
doc.setFont('helvetica', 'bold');
doc.setFontSize(7);
doc.setTextColor(...C.cyan);
doc.text('Dark Background Variant', margin + 43, y + 45, { align: 'center' });
doc.setFont('helvetica', 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray400);
doc.text('Favicons, app icons, dark social profiles', margin + 43, y + 50, { align: 'center' });

// Light variant
doc.setFillColor(...C.white);
doc.roundedRect(lightX, y, 86, 55, 4, 4, 'F');
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.5);
doc.roundedRect(lightX, y, 86, 55, 4, 4, 'S');
if (logoLightEye) {
  try { doc.addImage(logoLightEye, 'PNG', lightX + 13, y + 10, 60, 28.2); } catch (e) {}
}
doc.setFont('helvetica', 'bold');
doc.setFontSize(7);
doc.setTextColor(...C.purpleDeep);
doc.text('Light Background Variant', lightX + 43, y + 45, { align: 'center' });
doc.setFont('helvetica', 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray500);
doc.text('Light social profiles, compact print placement', lightX + 43, y + 50, { align: 'center' });

y += 65;

// ── USAGE NOTES ──

doc.setFillColor(...C.gray100);
doc.roundedRect(margin, y, contentW, 40, 3, 3, 'F');

doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.textDark);
doc.text('When to Use Each Variant', margin + 6, y + 8);

const notes = [
  { dot: C.bgCard, text: 'Dark variant: App UI, dark-themed slides, PDF reports with dark headers, social media dark cards.' },
  { dot: C.cyan, text: 'Light variant: Email signatures, letterheads, invoices, white papers, light-themed presentations, business cards.' },
  { dot: C.orange, text: 'Never place the dark variant on white backgrounds \u2014 the wordmark will be invisible.' },
  { dot: C.sevLow, text: 'Both variants preserve the full brand gradient (cyan \u2192 blue \u2192 purple) on the eye symbol.' },
];

let noteY = y + 14;
notes.forEach((n) => {
  doc.setFillColor(...n.dot);
  doc.circle(margin + 9, noteY, 1.5, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.gray500);
  doc.text(n.text, margin + 14, noteY + 1);
  noteY += 7;
});

// ══════════════════════════════════════════
// PAGE 2: REAL-WORLD USE CASES
// ══════════════════════════════════════════

doc.addPage();
doc.setFillColor(...C.white);
doc.rect(0, 0, pageW, pageH, 'F');

// Title
doc.setFillColor(...C.cyan);
doc.roundedRect(margin, 20, 3.5, 9, 1, 1, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(15);
doc.setTextColor(...C.textDark);
doc.text('Light Logo: Use Cases', margin + 8, 26);

doc.setFont('helvetica', 'normal');
doc.setFontSize(9);
doc.setTextColor(...C.gray500);
doc.text('How the light-background variant appears in practical applications.', margin + 8, 34);

y = 44;

// ── USE CASE 1: EMAIL SIGNATURE ──

doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.purpleDeep);
doc.text('Email Signature', margin, y);
y += 5;

// Signature container
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.4);
doc.roundedRect(margin, y, contentW, 38, 2, 2, 'S');

// Vertical divider (left: logo, right: details)
const sigDivX = margin + 48;
doc.setFillColor(...C.gray200);
doc.rect(sigDivX, y + 4, 0.3, 30, 'F');

// Logo left side
if (logoLightFull) {
  try { doc.addImage(logoLightFull, 'PNG', margin + 6, y + 4, 36, 25); } catch (e) {}
}

// Contact details right side
const detX = sigDivX + 6;
doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.textDark);
doc.text('Ahmed', detX, y + 10);

doc.setFont('helvetica', 'normal');
doc.setFontSize(7);
doc.setTextColor(...C.gray500);
doc.text('Fullstack Developer', detX, y + 15);
doc.text('RealSync Pty Ltd', detX, y + 20);

doc.setTextColor(...C.cyan);
doc.text('ahmed@realsync.ai', detX, y + 26);

doc.setFont('helvetica', 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray400);
doc.text('+61 400 000 000', detX, y + 31);

// Gradient accent at bottom of signature
drawGradientStrip(margin + 2, y + 35, contentW - 4, 0.8);

y += 46;

// ── USE CASE 2: LETTERHEAD ──

doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.purpleDeep);
doc.text('Letterhead', margin, y);
y += 5;

// Letterhead frame
const lhW = 130;
const lhH = 80;
doc.setFillColor(...C.gray100);
doc.roundedRect(margin + 2, y + 2, lhW, lhH, 2, 2, 'F');
doc.setFillColor(...C.white);
doc.roundedRect(margin, y, lhW, lhH, 2, 2, 'F');
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.3);
doc.roundedRect(margin, y, lhW, lhH, 2, 2, 'S');

// Logo top-left
if (logoLightFull) {
  try { doc.addImage(logoLightFull, 'PNG', margin + 4, y + 3, 30, 20.9); } catch (e) {}
}

// Company details right
doc.setFont('helvetica', 'bold');
doc.setFontSize(5);
doc.setTextColor(...C.purpleDeep);
doc.text('RealSync Pty Ltd', margin + lhW - 4, y + 6, { align: 'right' });
doc.setFont('helvetica', 'normal');
doc.setFontSize(4);
doc.setTextColor(...C.gray400);
doc.text('Level 12, 100 Pacific Hwy', margin + lhW - 4, y + 10, { align: 'right' });
doc.text('North Sydney NSW 2060', margin + lhW - 4, y + 14, { align: 'right' });
doc.setTextColor(...C.cyan);
doc.text('contact@realsync.ai', margin + lhW - 4, y + 18, { align: 'right' });

// Gradient accent line
drawGradientStrip(margin + 4, y + 24, lhW - 8, 0.6);

// Simulated body text
doc.setFont('helvetica', 'normal');
doc.setFontSize(5);
doc.setTextColor(...C.gray500);
doc.text('7 February 2026', margin + 4, y + 30);

for (let i = 0; i < 6; i++) {
  doc.setFillColor(...C.gray300);
  const bw = i === 5 ? 40 : lhW - 12;
  doc.roundedRect(margin + 4, y + 36 + i * 4, bw, 1.5, 0.5, 0.5, 'F');
}

// Signature
doc.setFont('helvetica', 'italic');
doc.setFontSize(4);
doc.setTextColor(...C.gray500);
doc.text('Kind regards,', margin + 4, y + 64);
doc.setFillColor(...C.cyan);
doc.rect(margin + 4, y + 67, 16, 0.4, 'F');
doc.setFont('helvetica', 'bold');
doc.setFontSize(4);
doc.setTextColor(...C.textDark);
doc.text('Ahmed', margin + 4, y + 72);

// Footer gradient
drawGradientStrip(margin + 4, y + lhH - 4, lhW - 8, 0.4);

y += lhH + 10;

// ── USE CASE 3: BUSINESS CARD ──

doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.purpleDeep);
doc.text('Business Card', margin, y);
y += 5;

// Two cards side by side: front (light) and back (dark)
const bcW = 85;
const bcH = 50;

// Front (light)
doc.setFillColor(...C.white);
doc.roundedRect(margin, y, bcW, bcH, 3, 3, 'F');
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.3);
doc.roundedRect(margin, y, bcW, bcH, 3, 3, 'S');

if (logoLightFull) {
  try { doc.addImage(logoLightFull, 'PNG', margin + 4, y + 4, 28, 19.5); } catch (e) {}
}

// Gradient accent
drawGradientStrip(margin + 4, y + 26, bcW - 8, 0.6);

doc.setFont('helvetica', 'bold');
doc.setFontSize(7);
doc.setTextColor(...C.textDark);
doc.text('Ahmed', margin + 4, y + 33);

doc.setFont('helvetica', 'normal');
doc.setFontSize(5);
doc.setTextColor(...C.gray500);
doc.text('Fullstack Developer', margin + 4, y + 37);
doc.text('ahmed@realsync.ai', margin + 4, y + 41);
doc.text('+61 400 000 000', margin + 4, y + 45);

doc.setFontSize(4);
doc.setTextColor(...C.gray400);
doc.text('FRONT', margin + bcW / 2, y + bcH - 2, { align: 'center' });

// Back (dark)
const bc2X = margin + bcW + 10;
doc.setFillColor(...C.bgDeep);
doc.roundedRect(bc2X, y, bcW, bcH, 3, 3, 'F');

if (logoDarkFull) {
  try { doc.addImage(logoDarkFull, 'PNG', bc2X + (bcW - 50) / 2, y + 6, 50, 34.8); } catch (e) {}
}

drawGradientStrip(bc2X + 10, y + bcH - 6, bcW - 20, 0.8);

doc.setFontSize(4);
doc.setTextColor(...C.gray400);
doc.text('BACK', bc2X + bcW / 2, y + bcH - 2, { align: 'center' });

y += bcH + 10;

// ── USE CASE 4: PRESENTATION SLIDE (WHITE) ──

doc.setFont('helvetica', 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.purpleDeep);
doc.text('Presentation Slide (Light Theme)', margin, y);
y += 5;

// Slide frame
const slideW = contentW;
const slideH = 56;
doc.setFillColor(...C.white);
doc.roundedRect(margin, y, slideW, slideH, 3, 3, 'F');
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.3);
doc.roundedRect(margin, y, slideW, slideH, 3, 3, 'S');

// Logo top-left of slide
if (logoLightEye) {
  try { doc.addImage(logoLightEye, 'PNG', margin + 6, y + 4, 22, 10.3); } catch (e) {}
}

// Slide title
doc.setFont('helvetica', 'bold');
doc.setFontSize(14);
doc.setTextColor(...C.textDark);
doc.text('Q1 Security Report', margin + slideW / 2, y + 20, { align: 'center' });

doc.setFont('helvetica', 'normal');
doc.setFontSize(9);
doc.setTextColor(...C.gray400);
doc.text('Meeting Intelligence Dashboard  |  January \u2013 March 2026', margin + slideW / 2, y + 28, { align: 'center' });

// Bullet points
const bullets = [
  '94% average trust score across 847 monitored meetings',
  '12 deepfake attempts detected and flagged in real-time',
  'Zero false positives in identity verification pipeline',
];

doc.setFontSize(7);
doc.setTextColor(...C.gray500);
bullets.forEach((b, i) => {
  const bY = y + 36 + i * 5;
  doc.setFillColor(...C.cyan);
  doc.circle(margin + 50, bY, 1, 'F');
  doc.text(b, margin + 54, bY + 1);
});

// Bottom gradient strip
drawGradientStrip(margin, y + slideH - 2, slideW, 1.5);

// ══════════════════════════════════════════
// FOOTER ON BOTH PAGES
// ══════════════════════════════════════════

const totalPages = doc.internal.getNumberOfPages();
for (let i = 1; i <= totalPages; i++) {
  doc.setPage(i);

  const footY = pageH - 14;
  drawGradientStrip(0, footY, pageW, 1);

  if (logoLightFull) {
    try { doc.addImage(logoLightFull, 'PNG', margin, pageH - 11, 8, 5.5); } catch (e) {}
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...C.gray500);
  doc.text('RealSync  |  Light Logo Usage Guide  |  Confidential', pageW / 2, pageH - 6, { align: 'center' });
  doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });
}

// ══════════════════════════════════════════
// SAVE
// ══════════════════════════════════════════

const outputPath = path.join(require('os').homedir(), 'Desktop', 'RealSync_Light_Logo_Sheet.pdf');
const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outputPath, pdfBuffer);
console.log(`\n\u2705 Light logo usage sheet generated!`);
console.log(`   Output: ${outputPath}`);
console.log(`   Pages:  ${totalPages}`);
