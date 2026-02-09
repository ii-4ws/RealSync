/**
 * RealSync Brand Identity Book — PDF Generator
 * Run: node generate-brand-book.cjs
 * Output: ~/Desktop/RealSync_Brand_Book.pdf
 */

const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable');

// AutoTable plugin init (CJS workaround)
if (typeof autoTable.applyPlugin === 'function') {
  autoTable.applyPlugin(jsPDF);
} else if (typeof autoTable.default === 'function') {
  autoTable.default(jsPDF);
}

// ──────────────────────────────────────────
// LOGO LOADING
// ──────────────────────────────────────────
const logoFullPath = path.join(__dirname, 'src/assets/4401d6799dc4e6061a79080f8825d69ae920f198.png');
const logoEyePath  = path.join(__dirname, 'src/assets/realsync-eye-only.png');

let logoFull = null;
let logoEye  = null;
let logoLightFull = null;
let logoLightEye  = null;
try { logoFull = 'data:image/png;base64,' + fs.readFileSync(logoFullPath).toString('base64'); } catch (e) { console.warn('Full logo not found'); }
try { logoEye  = 'data:image/png;base64,' + fs.readFileSync(logoEyePath).toString('base64');  } catch (e) { console.warn('Eye logo not found'); }

const logoLightFullPath = path.join(__dirname, 'src/assets/realsync-logo-light.png');
const logoLightEyePath  = path.join(__dirname, 'src/assets/realsync-eye-light.png');
try { logoLightFull = 'data:image/png;base64,' + fs.readFileSync(logoLightFullPath).toString('base64'); } catch (e) { console.warn('Light full logo not found'); }
try { logoLightEye  = 'data:image/png;base64,' + fs.readFileSync(logoLightEyePath).toString('base64');  } catch (e) { console.warn('Light eye logo not found'); }

// ──────────────────────────────────────────
// BRAND COLORS (RGB arrays)
// ──────────────────────────────────────────
const C = {
  cyan:       [34, 211, 238],
  cyanDark:   [6, 182, 212],
  blue:       [59, 130, 246],
  blueActive: [37, 99, 235],
  purple:     [168, 85, 247],
  purpleDeep: [109, 40, 217],
  orange:     [251, 146, 60],
  orangeDark: [249, 115, 22],
  sevLow:     [74, 222, 128],
  sevMed:     [250, 204, 21],
  sevHigh:    [251, 146, 60],
  sevCrit:    [248, 113, 113],
  info:       [96, 165, 250],
  bgDeep:     [10, 10, 20],
  bgBase:     [15, 15, 30],
  bgCard:     [26, 26, 46],
  bgElevated: [42, 42, 62],
  bgHover:    [58, 58, 78],
  white:      [255, 255, 255],
  gray100:    [243, 244, 246],
  gray200:    [229, 231, 235],
  gray300:    [209, 213, 219],
  gray400:    [156, 163, 175],
  gray500:    [107, 114, 128],
  borderDef:  [31, 41, 55],
  borderIn:   [55, 65, 81],
  textDark:   [40, 40, 40],
};

// ──────────────────────────────────────────
// DOCUMENT SETUP
// ──────────────────────────────────────────
const doc = new jsPDF();
const pageW = doc.internal.pageSize.getWidth();   // 210mm
const pageH = doc.internal.pageSize.getHeight();  // 297mm
const margin = 14;
const contentW = pageW - margin * 2;              // 182mm

// ──────────────────────────────────────────
// CUSTOM FONT: Space Grotesk
// ──────────────────────────────────────────
const fontsDir = path.join(__dirname, 'fonts');

const sgRegular = fs.readFileSync(path.join(fontsDir, 'SpaceGrotesk-Regular.ttf'), { encoding: 'latin1' });
const sgBold    = fs.readFileSync(path.join(fontsDir, 'SpaceGrotesk-Bold.ttf'),    { encoding: 'latin1' });
const sgMedium  = fs.readFileSync(path.join(fontsDir, 'SpaceGrotesk-Medium.ttf'),  { encoding: 'latin1' });
const sgLight   = fs.readFileSync(path.join(fontsDir, 'SpaceGrotesk-Light.ttf'),   { encoding: 'latin1' });

doc.addFileToVFS('SpaceGrotesk-Regular.ttf', sgRegular);
doc.addFileToVFS('SpaceGrotesk-Bold.ttf', sgBold);
doc.addFileToVFS('SpaceGrotesk-Medium.ttf', sgMedium);
doc.addFileToVFS('SpaceGrotesk-Light.ttf', sgLight);

doc.addFont('SpaceGrotesk-Regular.ttf', 'SpaceGrotesk', 'normal');
doc.addFont('SpaceGrotesk-Bold.ttf', 'SpaceGrotesk', 'bold');
doc.addFont('SpaceGrotesk-Medium.ttf', 'SpaceGrotesk-Medium', 'normal');
doc.addFont('SpaceGrotesk-Light.ttf', 'SpaceGrotesk-Light', 'normal');

// Alias for convenience — SG is the primary brand font
const FONT = 'SpaceGrotesk';
const FONT_MEDIUM = 'SpaceGrotesk-Medium';
const FONT_LIGHT = 'SpaceGrotesk-Light';

// ──────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────

function drawGradientStrip(x, y, w, h) {
  const third = w / 3;
  doc.setFillColor(...C.purpleDeep);
  doc.rect(x, y, third, h, 'F');
  doc.setFillColor(...C.blue);
  doc.rect(x + third, y, third, h, 'F');
  doc.setFillColor(...C.cyan);
  doc.rect(x + third * 2, y, third + 0.5, h, 'F');
}

function sectionTitleLight(text, y) {
  doc.setFillColor(...C.cyan);
  doc.roundedRect(margin, y - 5, 3.5, 9, 1, 1, 'F');
  doc.setFontSize(13);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...C.textDark);
  doc.text(text, margin + 8, y);
  doc.setFont(FONT, 'normal');
  return y + 10;
}

function sectionTitleDark(text, y) {
  doc.setFillColor(...C.cyan);
  doc.roundedRect(margin, y - 5, 3.5, 9, 1, 1, 'F');
  doc.setFontSize(13);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...C.white);
  doc.text(text, margin + 8, y);
  doc.setFont(FONT, 'normal');
  return y + 10;
}

function drawColorSwatch(x, y, w, h, rgb, name, hex, rgbStr) {
  doc.setFillColor(...rgb);
  doc.roundedRect(x, y, w, h, 3, 3, 'F');
  // If very light color, add border
  const brightness = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
  if (brightness > 200) {
    doc.setDrawColor(...C.gray200);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 3, 3, 'S');
  }
  doc.setFontSize(8);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...C.textDark);
  doc.text(name, x + 2, y + h + 5);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.gray400);
  doc.text(hex, x + 2, y + h + 10);
  if (rgbStr) {
    doc.setFontSize(6);
    doc.setTextColor(...C.gray500);
    doc.text(rgbStr, x + 2, y + h + 14);
  }
}

function darkPage() {
  doc.setFillColor(...C.bgDeep);
  doc.rect(0, 0, pageW, pageH, 'F');
}

function whitePage() {
  doc.setFillColor(...C.white);
  doc.rect(0, 0, pageW, pageH, 'F');
}

// ══════════════════════════════════════════
// PAGE 1: COVER
// ══════════════════════════════════════════

darkPage();

// Top gradient strip — at the very top of the page
drawGradientStrip(0, 12, pageW, 2);

// ── All content vertically centred on page ──
// Content block: logo(55.7) + gap(14) + title(8) + gap(10) + subtitle(5) + gap(22) + tagline(6) + gap(10) + line(0.5) + gap(20) + version(4)
// Total block height ≈ 155
const blockH = 155;
const blockStartY = (pageH - blockH) / 2;

// Logo — centred horizontally and vertically
const coverLogoW = 80;
const coverLogoH = 55.7;
if (logoFull) {
  try { doc.addImage(logoFull, 'PNG', (pageW - coverLogoW) / 2, blockStartY, coverLogoW, coverLogoH); } catch (e) {}
}

// Title — centred
doc.setFont(FONT, 'bold');
doc.setFontSize(22);
doc.setTextColor(...C.white);
doc.text('Brand Identity Guidelines', pageW / 2, blockStartY + coverLogoH + 14, { align: 'center' });

// Subtitle — centred
doc.setFont(FONT, 'normal');
doc.setFontSize(11);
doc.setTextColor(...C.gray300);
doc.text('Visual Standards & Usage Manual', pageW / 2, blockStartY + coverLogoH + 26, { align: 'center' });

// Tagline — centred
doc.setFont(FONT, 'normal');
doc.setFontSize(14);
doc.setTextColor(...C.cyan);
doc.text("See What's Real.", pageW / 2, blockStartY + coverLogoH + 48, { align: 'center' });

// Decorative line — centred
const decoLineW = 70;
doc.setFillColor(...C.bgElevated);
doc.rect((pageW - decoLineW) / 2, blockStartY + coverLogoH + 58, decoLineW, 0.5, 'F');

// Version — centred
doc.setFont(FONT, 'normal');
doc.setFontSize(8);
doc.setTextColor(...C.gray500);
doc.text('Version 1.0  |  February 2026', pageW / 2, blockStartY + coverLogoH + 78, { align: 'center' });

// Bottom gradient strip
drawGradientStrip(0, pageH - 7, pageW, 2);

// ══════════════════════════════════════════
// PAGE 2: BRAND ESSENCE
// ══════════════════════════════════════════

doc.addPage();
whitePage();
let y = 25;
y = sectionTitleLight('Brand Essence', y);

// Thin rule
doc.setFillColor(...C.gray200);
doc.rect(margin, y, contentW, 0.3, 'F');
y += 8;

// Mission
doc.setFont(FONT, 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.purpleDeep);
doc.text('Our Mission', margin, y);
y += 6;

doc.setFont(FONT, 'normal');
doc.setFontSize(9);
doc.setTextColor(...C.gray500);
const missionText = 'To safeguard digital communications by providing real-time AI-powered detection of deepfakes, identity fraud, and manipulative behavior in video meetings, ensuring every participant is who they claim to be.';
const missionLines = doc.splitTextToSize(missionText, contentW - 10);
doc.text(missionLines, margin, y);
y += missionLines.length * 4.5 + 8;

// Vision
doc.setFont(FONT, 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.purpleDeep);
doc.text('Our Vision', margin, y);
y += 6;

doc.setFont(FONT, 'normal');
doc.setFontSize(9);
doc.setTextColor(...C.gray500);
const visionText = 'A world where every virtual interaction is authentic, verified, and secure \u2014 where trust in digital communication is absolute and deception has no place to hide.';
const visionLines = doc.splitTextToSize(visionText, contentW - 10);
doc.text(visionLines, margin, y);
y += visionLines.length * 4.5 + 8;

// Divider
doc.setFillColor(...C.gray200);
doc.rect(margin, y, contentW, 0.3, 'F');
y += 10;

// Brand Personality heading
y = sectionTitleLight('Brand Personality', y);
y += 2;

const traits = [
  { name: 'Vigilant',    color: C.cyan,     desc: 'Always watching, always protecting. Security awareness without intrusion.' },
  { name: 'Intelligent', color: C.blue,     desc: 'AI-powered insights with authority and precision. No oversimplification.' },
  { name: 'Trustworthy', color: C.purple,   desc: 'Every choice reinforces reliability, stability, and confidence.' },
  { name: 'Modern',      color: C.orange,   desc: 'Clean, forward-looking, technologically sophisticated design.' },
  { name: 'Premium',     color: C.sevLow,   desc: 'Enterprise-grade quality in every detail. Restrained, intentional aesthetics.' },
];

traits.forEach((t) => {
  doc.setFillColor(...t.color);
  doc.circle(margin + 4, y - 1.5, 3, 'F');
  doc.setFont(FONT, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...t.color);
  doc.text(t.name, margin + 12, y);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.gray400);
  doc.text(t.desc, margin + 12, y + 5.5);
  y += 16;
});

y += 4;
doc.setFillColor(...C.gray200);
doc.rect(margin, y, contentW, 0.3, 'F');
y += 10;

// Taglines
y = sectionTitleLight('Taglines', y);
y += 2;

doc.setFont(FONT, 'normal');
doc.setFontSize(14);
doc.setTextColor(...C.cyan);
doc.text("See What's Real.", margin, y);
y += 8;

doc.setFont(FONT, 'normal');
doc.setFontSize(11);
doc.setTextColor(...C.gray300);
doc.text('Trust Every Frame.', margin, y);
y += 7;

doc.setTextColor(...C.gray400);
doc.text('Real-Time Meeting Intelligence.', margin, y);
y += 7;

doc.setFontSize(9);
doc.setTextColor(...C.gray500);
doc.text('AI-Powered Authenticity Detection.', margin, y);

// ══════════════════════════════════════════
// PAGE 3: LOGO SYSTEM
// ══════════════════════════════════════════

doc.addPage();
darkPage();
y = 25;
y = sectionTitleDark('Logo System', y);

// Full lockup card
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.gray300);
doc.text('Full Lockup', margin, y + 4);

doc.setFillColor(...C.bgCard);
doc.roundedRect(margin, y + 8, 86, 72, 3, 3, 'F');
if (logoFull) {
  try { doc.addImage(logoFull, 'PNG', margin + 13, y + 14, 60, 41.8); } catch (e) {}
}
doc.setFontSize(7);
doc.setTextColor(...C.gray400);
doc.text('Primary brand mark', margin + 43, y + 68, { align: 'center' });
doc.text('Use for: Sidebar, Login, Reports, Presentations', margin + 43, y + 73, { align: 'center' });

// Eye-only card
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.gray300);
doc.text('Eye-Only Icon', margin + 96, y + 4);

doc.setFillColor(...C.bgCard);
doc.roundedRect(margin + 96, y + 8, 86, 72, 3, 3, 'F');
if (logoEye) {
  try { doc.addImage(logoEye, 'PNG', margin + 109, y + 24, 60, 28.2); } catch (e) {}
}
doc.setFontSize(7);
doc.setTextColor(...C.gray400);
doc.text('Compact brand mark', margin + 96 + 43, y + 68, { align: 'center' });
doc.text('Use for: Favicons, App Icons, Social Profiles', margin + 96 + 43, y + 73, { align: 'center' });

y += 88;

// Minimum sizes
doc.setFont(FONT, 'bold');
doc.setFontSize(8);
doc.setTextColor(...C.gray300);
doc.text('Minimum Sizes', margin, y);
y += 6;

// Min full lockup
doc.setFillColor(...C.bgCard);
doc.roundedRect(margin, y, 40, 28, 2, 2, 'F');
if (logoFull) {
  try { doc.addImage(logoFull, 'PNG', margin + 5, y + 2, 30, 20.9); } catch (e) {}
}
doc.setFontSize(6);
doc.setTextColor(...C.gray500);
doc.text('Min: 120px / 30mm', margin, y + 33);

// Min eye icon
doc.setFillColor(...C.bgCard);
doc.roundedRect(margin + 55, y + 5, 20, 14, 2, 2, 'F');
if (logoEye) {
  try { doc.addImage(logoEye, 'PNG', margin + 57, y + 7, 16, 7.5); } catch (e) {}
}
doc.setFontSize(6);
doc.setTextColor(...C.gray500);
doc.text('Min: 24px / 8mm', margin + 55, y + 24);

y += 42;

// Clear space diagram
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.gray300);
doc.text('Clear Space', margin, y);
y += 6;

// Clear space container
doc.setFillColor(...C.bgCard);
doc.roundedRect(margin, y, 100, 70, 3, 3, 'F');

// Dashed border for exclusion zone
doc.setDrawColor(...C.cyan);
doc.setLineWidth(0.3);
doc.setLineDashPattern([2, 2], 0);
doc.roundedRect(margin + 10, y + 8, 80, 54, 2, 2, 'S');
doc.setLineDashPattern([], 0);

// Logo inside
if (logoFull) {
  try { doc.addImage(logoFull, 'PNG', margin + 20, y + 14, 60, 41.8); } catch (e) {}
}

// X labels
doc.setFontSize(8);
doc.setFont(FONT, 'bold');
doc.setTextColor(...C.cyan);
doc.text('X', margin + 5, y + 35, { align: 'center' });
doc.text('X', margin + 95, y + 35, { align: 'center' });
doc.text('X', margin + 50, y + 5, { align: 'center' });
doc.text('X', margin + 50, y + 67, { align: 'center' });

// Annotation text
const annotX = margin + 110;
doc.setFont(FONT, 'normal');
doc.setFontSize(8);
doc.setTextColor(...C.gray400);
const clearSpaceNotes = [
  'Maintain minimum clear space',
  'equal to "X" around the logo,',
  'where X = height of the eye icon.',
  '',
  'This ensures the logo remains',
  'legible and visually distinct',
  'in all applications.',
  '',
  'Below 120px, switch to the',
  'Eye-Only Icon variant.',
];
clearSpaceNotes.forEach((line, i) => {
  doc.text(line, annotX, y + 10 + i * 5.5);
});

// ══════════════════════════════════════════
// PAGE 4: LOGO DON'TS
// ══════════════════════════════════════════

doc.addPage();
darkPage();
y = 25;
y = sectionTitleDark('Logo Misuse', y);

doc.setFont(FONT, 'normal');
doc.setFontSize(9);
doc.setTextColor(...C.gray400);
doc.text('Never use the logo in any of these ways.', margin + 8, y - 2);
y += 6;

const cellW = 56;
const cellH = 68;
const gapX = 7;
const gapY = 8;
const colX = [margin, margin + cellW + gapX, margin + (cellW + gapX) * 2];
const rowY = [y, y + cellH + gapY];

const donts = [
  { label: 'Do not rotate', col: 0, row: 0 },
  { label: 'Do not stretch', col: 1, row: 0 },
  { label: 'Do not crop', col: 2, row: 0 },
  { label: 'Do not recolor', col: 0, row: 1 },
  { label: 'Do not add effects', col: 1, row: 1 },
  { label: 'Do not mismatch variant', col: 2, row: 1 },
];

donts.forEach((d, idx) => {
  const cx = colX[d.col];
  const cy = rowY[d.row];

  // Card background (white for last one to show dark logo on wrong bg)
  if (idx === 5) {
    doc.setFillColor(...C.white);
  } else {
    doc.setFillColor(...C.bgCard);
  }
  doc.roundedRect(cx, cy, cellW, cellH, 3, 3, 'F');

  // Place logo with distortion
  if (logoFull) {
    try {
      if (idx === 0) {
        // Rotate: place normally (jsPDF can't rotate images easily)
        doc.addImage(logoFull, 'PNG', cx + 8, cy + 8, 40, 27.9);
        // Draw tilted lines to suggest rotation
        doc.setDrawColor(...C.gray400);
        doc.setLineWidth(0.4);
        doc.line(cx + 8, cy + 40, cx + 48, cy + 32);
        doc.line(cx + 8, cy + 42, cx + 48, cy + 34);
      } else if (idx === 1) {
        // Stretch: squished dimensions
        doc.addImage(logoFull, 'PNG', cx + 4, cy + 10, 48, 20);
      } else if (idx === 2) {
        // Crop: place oversized and mask edges
        doc.addImage(logoFull, 'PNG', cx - 8, cy + 4, 60, 41.8);
        // Mask with bgCard rects on edges
        doc.setFillColor(...C.bgCard);
        doc.rect(cx - 10, cy, 10, cellH, 'F');
        doc.rect(cx + cellW, cy, 10, cellH, 'F');
      } else if (idx === 3) {
        // Recolor: logo + orange overlay
        doc.addImage(logoFull, 'PNG', cx + 8, cy + 8, 40, 27.9);
        const gState = new doc.GState({ opacity: 0.45 });
        doc.setGState(gState);
        doc.setFillColor(...C.orange);
        doc.roundedRect(cx + 8, cy + 8, 40, 27.9, 2, 2, 'F');
        doc.setGState(new doc.GState({ opacity: 1.0 }));
      } else if (idx === 4) {
        // Add effects: logo + glow rings
        doc.addImage(logoFull, 'PNG', cx + 8, cy + 8, 40, 27.9);
        doc.setDrawColor(...C.cyan);
        doc.setLineWidth(0.5);
        const gState2 = new doc.GState({ opacity: 0.3 });
        doc.setGState(gState2);
        doc.roundedRect(cx + 4, cy + 4, 48, 35.9, 4, 4, 'S');
        doc.roundedRect(cx + 1, cy + 1, 54, 41.9, 6, 6, 'S');
        doc.setGState(new doc.GState({ opacity: 1.0 }));
      } else if (idx === 5) {
        // Mismatch: dark logo on white bg — wordmark invisible
        doc.addImage(logoFull, 'PNG', cx + 8, cy + 8, 40, 27.9);
      }
    } catch (e) {}
  }

  // Red X overlay lines
  doc.setDrawColor(...C.sevCrit);
  doc.setLineWidth(1.2);
  doc.line(cx + 4, cy + 4, cx + cellW - 4, cy + cellH - 14);
  doc.line(cx + cellW - 4, cy + 4, cx + 4, cy + cellH - 14);

  // Red circle badge top-right
  doc.setFillColor(...C.sevCrit);
  doc.circle(cx + cellW - 8, cy + 8, 5, 'F');
  doc.setFont(FONT, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.white);
  doc.text('X', cx + cellW - 8, cy + 10, { align: 'center' });

  // Label
  doc.setFont(FONT, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...C.sevCrit);
  doc.text(d.label, cx + cellW / 2, cy + cellH - 3, { align: 'center' });
});

// ══════════════════════════════════════════
// PAGE 5: LIGHT BACKGROUND VARIANTS
// ══════════════════════════════════════════

doc.addPage();
whitePage();
y = 25;
y = sectionTitleLight('Logo Variants: Dark & Light', y);

// Subtitle
doc.setFont(FONT, 'normal');
doc.setFontSize(9);
doc.setTextColor(...C.gray500);
doc.text('RealSync provides two logo variants optimized for different background contexts.', margin + 8, y - 2);
y += 8;

// ── ROW 1: FULL LOCKUP ──
doc.setFont(FONT, 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.textDark);
doc.text('Full Lockup', margin, y);
y += 6;

// Dark variant card
doc.setFillColor(...C.bgDeep);
doc.roundedRect(margin, y, 86, 70, 4, 4, 'F');
if (logoFull) {
  try { doc.addImage(logoFull, 'PNG', margin + 13, y + 8, 60, 41.8); } catch (e) {}
}
doc.setFont(FONT, 'bold');
doc.setFontSize(7);
doc.setTextColor(...C.cyan);
doc.text('Dark Background Variant', margin + 43, y + 58, { align: 'center' });
doc.setFont(FONT, 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray400);
doc.text('For app UI, dark presentations, reports', margin + 43, y + 63, { align: 'center' });

// Light variant card
const lightCompX = margin + 96;
doc.setFillColor(...C.white);
doc.roundedRect(lightCompX, y, 86, 70, 4, 4, 'F');
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.5);
doc.roundedRect(lightCompX, y, 86, 70, 4, 4, 'S');
if (logoLightFull) {
  try { doc.addImage(logoLightFull, 'PNG', lightCompX + 13, y + 8, 60, 41.8); } catch (e) {}
}
doc.setFont(FONT, 'bold');
doc.setFontSize(7);
doc.setTextColor(...C.purpleDeep);
doc.text('Light Background Variant', lightCompX + 43, y + 58, { align: 'center' });
doc.setFont(FONT, 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray500);
doc.text('For emails, letterheads, white papers, print', lightCompX + 43, y + 63, { align: 'center' });

y += 80;

// ── ROW 2: EYE-ONLY ──
doc.setFont(FONT, 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.textDark);
doc.text('Eye-Only Icon', margin, y);
y += 6;

// Dark variant
doc.setFillColor(...C.bgDeep);
doc.roundedRect(margin, y, 86, 55, 4, 4, 'F');
if (logoEye) {
  try { doc.addImage(logoEye, 'PNG', margin + 13, y + 10, 60, 28.2); } catch (e) {}
}
doc.setFont(FONT, 'bold');
doc.setFontSize(7);
doc.setTextColor(...C.cyan);
doc.text('Dark Background Variant', margin + 43, y + 45, { align: 'center' });
doc.setFont(FONT, 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray400);
doc.text('Favicons, app icons, dark social profiles', margin + 43, y + 50, { align: 'center' });

// Light variant
doc.setFillColor(...C.white);
doc.roundedRect(lightCompX, y, 86, 55, 4, 4, 'F');
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.5);
doc.roundedRect(lightCompX, y, 86, 55, 4, 4, 'S');
if (logoLightEye) {
  try { doc.addImage(logoLightEye, 'PNG', lightCompX + 13, y + 10, 60, 28.2); } catch (e) {}
}
doc.setFont(FONT, 'bold');
doc.setFontSize(7);
doc.setTextColor(...C.purpleDeep);
doc.text('Light Background Variant', lightCompX + 43, y + 45, { align: 'center' });
doc.setFont(FONT, 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray500);
doc.text('Light social profiles, compact print placement', lightCompX + 43, y + 50, { align: 'center' });

y += 65;

// ── USAGE NOTES ──
doc.setFillColor(...C.gray100);
doc.roundedRect(margin, y, contentW, 40, 3, 3, 'F');

doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.textDark);
doc.text('When to Use Each Variant', margin + 6, y + 8);

const variantNotes = [
  { dot: C.bgCard, text: 'Dark variant: App UI, dark-themed slides, PDF reports with dark headers, social media dark cards.' },
  { dot: C.cyan, text: 'Light variant: Email signatures, letterheads, invoices, white papers, light-themed presentations, business cards.' },
  { dot: C.orange, text: 'Never place the dark variant on white backgrounds \u2014 the wordmark will be invisible.' },
  { dot: C.sevLow, text: 'Both variants preserve the full brand gradient (cyan \u2192 blue \u2192 purple) on the eye symbol.' },
];

let noteY = y + 14;
variantNotes.forEach((n) => {
  doc.setFillColor(...n.dot);
  doc.circle(margin + 9, noteY, 1.5, 'F');
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.gray500);
  doc.text(n.text, margin + 14, noteY + 1);
  noteY += 7;
});

// ══════════════════════════════════════════
// PAGE 6: LIGHT LOGO USE CASES
// ══════════════════════════════════════════

doc.addPage();
whitePage();
y = 25;
y = sectionTitleLight('Light Logo: Use Cases', y);

doc.setFont(FONT, 'normal');
doc.setFontSize(9);
doc.setTextColor(...C.gray500);
doc.text('How the light-background variant appears in practical applications.', margin + 8, y - 2);
y += 8;

// ── USE CASE 1: EMAIL SIGNATURE ──
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.purpleDeep);
doc.text('Email Signature', margin, y);
y += 5;

// Signature container
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.4);
doc.roundedRect(margin, y, contentW, 38, 2, 2, 'S');

// Vertical divider
const sigDivX = margin + 48;
doc.setFillColor(...C.gray200);
doc.rect(sigDivX, y + 4, 0.3, 30, 'F');

// Logo left side
if (logoLightFull) {
  try { doc.addImage(logoLightFull, 'PNG', margin + 6, y + 4, 36, 25); } catch (e) {}
}

// Contact details right
const detX = sigDivX + 6;
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.textDark);
doc.text('Ahmed', detX, y + 10);

doc.setFont(FONT, 'normal');
doc.setFontSize(7);
doc.setTextColor(...C.gray500);
doc.text('Fullstack Developer', detX, y + 15);
doc.text('RealSync Pty Ltd', detX, y + 20);

doc.setTextColor(...C.cyan);
doc.text('ahmed@realsync.ai', detX, y + 26);

doc.setFont(FONT, 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray400);
doc.text('+61 400 000 000', detX, y + 31);

// Gradient accent at bottom
drawGradientStrip(margin + 2, y + 35, contentW - 4, 0.8);

y += 46;

// ── USE CASE 2: LETTERHEAD ──
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.purpleDeep);
doc.text('Letterhead', margin, y);
y += 5;

// Letterhead frame
const ucLhW = 130;
const ucLhH = 80;
doc.setFillColor(...C.gray100);
doc.roundedRect(margin + 2, y + 2, ucLhW, ucLhH, 2, 2, 'F');
doc.setFillColor(...C.white);
doc.roundedRect(margin, y, ucLhW, ucLhH, 2, 2, 'F');
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.3);
doc.roundedRect(margin, y, ucLhW, ucLhH, 2, 2, 'S');

// Logo top-left
if (logoLightFull) {
  try { doc.addImage(logoLightFull, 'PNG', margin + 4, y + 3, 30, 20.9); } catch (e) {}
}

// Company details right
doc.setFont(FONT, 'bold');
doc.setFontSize(5);
doc.setTextColor(...C.purpleDeep);
doc.text('RealSync Pty Ltd', margin + ucLhW - 4, y + 6, { align: 'right' });
doc.setFont(FONT, 'normal');
doc.setFontSize(4);
doc.setTextColor(...C.gray400);
doc.text('Level 12, 100 Pacific Hwy', margin + ucLhW - 4, y + 10, { align: 'right' });
doc.text('North Sydney NSW 2060', margin + ucLhW - 4, y + 14, { align: 'right' });
doc.setTextColor(...C.cyan);
doc.text('contact@realsync.ai', margin + ucLhW - 4, y + 18, { align: 'right' });

// Gradient accent line
drawGradientStrip(margin + 4, y + 24, ucLhW - 8, 0.6);

// Simulated body text
doc.setFont(FONT, 'normal');
doc.setFontSize(5);
doc.setTextColor(...C.gray500);
doc.text('7 February 2026', margin + 4, y + 30);

for (let i = 0; i < 6; i++) {
  doc.setFillColor(...C.gray300);
  const bw = i === 5 ? 40 : ucLhW - 12;
  doc.roundedRect(margin + 4, y + 36 + i * 4, bw, 1.5, 0.5, 0.5, 'F');
}

// Signature
doc.setFont(FONT, 'normal');
doc.setFontSize(4);
doc.setTextColor(...C.gray500);
doc.text('Kind regards,', margin + 4, y + 64);
doc.setFillColor(...C.cyan);
doc.rect(margin + 4, y + 67, 16, 0.4, 'F');
doc.setFont(FONT, 'bold');
doc.setFontSize(4);
doc.setTextColor(...C.textDark);
doc.text('Ahmed', margin + 4, y + 72);

// Footer gradient
drawGradientStrip(margin + 4, y + ucLhH - 4, ucLhW - 8, 0.4);

y += ucLhH + 10;

// ── USE CASE 3: BUSINESS CARD ──
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.purpleDeep);
doc.text('Business Card', margin, y);
y += 5;

// Two cards side by side: front (light) and back (dark)
const bcW2 = 85;
const bcH2 = 50;

// Front (light)
doc.setFillColor(...C.white);
doc.roundedRect(margin, y, bcW2, bcH2, 3, 3, 'F');
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.3);
doc.roundedRect(margin, y, bcW2, bcH2, 3, 3, 'S');

if (logoLightFull) {
  try { doc.addImage(logoLightFull, 'PNG', margin + 4, y + 4, 28, 19.5); } catch (e) {}
}

// Gradient accent
drawGradientStrip(margin + 4, y + 26, bcW2 - 8, 0.6);

doc.setFont(FONT, 'bold');
doc.setFontSize(7);
doc.setTextColor(...C.textDark);
doc.text('Ahmed', margin + 4, y + 33);

doc.setFont(FONT, 'normal');
doc.setFontSize(5);
doc.setTextColor(...C.gray500);
doc.text('Fullstack Developer', margin + 4, y + 37);
doc.text('ahmed@realsync.ai', margin + 4, y + 41);
doc.text('+61 400 000 000', margin + 4, y + 45);

doc.setFontSize(4);
doc.setTextColor(...C.gray400);
doc.text('FRONT', margin + bcW2 / 2, y + bcH2 - 2, { align: 'center' });

// Back (dark)
const bc2X2 = margin + bcW2 + 10;
doc.setFillColor(...C.bgDeep);
doc.roundedRect(bc2X2, y, bcW2, bcH2, 3, 3, 'F');

if (logoFull) {
  try { doc.addImage(logoFull, 'PNG', bc2X2 + (bcW2 - 50) / 2, y + 6, 50, 34.8); } catch (e) {}
}

drawGradientStrip(bc2X2 + 10, y + bcH2 - 6, bcW2 - 20, 0.8);

doc.setFontSize(4);
doc.setTextColor(...C.gray400);
doc.text('BACK', bc2X2 + bcW2 / 2, y + bcH2 - 2, { align: 'center' });

// ══════════════════════════════════════════
// PAGE 7: COLOR PALETTE — PRIMARY & SECONDARY
// ══════════════════════════════════════════

doc.addPage();
whitePage();
y = 25;
y = sectionTitleLight('Color Palette', y);

// Primary heading
doc.setFont(FONT, 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.purpleDeep);
doc.text('Primary Colors', margin + 8, y);
y += 6;

const swatchW = 54;
const swatchH = 35;
const swatchGap = 10;
const primarySwatches = [
  { name: 'Cyan', rgb: C.cyan, hex: '#22D3EE', rgbStr: 'rgb(34, 211, 238)' },
  { name: 'Blue', rgb: C.blue, hex: '#3B82F6', rgbStr: 'rgb(59, 130, 246)' },
  { name: 'Purple Deep', rgb: C.purpleDeep, hex: '#6D28D9', rgbStr: 'rgb(109, 40, 217)' },
];

primarySwatches.forEach((s, i) => {
  const sx = margin + i * (swatchW + swatchGap);
  drawColorSwatch(sx, y, swatchW, swatchH, s.rgb, s.name, s.hex, s.rgbStr);
});

y += swatchH + 22;

// Divider
doc.setFillColor(...C.gray200);
doc.rect(margin, y, contentW, 0.3, 'F');
y += 8;

// Secondary heading
doc.setFont(FONT, 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.purpleDeep);
doc.text('Secondary Colors', margin + 8, y);
y += 6;

const secondarySwatches = [
  { name: 'Purple Light', rgb: C.purple, hex: '#A855F7', rgbStr: 'rgb(168, 85, 247)' },
  { name: 'Orange', rgb: C.orange, hex: '#FB923C', rgbStr: 'rgb(251, 146, 60)' },
];

secondarySwatches.forEach((s, i) => {
  const sx = margin + i * (swatchW + swatchGap);
  drawColorSwatch(sx, y, swatchW, swatchH, s.rgb, s.name, s.hex, s.rgbStr);
});

y += swatchH + 24;

// Divider
doc.setFillColor(...C.gray200);
doc.rect(margin, y, contentW, 0.3, 'F');
y += 8;

// Usage rules
doc.setFont(FONT, 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.purpleDeep);
doc.text('Usage Principles', margin + 8, y);
y += 7;

const usageLines = [
  'Cyan is the dominant action color for buttons, links, and interactive highlights.',
  'Blue supports as secondary accent \u2014 active navigation, pagination, selected tabs.',
  'Purple anchors the brand identity in headers, gradients, and premium features.',
  'Orange is reserved exclusively for warnings and high-priority alert states.',
  'Status colors (green, yellow, red) are never used as decorative accents.',
];

doc.setFont(FONT, 'normal');
doc.setFontSize(8);
doc.setTextColor(...C.gray500);
usageLines.forEach((line) => {
  doc.setFillColor(...C.gray300);
  doc.circle(margin + 2, y - 1, 1, 'F');
  doc.text(line, margin + 6, y);
  y += 5.5;
});

// ══════════════════════════════════════════
// PAGE 8: COLOR PALETTE — SEVERITY & NEUTRALS
// ══════════════════════════════════════════

doc.addPage();
whitePage();
y = 25;
y = sectionTitleLight('Severity & Status Colors', y);

// Severity swatches (4 across)
const sevSwatchW = 42;
const sevSwatchH = 32;
const sevGap = 3;

const severitySwatches = [
  { name: 'Low (Safe)', rgb: C.sevLow, hex: '#4ADE80' },
  { name: 'Medium', rgb: C.sevMed, hex: '#FACC15' },
  { name: 'High', rgb: C.sevHigh, hex: '#FB923C' },
  { name: 'Critical', rgb: C.sevCrit, hex: '#F87171' },
];

severitySwatches.forEach((s, i) => {
  const sx = margin + i * (sevSwatchW + sevGap);
  drawColorSwatch(sx, y, sevSwatchW, sevSwatchH, s.rgb, s.name, s.hex);
});

y += sevSwatchH + 20;

// Divider
doc.setFillColor(...C.gray200);
doc.rect(margin, y, contentW, 0.3, 'F');
y += 8;

// Background scale
y = sectionTitleLight('Background Scale', y);
y += 2;

// Light frame for dark swatches
doc.setFillColor(...C.gray200);
doc.roundedRect(margin, y, contentW, 52, 3, 3, 'F');

const bgSwatches = [
  { name: 'Deep', rgb: C.bgDeep, hex: '#0A0A14' },
  { name: 'Base', rgb: C.bgBase, hex: '#0F0F1E' },
  { name: 'Card', rgb: C.bgCard, hex: '#1A1A2E' },
  { name: 'Elevated', rgb: C.bgElevated, hex: '#2A2A3E' },
  { name: 'Hover', rgb: C.bgHover, hex: '#3A3A4E' },
];

const bgSwW = 34;
const bgSwGap = 1.5;
bgSwatches.forEach((s, i) => {
  const sx = margin + 2 + i * (bgSwW + bgSwGap);
  doc.setFillColor(...s.rgb);
  doc.roundedRect(sx, y + 3, bgSwW, 38, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setFont(FONT, 'bold');
  doc.setTextColor(...C.white);
  doc.text(s.name, sx + bgSwW / 2, y + 20, { align: 'center' });
  doc.setFont(FONT, 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...C.gray400);
  doc.text(s.hex, sx + bgSwW / 2, y + 26, { align: 'center' });
});

y += 60;

// Divider
doc.setFillColor(...C.gray200);
doc.rect(margin, y, contentW, 0.3, 'F');
y += 8;

// Text colors
y = sectionTitleLight('Text & Border Colors', y);
y += 2;

const textSwatches = [
  { name: 'White', rgb: C.white, hex: '#FFFFFF' },
  { name: 'Gray 200', rgb: C.gray200, hex: '#E5E7EB' },
  { name: 'Gray 300', rgb: C.gray300, hex: '#D1D5DB' },
  { name: 'Gray 400', rgb: C.gray400, hex: '#9CA3AF' },
  { name: 'Gray 500', rgb: C.gray500, hex: '#6B7280' },
  { name: 'Border', rgb: C.borderIn, hex: '#374151' },
];

const txtSwW = 27;
const txtSwGap = 3;
textSwatches.forEach((s, i) => {
  const sx = margin + i * (txtSwW + txtSwGap);
  drawColorSwatch(sx, y, txtSwW, 20, s.rgb, s.name, s.hex);
});

// ══════════════════════════════════════════
// PAGE 9: GRADIENTS & COLOR USAGE
// ══════════════════════════════════════════

doc.addPage();
darkPage();
y = 25;
y = sectionTitleDark('Gradients & Color Usage', y);

// Gradient bars
const gradients = [
  { name: 'Primary Brand Gradient', colors: [C.purpleDeep, C.blue, C.cyan], labels: ['#6D28D9', '#3B82F6', '#22D3EE'] },
  { name: 'Action Gradient', colors: [C.cyan, C.blue], labels: ['#22D3EE', '#3B82F6'] },
  { name: 'Hover Gradient', colors: [C.cyanDark, C.blueActive], labels: ['#06B6D4', '#2563EB'] },
];

gradients.forEach((g) => {
  doc.setFont(FONT, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.white);
  doc.text(g.name, margin, y);
  y += 4;

  const barH = 16;
  const segW = contentW / g.colors.length;
  g.colors.forEach((c, i) => {
    doc.setFillColor(...c);
    if (i === 0) {
      doc.roundedRect(margin, y, segW, barH, 3, 0, 'F');
      doc.rect(margin + 3, y, segW - 3, barH, 'F');
    } else if (i === g.colors.length - 1) {
      doc.rect(margin + i * segW, y, segW - 3, barH, 'F');
      doc.roundedRect(margin + i * segW, y, segW, barH, 0, 3, 'F');
    } else {
      doc.rect(margin + i * segW, y, segW, barH, 'F');
    }
  });

  y += barH + 3;
  doc.setFont(FONT, 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...C.gray400);
  doc.text(g.labels.join('  \u2192  '), margin, y);
  y += 10;
});

y += 4;

// 70-20-10 Rule
doc.setFillColor(...C.bgElevated);
doc.rect(margin, y - 2, contentW, 0.3, 'F');
y += 8;
y = sectionTitleDark('Color Distribution: 70-20-10 Rule', y);
y += 2;

const barTotalW = contentW;
const bar70W = barTotalW * 0.7;
const bar20W = barTotalW * 0.2;
const bar10W = barTotalW * 0.1;
const barY = y;
const barH2 = 24;

doc.setFillColor(...C.bgBase);
doc.roundedRect(margin, barY, bar70W, barH2, 3, 0, 'F');
doc.rect(margin + 3, barY, bar70W - 3, barH2, 'F');

doc.setFillColor(...C.cyan);
doc.rect(margin + bar70W, barY, bar20W, barH2, 'F');

doc.setFillColor(...C.orange);
doc.rect(margin + bar70W + bar20W, barY, bar10W - 3, barH2, 'F');
doc.roundedRect(margin + bar70W + bar20W, barY, bar10W, barH2, 0, 3, 'F');

// Percentage labels
doc.setFont(FONT, 'bold');
doc.setFontSize(12);
doc.setTextColor(...C.white);
doc.text('70%', margin + bar70W / 2, barY + barH2 / 2 + 3, { align: 'center' });
doc.setFontSize(10);
doc.setTextColor(...C.bgDeep);
doc.text('20%', margin + bar70W + bar20W / 2, barY + barH2 / 2 + 3, { align: 'center' });
doc.setFontSize(8);
doc.setTextColor(...C.white);
doc.text('10%', margin + bar70W + bar20W + bar10W / 2, barY + barH2 / 2 + 2, { align: 'center' });

y = barY + barH2 + 5;
doc.setFont(FONT, 'normal');
doc.setFontSize(7);
doc.setTextColor(...C.gray400);
doc.text('Dark Backgrounds & Surfaces', margin, y);
doc.text('Brand Accents', margin + bar70W, y);
doc.text('Alerts', margin + bar70W + bar20W, y);

y += 14;

// Usage rules with dots
doc.setFillColor(...C.bgElevated);
doc.rect(margin, y - 2, contentW, 0.3, 'F');
y += 8;
y = sectionTitleDark('Application Rules', y);
y += 2;

const rules = [
  { color: C.cyan, text: 'Use Cyan as the primary interactive color for buttons, links, and active states.' },
  { color: C.blue, text: 'Blue supports information hierarchy \u2014 secondary buttons, selected tabs, hover accents.' },
  { color: C.purple, text: 'Purple anchors the brand in headers, gradients, and the logo identity.' },
  { color: C.orange, text: 'Reserve Orange exclusively for warnings, high-priority alerts, and urgent CTAs.' },
  { color: C.sevCrit, text: 'Red indicates critical status only. Never use for decorative purposes.' },
];

rules.forEach((r) => {
  doc.setFillColor(...r.color);
  doc.circle(margin + 4, y - 1.5, 2.5, 'F');
  doc.setFont(FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.white);
  doc.text(r.text, margin + 12, y);
  y += 11;
});

// ══════════════════════════════════════════
// PAGE 10: TYPOGRAPHY
// ══════════════════════════════════════════

doc.addPage();
whitePage();
y = 25;
y = sectionTitleLight('Typography', y);

// Font identity
doc.setFont(FONT, 'bold');
doc.setFontSize(24);
doc.setTextColor(...C.textDark);
doc.text('Space Grotesk', margin, y + 4);

doc.setFont(FONT, 'normal');
doc.setFontSize(9);
doc.setTextColor(...C.gray400);
doc.text('Primary Brand Typeface  |  Geometric Sans-Serif  |  Open Source (SIL OFL)', margin, y + 12);

y += 18;

// Divider
doc.setFillColor(...C.gray200);
doc.rect(margin, y, contentW, 0.3, 'F');
y += 8;

// Character set preview
doc.setFillColor(...C.gray100);
doc.roundedRect(margin, y, contentW, 24, 3, 3, 'F');
doc.setFont(FONT, 'normal');
doc.setFontSize(10);
doc.setTextColor(...C.textDark);
doc.text('ABCDEFGHIJKLMNOPQRSTUVWXYZ', margin + 8, y + 9);
doc.text('abcdefghijklmnopqrstuvwxyz  0123456789', margin + 8, y + 19);
y += 30;

// Type scale
doc.setFont(FONT, 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.purpleDeep);
doc.text('Type Scale', margin + 8, y);
y += 14;

const typeScale = [
  { size: 28, weight: 'bold', text: 'Display Large', label: '28pt / Bold / 3rem' },
  { size: 22, weight: 'bold', text: 'Heading One', label: '22pt / Bold / 1.5rem' },
  { size: 18, weight: 'bold', text: 'Heading Two', label: '18pt / Bold / 1.25rem' },
  { size: 14, weight: 'bold', text: 'Heading Three', label: '14pt / Bold / 1.125rem' },
  { size: 11, weight: 'normal', text: 'Body Large \u2014 Primary content text', label: '11pt / Regular / 1rem' },
  { size: 9,  weight: 'normal', text: 'Body Default \u2014 Used for descriptions and paragraph text', label: '9pt / Regular / 0.875rem' },
  { size: 8,  weight: 'normal', text: 'Caption \u2014 Labels, timestamps, metadata', label: '8pt / Regular / 0.75rem' },
  { size: 7,  weight: 'normal', text: 'Tiny \u2014 Footer text and fine print', label: '7pt / Regular' },
];

typeScale.forEach((t) => {
  doc.setFont(FONT, t.weight);
  doc.setFontSize(t.size);
  doc.setTextColor(...C.textDark);
  doc.text(t.text, margin, y);

  // Size label right-aligned, vertically centered with the text
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.gray400);
  doc.text(t.label, pageW - margin, y, { align: 'right' });

  // Thin rule below text
  doc.setFillColor(...C.gray100);
  const lineSpacing = Math.max(t.size * 0.5, 5);
  doc.rect(margin, y + 3, contentW, 0.2, 'F');
  y += lineSpacing + 6;
});

y += 6;

// Font weights
doc.setFont(FONT, 'bold');
doc.setFontSize(10);
doc.setTextColor(...C.purpleDeep);
doc.text('Font Weights', margin + 8, y);
y += 8;

const weights = [
  { font: FONT_LIGHT, style: 'normal', text: 'Space Grotesk Light \u2014 Subtle labels, decorative headings', label: '300 Light' },
  { font: FONT, style: 'normal', text: 'Space Grotesk Regular \u2014 Body text, descriptions, captions', label: '400 Regular' },
  { font: FONT_MEDIUM, style: 'normal', text: 'Space Grotesk Medium \u2014 Sub-headings, emphasis, navigation', label: '500 Medium' },
  { font: FONT, style: 'bold', text: 'Space Grotesk Bold \u2014 Headings, labels, CTAs', label: '700 Bold' },
];

weights.forEach((w) => {
  doc.setFont(w.font, w.style);
  doc.setFontSize(10);
  doc.setTextColor(...C.textDark);
  doc.text(w.text, margin, y);
  doc.setFont(FONT, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...C.gray400);
  doc.text(w.label, pageW - margin, y, { align: 'right' });
  y += 9;
});

// ══════════════════════════════════════════
// PAGE 10b: DATA & CODE + UI COMPONENTS
// ══════════════════════════════════════════

doc.addPage();
darkPage();
y = 25;
y = sectionTitleDark('Data & Code Values', y);

doc.setFillColor(...C.bgCard);
doc.roundedRect(margin, y, contentW, 22, 3, 3, 'F');
doc.setFont('courier', 'normal');
doc.setFontSize(9);
doc.setTextColor(...C.cyan);
doc.text('Session ID:  a7b3c8d1-e924-4f5b-9013-2e8f1a6d7c4e', margin + 6, y + 8);
doc.text('Confidence:  0.94  |  Latency: 1.2s  |  Frames: 847', margin + 6, y + 16);
y += 28;

doc.setFont(FONT, 'normal');
doc.setFontSize(7);
doc.setTextColor(...C.gray400);
doc.text('Use Courier (monospace) for session IDs, confidence scores, timestamps, and machine-generated data values.', margin, y);

// ══════════════════════════════════════════
// PAGE 11: UI COMPONENTS
// ══════════════════════════════════════════

doc.addPage();
darkPage();
y = 25;
y = sectionTitleDark('UI Components', y);

// BUTTONS
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.gray300);
doc.text('Buttons', margin + 8, y);
y += 6;

doc.setFillColor(...C.bgCard);
doc.roundedRect(margin, y, contentW, 28, 3, 3, 'F');

const buttons = [
  { label: 'Primary', fill: C.cyan, text: C.bgDeep, x: margin + 8 },
  { label: 'Secondary', fill: C.bgElevated, text: C.white, x: margin + 52 },
  { label: 'Danger', fill: C.sevCrit, text: C.white, x: margin + 96 },
  { label: 'Ghost', fill: null, text: C.cyan, x: margin + 140 },
];

buttons.forEach((b) => {
  const btnY = y + 8;
  if (b.fill) {
    doc.setFillColor(...b.fill);
    doc.roundedRect(b.x, btnY, 36, 12, 2, 2, 'F');
  } else {
    doc.setDrawColor(...C.cyan);
    doc.setLineWidth(0.5);
    doc.roundedRect(b.x, btnY, 36, 12, 2, 2, 'S');
  }
  doc.setFont(FONT, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...b.text);
  doc.text(b.label, b.x + 18, btnY + 7.5, { align: 'center' });
});

y += 34;

// SEVERITY BADGES
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.gray300);
doc.text('Severity Badges', margin + 8, y);
y += 6;

doc.setFillColor(...C.bgCard);
doc.roundedRect(margin, y, contentW, 22, 3, 3, 'F');

const badges = [
  { label: 'LOW', bg: C.sevLow },
  { label: 'MEDIUM', bg: C.sevMed },
  { label: 'HIGH', bg: C.sevHigh },
  { label: 'CRITICAL', bg: C.sevCrit },
];

// Calculate badge widths first, then distribute evenly across the card
doc.setFont(FONT, 'bold');
doc.setFontSize(7);
const badgeWidths = badges.map((b) => doc.getTextWidth(b.label) * 1.2 + 10);
const totalBadgeW = badgeWidths.reduce((a, b2) => a + b2, 0);
const badgeSpacing = (contentW - totalBadgeW) / (badges.length + 1);

let badgeCursorX = margin + badgeSpacing;
badges.forEach((b, idx) => {
  const badgeY = y + 6;
  const bw = badgeWidths[idx];
  const gState = new doc.GState({ opacity: 0.2 });
  doc.setGState(gState);
  doc.setFillColor(...b.bg);
  doc.roundedRect(badgeCursorX, badgeY, bw, 10, 5, 5, 'F');
  doc.setGState(new doc.GState({ opacity: 1.0 }));

  doc.setFont(FONT, 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...b.bg);
  doc.text(b.label, badgeCursorX + bw / 2, badgeY + 6.5, { align: 'center' });
  badgeCursorX += bw + badgeSpacing;
});

y += 28;

// CARD STRUCTURE
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.gray300);
doc.text('Card Structure', margin + 8, y);
y += 6;

// Card mockup — centered within left portion of the page
const cardW2 = 120;
const cardH2 = 60;
const cardX = margin;
const cardY = y;

doc.setFillColor(...C.bgCard);
doc.roundedRect(cardX, cardY, cardW2, cardH2, 4, 4, 'F');
doc.setDrawColor(...C.borderDef);
doc.setLineWidth(0.3);
doc.roundedRect(cardX, cardY, cardW2, cardH2, 4, 4, 'S');

// Header zone
doc.setFillColor(...C.bgElevated);
doc.roundedRect(cardX, cardY, cardW2, 14, 4, 4, 'F');
doc.setFillColor(...C.bgCard);
doc.rect(cardX, cardY + 10, cardW2, 4, 'F');
doc.setFont(FONT, 'bold');
doc.setFontSize(8);
doc.setTextColor(...C.white);
doc.text('Card Title', cardX + cardW2 / 2, cardY + 9, { align: 'center' });

// Divider
doc.setFillColor(...C.borderDef);
doc.rect(cardX, cardY + 14, cardW2, 0.3, 'F');

// Body
doc.setFont(FONT, 'normal');
doc.setFontSize(7);
doc.setTextColor(...C.gray300);
doc.text('Card body content area with data.', cardX + 6, cardY + 24);

doc.setFont(FONT, 'bold');
doc.setFontSize(14);
doc.setTextColor(...C.cyan);
doc.text('98.5%', cardX + 6, cardY + 38);

doc.setFont(FONT, 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.gray400);
doc.text('Confidence Score', cardX + 6, cardY + 44);

// Progress bar
doc.setFillColor(...C.bgElevated);
doc.roundedRect(cardX + 6, cardY + 48, 100, 4, 2, 2, 'F');
doc.setFillColor(...C.cyan);
doc.roundedRect(cardX + 6, cardY + 48, 85, 4, 2, 2, 'F');

// Annotations
const annX = margin + 130;
doc.setFont(FONT, 'normal');
doc.setFontSize(6);

const annotations = [
  { text: 'bgElevated header', y: cardY + 7, color: C.bgElevated },
  { text: 'borderDefault divider', y: cardY + 15, color: C.borderDef },
  { text: 'bgCard body', y: cardY + 30, color: C.bgCard },
  { text: 'cyan accent data', y: cardY + 38, color: C.cyan },
  { text: 'Progress bar', y: cardY + 50, color: C.cyan },
];

annotations.forEach((a) => {
  doc.setDrawColor(...a.color);
  doc.setLineWidth(0.3);
  doc.line(annX - 4, a.y, cardX + cardW2 + 2, a.y);
  doc.setFillColor(...a.color);
  doc.circle(annX - 4, a.y, 1.5, 'F');
  doc.setTextColor(...C.gray300);
  doc.text(a.text, annX, a.y + 1);
});

y += cardH2 + 12;

// FORM INPUT
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.gray300);
doc.text('Form Inputs', margin + 8, y);
y += 6;

const formCardW = 120;
const formPadX = 10;
const formInputW = formCardW - formPadX * 2;

doc.setFillColor(...C.bgCard);
doc.roundedRect(margin, y, formCardW, 48, 3, 3, 'F');

// Default state
doc.setFont(FONT, 'normal');
doc.setFontSize(7);
doc.setTextColor(...C.gray300);
doc.text('Email Address', margin + formPadX, y + 8);
doc.setFillColor(...C.bgDeep);
doc.roundedRect(margin + formPadX, y + 10, formInputW, 12, 2, 2, 'F');
doc.setDrawColor(...C.borderIn);
doc.setLineWidth(0.3);
doc.roundedRect(margin + formPadX, y + 10, formInputW, 12, 2, 2, 'S');
doc.setFontSize(7);
doc.setTextColor(...C.gray500);
doc.text('user@company.com', margin + formPadX + 4, y + 18);

// Focus state
doc.setTextColor(...C.gray300);
doc.text('Focus State', margin + formPadX, y + 30);
doc.setFillColor(...C.bgDeep);
doc.roundedRect(margin + formPadX, y + 32, formInputW, 12, 2, 2, 'F');
doc.setDrawColor(...C.cyan);
doc.setLineWidth(0.5);
doc.roundedRect(margin + formPadX, y + 32, formInputW, 12, 2, 2, 'S');
doc.setFontSize(7);
doc.setTextColor(...C.white);
doc.text('ahmed@realsync.ai', margin + formPadX + 4, y + 40);

// ══════════════════════════════════════════
// PAGE 12: APP UI WIREFRAME
// ══════════════════════════════════════════

doc.addPage();
whitePage();
y = 25;
y = sectionTitleLight('Application: Dashboard UI', y);

const wireX = margin;
const wireY = y;
const wireW = contentW;
const wireH = 210;

// Browser frame with subtle shadow
doc.setFillColor(...C.gray200);
doc.roundedRect(wireX + 1.5, wireY + 1.5, wireW, wireH, 4, 4, 'F');
doc.setFillColor(...C.bgDeep);
doc.roundedRect(wireX, wireY, wireW, wireH, 4, 4, 'F');
doc.setDrawColor(...C.gray300);
doc.setLineWidth(0.4);
doc.roundedRect(wireX, wireY, wireW, wireH, 4, 4, 'S');

// Sidebar
const sideW = 36;
doc.setFillColor(...C.bgBase);
doc.rect(wireX, wireY, sideW, wireH, 'F');
// Round left corners
doc.setFillColor(...C.bgBase);
doc.roundedRect(wireX, wireY, sideW + 4, wireH, 4, 4, 'F');
doc.setFillColor(...C.bgDeep);
doc.rect(wireX + sideW, wireY, 4, wireH, 'F');

// Logo in sidebar
doc.setFillColor(...C.bgCard);
doc.roundedRect(wireX + 4, wireY + 4, sideW - 8, 12, 2, 2, 'F');
doc.setFont(FONT, 'bold');
doc.setFontSize(6);
doc.setTextColor(...C.gray400);
doc.text('RealSync', wireX + sideW / 2, wireY + 12, { align: 'center' });

// Nav items
const navItems = ['Dashboard', 'Sessions', 'Reports', 'Settings', 'Help'];
navItems.forEach((item, i) => {
  const navY2 = wireY + 22 + i * 14;
  if (i === 0) {
    doc.setFillColor(...C.blueActive);
    doc.roundedRect(wireX + 4, navY2, sideW - 8, 10, 2, 2, 'F');
    doc.setTextColor(...C.white);
  } else {
    doc.setFillColor(...C.bgCard);
    doc.roundedRect(wireX + 4, navY2, sideW - 8, 10, 2, 2, 'F');
    doc.setTextColor(...C.gray400);
  }
  doc.setFont(FONT, 'normal');
  doc.setFontSize(5);
  doc.text(item, wireX + sideW / 2, navY2 + 6.5, { align: 'center' });
});

// TopBar
const topBarX = wireX + sideW;
const topBarW = wireW - sideW;
doc.setFillColor(...C.bgCard);
doc.rect(topBarX, wireY, topBarW, 16, 'F');

// Search bar in topbar
doc.setFillColor(...C.bgDeep);
doc.roundedRect(topBarX + 6, wireY + 4, 60, 8, 2, 2, 'F');
doc.setDrawColor(...C.borderIn);
doc.setLineWidth(0.2);
doc.roundedRect(topBarX + 6, wireY + 4, 60, 8, 2, 2, 'S');
doc.setFontSize(5);
doc.setTextColor(...C.gray500);
doc.text('Search...', topBarX + 10, wireY + 9.5);

// User avatar
doc.setFillColor(...C.bgElevated);
doc.circle(topBarX + topBarW - 10, wireY + 8, 4, 'F');
doc.setFont(FONT, 'bold');
doc.setFontSize(5);
doc.setTextColor(...C.cyan);
doc.text('A', topBarX + topBarW - 10, wireY + 9.5, { align: 'center' });

// Content area
const contX = topBarX + 4;
const contY = wireY + 20;
const contW = topBarW - 8;

// Meeting title bar
doc.setFillColor(...C.bgElevated);
doc.roundedRect(contX, contY, contW, 10, 2, 2, 'F');
doc.setFont(FONT, 'bold');
doc.setFontSize(6);
doc.setTextColor(...C.white);
doc.text('Q1 Financial Review', contX + 4, contY + 6.5);

// LIVE badge
doc.setFillColor(...C.cyan);
doc.roundedRect(contX + contW - 20, contY + 2, 16, 6, 3, 3, 'F');
doc.setFontSize(4);
doc.setTextColor(...C.bgDeep);
doc.text('LIVE', contX + contW - 12, contY + 6, { align: 'center' });

// Stat cards row
const statLabels = ['Alerts', 'Score', 'Lines', 'Latency'];
const statValues = ['3', '94%', '12', '1.2s'];
const statColors = [C.sevHigh, C.sevLow, C.cyan, C.blue];
const statCardW = (contW - 12) / 4;

statLabels.forEach((label, i) => {
  const scX = contX + i * (statCardW + 4);
  const scY = contY + 14;
  doc.setFillColor(...C.bgCard);
  doc.roundedRect(scX, scY, statCardW, 22, 2, 2, 'F');
  doc.setDrawColor(...C.borderDef);
  doc.setLineWidth(0.2);
  doc.roundedRect(scX, scY, statCardW, 22, 2, 2, 'S');

  doc.setFont(FONT, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...statColors[i]);
  doc.text(statValues[i], scX + statCardW / 2, scY + 12, { align: 'center' });

  doc.setFont(FONT, 'normal');
  doc.setFontSize(4);
  doc.setTextColor(...C.gray400);
  doc.text(label, scX + statCardW / 2, scY + 18, { align: 'center' });
});

// Alerts card
const alertCardY = contY + 40;
doc.setFillColor(...C.bgCard);
doc.roundedRect(contX, alertCardY, contW, 50, 2, 2, 'F');
doc.setFont(FONT, 'bold');
doc.setFontSize(6);
doc.setTextColor(...C.white);
doc.text('Live Alerts', contX + 4, alertCardY + 8);

const alerts = [
  { text: 'Deepfake Detected', color: C.sevCrit, time: '09:03' },
  { text: 'Identity Mismatch', color: C.sevHigh, time: '09:05' },
  { text: 'Fraud Language', color: C.sevMed, time: '09:08' },
];

alerts.forEach((a, i) => {
  const aY = alertCardY + 14 + i * 12;
  doc.setFillColor(...a.color);
  doc.circle(contX + 6, aY + 1.5, 1.5, 'F');
  doc.setFont(FONT, 'normal');
  doc.setFontSize(5);
  doc.setTextColor(...C.white);
  doc.text(a.text, contX + 12, aY + 3);
  doc.setTextColor(...C.gray400);
  doc.text(a.time, contX + contW - 4, aY + 3, { align: 'right' });
});

// Transcript card
const transCardY = alertCardY + 54;
doc.setFillColor(...C.bgCard);
doc.roundedRect(contX, transCardY, contW, 96, 2, 2, 'F');
doc.setFont(FONT, 'bold');
doc.setFontSize(6);
doc.setTextColor(...C.white);
doc.text('Transcript', contX + 4, transCardY + 8);

// Transcript lines (simulated)
for (let i = 0; i < 8; i++) {
  const tY = transCardY + 14 + i * 10;
  doc.setFillColor(...C.cyan);
  doc.circle(contX + 6, tY + 1.5, 1, 'F');
  doc.setFillColor(...C.bgElevated);
  const barW = 30 + Math.floor((i * 17 + 11) % 60);
  doc.roundedRect(contX + 12, tY, barW, 3, 1, 1, 'F');
}

// Legend below wireframe
const legY = wireY + wireH + 8;
const legendItems = [
  { name: 'Active / Live', color: C.cyan },
  { name: 'Card Surface', color: C.bgCard },
  { name: 'Navigation', color: C.bgBase },
  { name: 'Elevated', color: C.bgElevated },
  { name: 'Borders', color: C.borderDef },
];

legendItems.forEach((l, i) => {
  const lx = margin + i * 36;
  doc.setFillColor(...l.color);
  doc.roundedRect(lx, legY, 4, 4, 1, 1, 'F');
  // Add border for dark swatches so they're visible on white
  doc.setDrawColor(...C.gray300);
  doc.setLineWidth(0.2);
  doc.roundedRect(lx, legY, 4, 4, 1, 1, 'S');
  doc.setFontSize(6);
  doc.setTextColor(...C.gray500);
  doc.text(l.name, lx + 6, legY + 3);
});

// ══════════════════════════════════════════
// PAGE 13: LETTERHEAD & EMAIL
// ══════════════════════════════════════════

doc.addPage();
whitePage();
y = 25;
y = sectionTitleLight('Applications: Print & Email', y);

// LETTERHEAD MOCKUP (left)
const lhX = margin;
const lhY = y + 2;
const lhW = 86;
const lhH = 148;

// Shadow
doc.setFillColor(...C.gray200);
doc.roundedRect(lhX + 2, lhY + 2, lhW, lhH, 2, 2, 'F');
// Page
doc.setFillColor(...C.white);
doc.roundedRect(lhX, lhY, lhW, lhH, 2, 2, 'F');
doc.setDrawColor(...C.gray200);
doc.setLineWidth(0.3);
doc.roundedRect(lhX, lhY, lhW, lhH, 2, 2, 'S');

// Logo (use light variant for white letterhead)
if (logoLightFull) {
  try { doc.addImage(logoLightFull, 'PNG', lhX + 4, lhY + 4, 28, 19.5); } catch (e) {}
}

// Company details right
doc.setFont(FONT, 'bold');
doc.setFontSize(5);
doc.setTextColor(...C.purpleDeep);
doc.text('RealSync Pty Ltd', lhX + lhW - 4, lhY + 8, { align: 'right' });
doc.setFont(FONT, 'normal');
doc.setFontSize(4);
doc.setTextColor(...C.gray400);
doc.text('Level 12, 100 Pacific Hwy', lhX + lhW - 4, lhY + 12, { align: 'right' });
doc.text('North Sydney NSW 2060', lhX + lhW - 4, lhY + 16, { align: 'right' });
doc.setTextColor(...C.cyan);
doc.text('contact@realsync.ai', lhX + lhW - 4, lhY + 20, { align: 'right' });

// Gradient line
drawGradientStrip(lhX + 4, lhY + 26, lhW - 8, 0.8);

// Date
doc.setFont(FONT, 'normal');
doc.setFontSize(5);
doc.setTextColor(...C.gray500);
doc.text('7 February 2026', lhX + 4, lhY + 34);

// Recipient lines (gray bars)
for (let i = 0; i < 3; i++) {
  doc.setFillColor(...C.gray200);
  doc.roundedRect(lhX + 4, lhY + 40 + i * 5, 30 + i * 5, 2, 0.5, 0.5, 'F');
}

// Body text lines
for (let i = 0; i < 10; i++) {
  doc.setFillColor(...C.gray300);
  const bw = i === 9 ? 25 : 74;
  doc.roundedRect(lhX + 4, lhY + 62 + i * 5, bw, 1.5, 0.5, 0.5, 'F');
}

// Signature
doc.setFont(FONT, 'normal');
doc.setFontSize(5);
doc.setTextColor(...C.gray500);
doc.text('Kind regards,', lhX + 4, lhY + 120);
doc.setFillColor(...C.cyan);
doc.rect(lhX + 4, lhY + 124, 18, 0.4, 'F');
doc.setFont(FONT, 'bold');
doc.setFontSize(5);
doc.setTextColor(...C.textDark);
doc.text('Ahmed', lhX + 4, lhY + 130);

// Footer gradient
drawGradientStrip(lhX + 4, lhY + lhH - 8, lhW - 8, 0.5);
doc.setFont(FONT, 'normal');
doc.setFontSize(4);
doc.setTextColor(...C.gray400);
doc.text('realsync.ai', lhX + lhW / 2, lhY + lhH - 4, { align: 'center' });

// EMAIL MOCKUP (right)
const emX = margin + 96;
const emY = lhY;
const emW = 86;
const emH = lhH;

doc.setFillColor(...C.bgDeep);
doc.roundedRect(emX, emY, emW, emH, 3, 3, 'F');

// Email header
doc.setFillColor(...C.bgCard);
doc.roundedRect(emX, emY, emW, 20, 3, 3, 'F');
doc.setFillColor(...C.bgDeep);
doc.rect(emX, emY + 16, emW, 4, 'F');

if (logoFull) {
  try { doc.addImage(logoFull, 'PNG', emX + 4, emY + 2, 20, 13.9); } catch (e) {}
}
doc.setFont(FONT, 'bold');
doc.setFontSize(5);
doc.setTextColor(...C.white);
doc.text('Meeting Security Alert', emX + emW - 4, emY + 10, { align: 'right' });

// Gradient divider
drawGradientStrip(emX + 4, emY + 22, emW - 8, 0.8);

// Email greeting
doc.setFont(FONT, 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.white);
doc.text('Hello Ahmed,', emX + 6, emY + 32);

// Email body lines
for (let i = 0; i < 4; i++) {
  doc.setFillColor(...C.bgElevated);
  const ew = i === 3 ? 35 : 72;
  doc.roundedRect(emX + 6, emY + 38 + i * 5, ew, 1.5, 0.5, 0.5, 'F');
}

// Alert card inside email
doc.setFillColor(...C.bgCard);
doc.roundedRect(emX + 6, emY + 64, emW - 12, 22, 2, 2, 'F');
doc.setDrawColor(...C.borderDef);
doc.setLineWidth(0.2);
doc.roundedRect(emX + 6, emY + 64, emW - 12, 22, 2, 2, 'S');

doc.setFillColor(...C.orange);
doc.circle(emX + 12, emY + 72, 2, 'F');
doc.setFont(FONT, 'bold');
doc.setFontSize(6);
doc.setTextColor(...C.orange);
doc.text('3 alerts detected', emX + 18, emY + 74);
doc.setFont(FONT, 'normal');
doc.setFontSize(5);
doc.setTextColor(...C.gray400);
doc.text('Q1 Board Meeting  |  09:00 AM', emX + 18, emY + 80);

// CTA button
doc.setFillColor(...C.cyan);
doc.roundedRect(emX + (emW - 40) / 2, emY + 94, 40, 10, 2, 2, 'F');
doc.setFont(FONT, 'bold');
doc.setFontSize(6);
doc.setTextColor(...C.bgDeep);
doc.text('View Report', emX + emW / 2, emY + 100.5, { align: 'center' });

// Email footer
doc.setFillColor(...C.bgBase);
doc.roundedRect(emX, emY + emH - 18, emW, 18, 0, 0, 'F');
doc.roundedRect(emX, emY + emH - 5, emW, 5, 3, 3, 'F');
drawGradientStrip(emX + 4, emY + emH - 16, emW - 8, 0.5);
doc.setFont(FONT, 'normal');
doc.setFontSize(4);
doc.setTextColor(...C.gray500);
doc.text('RealSync  |  AI-Powered Meeting Security', emX + emW / 2, emY + emH - 10, { align: 'center' });
doc.text('Unsubscribe  |  Privacy Policy', emX + emW / 2, emY + emH - 6, { align: 'center' });

// Labels
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.purpleDeep);
doc.text('Letterhead', lhX + lhW / 2, lhY + lhH + 8, { align: 'center' });
doc.text('Dark Email Template', emX + emW / 2, emY + emH + 8, { align: 'center' });

// ══════════════════════════════════════════
// PAGE 14: SOCIAL & PRESENTATIONS
// ══════════════════════════════════════════

doc.addPage();
darkPage();
y = 25;
y = sectionTitleDark('Applications: Social & Presentations', y);

// SOCIAL PROFILE CARD (left)
doc.setFont(FONT, 'bold');
doc.setFontSize(8);
doc.setTextColor(...C.gray300);
doc.text('Social Profile', margin + 8, y);
y += 4;

const spX = margin;
const spY = y;
const spW = 86;
const spH = 110;

doc.setFillColor(...C.bgCard);
doc.roundedRect(spX, spY, spW, spH, 4, 4, 'F');

// Cover banner
doc.setFillColor(...C.bgBase);
doc.roundedRect(spX, spY, spW, 28, 4, 4, 'F');
doc.setFillColor(...C.bgCard);
doc.rect(spX, spY + 24, spW, 4, 'F');
drawGradientStrip(spX, spY + 26, spW, 1.5);

// Avatar circle
doc.setFillColor(...C.bgCard);
doc.circle(spX + spW / 2, spY + 26, 13, 'F');
doc.setFillColor(...C.bgElevated);
doc.circle(spX + spW / 2, spY + 26, 11, 'F');
if (logoEye) {
  try { doc.addImage(logoEye, 'PNG', spX + spW / 2 - 11, spY + 20, 22, 10.3); } catch (e) {}
}

// Profile text
doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.white);
doc.text('RealSync', spX + spW / 2, spY + 48, { align: 'center' });

doc.setFont(FONT, 'normal');
doc.setFontSize(6);
doc.setTextColor(...C.cyan);
doc.text('@realsync_ai', spX + spW / 2, spY + 54, { align: 'center' });

doc.setFontSize(6);
doc.setTextColor(...C.gray300);
doc.text('AI-Powered Meeting Security.', spX + spW / 2, spY + 62, { align: 'center' });
doc.setFont(FONT, 'normal');
doc.setTextColor(...C.cyan);
doc.text("See What's Real.", spX + spW / 2, spY + 68, { align: 'center' });

// Stats row
const stats = [
  { val: '142', label: 'Posts' },
  { val: '2.4K', label: 'Followers' },
  { val: '89', label: 'Following' },
];
stats.forEach((s, i) => {
  const sx2 = spX + 8 + i * 26;
  doc.setFont(FONT, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.white);
  doc.text(s.val, sx2 + 10, spY + 80, { align: 'center' });
  doc.setFont(FONT, 'normal');
  doc.setFontSize(5);
  doc.setTextColor(...C.gray400);
  doc.text(s.label, sx2 + 10, spY + 85, { align: 'center' });
});

// Sample post area
doc.setFillColor(...C.bgElevated);
doc.roundedRect(spX + 4, spY + 92, spW - 8, 14, 2, 2, 'F');
doc.setFillColor(...C.cyan);
doc.circle(spX + 10, spY + 99, 2.5, 'F');
doc.setFillColor(...C.bgHover);
doc.roundedRect(spX + 16, spY + 95, 45, 2, 0.5, 0.5, 'F');
doc.roundedRect(spX + 16, spY + 100, 32, 2, 0.5, 0.5, 'F');

// PRESENTATION SLIDES (right)
const presX = margin + 96;

doc.setFont(FONT, 'bold');
doc.setFontSize(8);
doc.setTextColor(...C.gray300);
doc.text('Presentation Slides', presX + 8, spY - 4);

// Slide 1: Title slide
const sl1Y = spY;
doc.setFillColor(...C.bgBase);
doc.roundedRect(presX, sl1Y, 86, 48, 3, 3, 'F');

if (logoEye) {
  try { doc.addImage(logoEye, 'PNG', presX + 4, sl1Y + 4, 16, 7.5); } catch (e) {}
}

doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.white);
doc.text('Real-Time Meeting', presX + 43, sl1Y + 18, { align: 'center' });
doc.setTextColor(...C.cyan);
doc.text('Intelligence', presX + 43, sl1Y + 26, { align: 'center' });

// Bullet points
for (let i = 0; i < 3; i++) {
  const bpY = sl1Y + 32 + i * 4.5;
  doc.setFillColor(...C.cyan);
  doc.circle(presX + 14, bpY + 1, 0.8, 'F');
  doc.setFillColor(...C.bgElevated);
  doc.roundedRect(presX + 18, bpY, 25 + i * 6, 1.5, 0.5, 0.5, 'F');
}

drawGradientStrip(presX, sl1Y + 45.5, 86, 1.5);

// Label
doc.setFont(FONT, 'normal');
doc.setFontSize(5);
doc.setTextColor(...C.gray500);
doc.text('Title Slide', presX + 43, sl1Y + 53, { align: 'center' });

// Slide 2: Data slide
const sl2Y = sl1Y + 60;
doc.setFillColor(...C.bgBase);
doc.roundedRect(presX, sl2Y, 86, 48, 3, 3, 'F');

doc.setFont(FONT, 'bold');
doc.setFontSize(8);
doc.setTextColor(...C.white);
doc.text('Security Analysis', presX + 43, sl2Y + 10, { align: 'center' });

// Bar chart
const barColors = [C.sevLow, C.sevMed, C.sevHigh, C.sevCrit];
const barHeights = [25, 18, 12, 6];
const barLabels = ['Low', 'Med', 'High', 'Crit'];

barColors.forEach((bc, i) => {
  const bx = presX + 16 + i * 16;
  const bh = barHeights[i];
  const by = sl2Y + 40 - bh;
  doc.setFillColor(...bc);
  doc.roundedRect(bx, by, 10, bh, 1, 1, 'F');
  doc.setFont(FONT, 'normal');
  doc.setFontSize(4);
  doc.setTextColor(...C.gray400);
  doc.text(barLabels[i], bx + 5, sl2Y + 44, { align: 'center' });
});

drawGradientStrip(presX, sl2Y + 45.5, 86, 1.5);

doc.setFontSize(5);
doc.setTextColor(...C.gray500);
doc.text('Data Slide', presX + 43, sl2Y + 53, { align: 'center' });

// SUMMARY TABLE
const tableY = Math.max(spY + spH + 16, sl2Y + 60);

doc.setFont(FONT, 'bold');
doc.setFontSize(9);
doc.setTextColor(...C.gray300);
doc.text('Quick Reference', margin + 8, tableY - 4);

doc.autoTable({
  startY: tableY,
  head: [['Element', 'Recommended', 'Avoid']],
  body: [
    ['Backgrounds', 'bgDeep, bgBase, bgCard', 'Pure white, light grays'],
    ['Text on dark', 'White, gray200-300', 'Gray 500+ (too dim)'],
    ['Interactive', 'Cyan, Blue', 'Purple, Orange, Red'],
    ['Warnings', 'Orange', 'Red (reserved for critical)'],
    ['Gradients', 'Purple > Blue > Cyan', 'More than 3 stops'],
    ['Borders', 'borderDefault, borderInput', 'Solid bright colors'],
  ],
  headStyles: {
    fillColor: C.bgBase,
    textColor: C.cyan,
    fontSize: 6.5,
    fontStyle: 'bold',
    halign: 'left',
  },
  styles: {
    font: FONT,
    fontSize: 6.5,
    cellPadding: 2.5,
    textColor: C.gray300,
    fillColor: C.bgCard,
    lineColor: C.borderDef,
    lineWidth: 0.2,
  },
  alternateRowStyles: { fillColor: C.bgElevated },
  columnStyles: {
    0: { cellWidth: 30, fontStyle: 'bold', textColor: C.white },
    1: { cellWidth: 76 },
    2: { cellWidth: 76, textColor: C.sevCrit },
  },
  margin: { left: margin, right: margin },
  tableWidth: contentW,
});

// ══════════════════════════════════════════
// FOOTER ON ALL PAGES (except cover)
// ══════════════════════════════════════════

const totalPages = doc.internal.getNumberOfPages();
for (let i = 1; i <= totalPages; i++) {
  doc.setPage(i);
  if (i === 1) continue; // No footer on cover

  // Gradient accent line
  const footY = pageH - 14;
  const third2 = pageW / 3;
  doc.setFillColor(...C.purpleDeep);
  doc.rect(0, footY, third2, 1, 'F');
  doc.setFillColor(...C.blue);
  doc.rect(third2, footY, third2, 1, 'F');
  doc.setFillColor(...C.cyan);
  doc.rect(third2 * 2, footY, third2 + 1, 1, 'F');

  // Small logo
  if (logoFull) {
    try { doc.addImage(logoFull, 'PNG', margin, pageH - 11, 8, 5.5); } catch (e) {}
  }

  // Center text
  doc.setFont(FONT, 'normal');
  doc.setFontSize(6);
  doc.setTextColor(...C.gray500);
  doc.text('RealSync  |  Brand Identity Guidelines  |  Confidential', pageW / 2, pageH - 6, { align: 'center' });

  // Page number
  doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });
}

// ══════════════════════════════════════════
// SAVE PDF
// ══════════════════════════════════════════

const outputPath = path.join(require('os').homedir(), 'Desktop', 'RealSync_Brand_Book.pdf');
const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outputPath, pdfBuffer);
console.log(`\n\u2705 Brand book generated successfully!`);
console.log(`   Output: ${outputPath}`);
console.log(`   Pages:  ${totalPages}`);
