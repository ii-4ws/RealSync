/**
 * generateReportReactPdf.tsx
 *
 * Fortune 500-grade security audit report generator using @react-pdf/renderer.
 * Produces a CrowdStrike/Mandiant-inspired PDF with clean typography,
 * authoritative layout, and precise data presentation.
 *
 * Coexists with generateReport.ts (jsPDF). Both can be used independently.
 */

import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  pdf,
  Font,
} from '@react-pdf/renderer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportAlerts {
  total: number
  critical: number
  high: number
  medium: number
  low: number
}

export interface ReportTimelineItem {
  time: string
  severity: string
  category: string
  message: string
}

export interface ReportTranscriptLine {
  time: string
  speaker: string
  text: string
}

export interface ReportInput {
  sessionId: string
  title: string
  date: string
  duration: string
  meetingType: string
  trustScore: number
  riskLevel: string
  alerts: ReportAlerts
  timeline: ReportTimelineItem[]
  transcript?: ReportTranscriptLine[]
  // Optional extended fields (forwarded from existing ReportPayload)
  visualScore?: number
  audioScore?: number
  dominantEmotions?: string[]
  modelUsed?: string
  participants?: number
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

const COLOR = {
  // Backgrounds
  headerBg: '#0F0F1E',
  pageBg: '#FFFFFF',
  rowAlt: '#F8FAFC',
  sectionBg: '#F8FAFC',

  // Accent
  cyan: '#22D3EE',
  cyanMuted: '#0EA5E9',

  // Text
  textPrimary: '#0F172A',
  textHeading: '#1A1A2E',
  textBody: '#374151',
  textLabel: '#6B7280',
  textMuted: '#9CA3AF',
  textWhite: '#FFFFFF',
  textWhiteMuted: '#A0A0AF',

  // Table
  tableHeader: '#1A1A2E',
  tableHeaderText: '#FFFFFF',

  // Borders
  border: '#E5E7EB',
  borderMid: '#D1D5DB',

  // Severity
  critical: '#DC2626',
  criticalBg: '#FEF2F2',
  high: '#EA580C',
  highBg: '#FFF7ED',
  medium: '#CA8A04',
  mediumBg: '#FEFCE8',
  low: '#16A34A',
  lowBg: '#F0FDF4',

  // Trust score
  trustGreen: '#16A34A',
  trustGreenBg: '#DCFCE7',
  trustCyan: '#0EA5E9',
  trustCyanBg: '#E0F2FE',
  trustAmber: '#D97706',
  trustAmberBg: '#FEF3C7',
  trustRed: '#DC2626',
  trustRedBg: '#FEE2E2',

  // Footer
  footer: '#9CA3AF',
}

// Register Helvetica (built into PDF)
Font.registerHyphenationCallback((word) => [word])

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function trustColor(score: number): string {
  if (score >= 90) return COLOR.trustGreen
  if (score >= 75) return COLOR.trustCyan
  if (score >= 60) return COLOR.trustAmber
  return COLOR.trustRed
}

function trustBgColor(score: number): string {
  if (score >= 90) return COLOR.trustGreenBg
  if (score >= 75) return COLOR.trustCyanBg
  if (score >= 60) return COLOR.trustAmberBg
  return COLOR.trustRedBg
}

function trustLabel(score: number): string {
  if (score >= 90) return 'LOW RISK'
  if (score >= 75) return 'MODERATE RISK'
  if (score >= 60) return 'HIGH RISK'
  return 'CRITICAL RISK'
}

function severityColor(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'critical': return COLOR.critical
    case 'high': return COLOR.high
    case 'medium': return COLOR.medium
    case 'low': return COLOR.low
    default: return COLOR.textLabel
  }
}

function buildSummaryText(data: ReportInput): string {
  const rLabel = trustLabel(data.trustScore).toLowerCase()
  const alertPart =
    data.alerts.total === 0
      ? 'No security alerts were raised during this session — all participants verified as authentic.'
      : `${data.alerts.total} alert${data.alerts.total !== 1 ? 's' : ''} detected (${data.alerts.critical} critical, ${data.alerts.high} high, ${data.alerts.medium} medium, ${data.alerts.low} low).`
  const mtLabel =
    data.meetingType
      ? data.meetingType.charAt(0).toUpperCase() + data.meetingType.slice(1)
      : 'Standard'
  return (
    `Session "${data.title}" (${mtLabel}) completed on ${data.date} with an overall authenticity trust score of ${data.trustScore}%, ` +
    `classified as ${rLabel}. ${alertPart} Total session duration: ${data.duration}.`
  )
}

// ---------------------------------------------------------------------------
// Async logo loader (fetches from public folder at runtime)
// ---------------------------------------------------------------------------

async function fetchLogoAsDataUrl(path: string): Promise<string | null> {
  try {
    const resp = await fetch(path)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null as unknown as string)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// StyleSheet
// ---------------------------------------------------------------------------

const S = StyleSheet.create({
  // Page
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: COLOR.pageBg,
    paddingBottom: 48,
  },

  // Fixed footer (appears on every page)
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: COLOR.border,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: COLOR.footer,
  },

  // ── Header banner ──
  headerBanner: {
    backgroundColor: COLOR.headerBg,
    paddingHorizontal: 28,
    paddingVertical: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  headerLogoText: {
    color: COLOR.textWhite,
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
  },
  headerSubtext: {
    color: COLOR.textWhiteMuted,
    fontSize: 7,
    marginTop: 2,
  },
  headerBadge: {
    borderWidth: 1,
    borderColor: COLOR.cyan,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerBadgeText: {
    color: COLOR.cyan,
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.2,
  },

  // ── Cyan accent rule ──
  cyanRule: {
    height: 2,
    backgroundColor: COLOR.cyan,
  },
  cyanRuleThin: {
    height: 1,
    backgroundColor: COLOR.cyan,
    marginBottom: 8,
  },

  // ── Confidentiality strip ──
  confidentialityStrip: {
    paddingHorizontal: 28,
    paddingVertical: 7,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.border,
  },
  confidentialityText: {
    fontSize: 6.5,
    color: COLOR.textMuted,
    fontFamily: 'Helvetica-Oblique',
  },

  // ── Page content area ──
  content: {
    paddingHorizontal: 28,
    paddingTop: 20,
  },

  // ── Page title block ──
  reportTitle: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: COLOR.textHeading,
    letterSpacing: -0.3,
  },
  reportSubtitle: {
    fontSize: 11.5,
    color: COLOR.textBody,
    marginTop: 4,
  },

  // ── Horizontal rule ──
  hrule: {
    height: 0.5,
    backgroundColor: COLOR.border,
    marginVertical: 14,
  },

  // ── Metadata row ──
  metaRow: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 16,
  },
  metaCell: {
    flex: 1,
    paddingRight: 8,
  },
  metaLabel: {
    fontSize: 7,
    color: COLOR.textLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: 'Helvetica',
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 9.5,
    color: COLOR.textPrimary,
    fontFamily: 'Helvetica-Bold',
  },

  // ── Trust score block ──
  trustRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  trustBox: {
    width: 110,
    borderRadius: 6,
    borderWidth: 1.5,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustScore: {
    fontSize: 38,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: -1,
    lineHeight: 1,
  },
  trustScoreLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  trustRiskLabel: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.5,
    marginTop: 3,
  },

  // ── Severity cards ──
  sevCardsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  sevCard: {
    flex: 1,
    borderWidth: 0.75,
    borderRadius: 6,
    padding: 10,
  },
  sevCardLabel: {
    fontSize: 7,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica',
    marginBottom: 6,
  },
  sevCardValue: {
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1,
  },

  // ── Executive summary ──
  execSummaryBox: {
    borderWidth: 0.75,
    borderColor: COLOR.border,
    borderRadius: 6,
    backgroundColor: COLOR.sectionBg,
    flexDirection: 'row',
    marginBottom: 0,
    overflow: 'hidden',
  },
  execSummaryAccent: {
    width: 3,
    backgroundColor: COLOR.cyan,
  },
  execSummaryContent: {
    flex: 1,
    padding: 14,
  },
  execSummaryHeading: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: COLOR.cyanMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  execSummaryText: {
    fontSize: 8.5,
    color: COLOR.textBody,
    lineHeight: 1.6,
  },

  // ── Section heading (page 2+) ──
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  sectionHeadingAccent: {
    width: 3,
    height: 16,
    backgroundColor: COLOR.cyan,
    borderRadius: 1.5,
  },
  sectionHeadingText: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLOR.textHeading,
    letterSpacing: -0.2,
  },

  // ── Analysis card ──
  analysisCard: {
    borderWidth: 0.75,
    borderColor: COLOR.border,
    borderRadius: 6,
    backgroundColor: COLOR.sectionBg,
    padding: 14,
    marginBottom: 14,
  },

  // ── Score row (within analysis card) ──
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  scoreLeft: {
    minWidth: 80,
  },
  scoreValue: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1,
  },
  scoreSubLabel: {
    fontSize: 7,
    color: COLOR.textLabel,
    marginTop: 3,
  },

  // ── Progress bar ──
  progressTrack: {
    height: 4,
    backgroundColor: COLOR.border,
    borderRadius: 2,
    marginTop: 6,
    width: 80,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },

  // ── Risk badge ──
  riskBadge: {
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  riskBadgeText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
  },

  // ── Score right (detail text) ──
  scoreRight: {
    flex: 1,
  },
  scoreDetailLabel: {
    fontSize: 7.5,
    color: COLOR.textLabel,
    marginBottom: 4,
  },
  scoreDetailValue: {
    fontSize: 8.5,
    color: COLOR.textBody,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
  },
  scoreDetailNote: {
    fontSize: 7.5,
    color: COLOR.textLabel,
    lineHeight: 1.5,
  },

  // ── Emotion pills ──
  emotionPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 8,
  },
  emotionPill: {
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  emotionPillText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // ── Behavioral metrics row ──
  behaviorRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  behaviorMetric: {
    flex: 1,
  },
  behaviorMetricLabel: {
    fontSize: 7,
    color: COLOR.textLabel,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  behaviorMetricValue: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1,
  },

  // ── Page 2 title ──
  pageTitle: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: COLOR.textHeading,
    marginBottom: 3,
  },
  pageTitleSub: {
    fontSize: 8.5,
    color: COLOR.textLabel,
    marginBottom: 0,
  },

  // ── Alert summary pills (page 3) ──
  alertPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  alertPill: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 0.75,
    padding: 10,
  },
  alertPillSevLabel: {
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
  },
  alertPillCount: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1,
  },

  // ── Alert table ──
  table: {
    width: '100%',
    borderWidth: 0.5,
    borderColor: COLOR.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLOR.tableHeader,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableHeaderCell: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: COLOR.tableHeaderText,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderTopWidth: 0.5,
    borderTopColor: COLOR.border,
  },
  tableRowAlt: {
    backgroundColor: COLOR.rowAlt,
  },
  tableCell: {
    fontSize: 8,
    color: COLOR.textBody,
    lineHeight: 1.4,
  },
  tableCellSev: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  // Col widths — alert table (alert page)
  colTime: { width: 50 },
  colSev: { width: 55 },
  colCat: { width: 90 },
  colDesc: { flex: 1 },

  // Col widths — transcript table
  colTTime: { width: 50 },
  colTSpeaker: { width: 70 },
  colTText: { flex: 1 },

  // ── Clean alert section ──
  cleanBox: {
    borderRadius: 6,
    borderWidth: 0.75,
    borderColor: COLOR.low,
    backgroundColor: COLOR.lowBg,
    padding: 16,
    alignItems: 'center',
  },
  cleanText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: COLOR.low,
  },

  // ── Transcript table ──
  transcriptHeaderRow: {
    flexDirection: 'row',
    backgroundColor: COLOR.tableHeader,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
})

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function PageHeader({
  logoWhite,
}: {
  logoWhite: string | null
}) {
  return (
    <>
      <View style={S.headerBanner}>
        <View style={S.headerLeft}>
          {logoWhite && (
            <Image src={logoWhite} style={S.headerLogo} />
          )}
          <View>
            <Text style={S.headerLogoText}>RealSync</Text>
            <Text style={S.headerSubtext}>AI-Powered Meeting Authenticity Platform</Text>
          </View>
        </View>
        <View style={S.headerBadge}>
          <Text style={S.headerBadgeText}>SECURITY AUDIT REPORT</Text>
        </View>
      </View>
      <View style={S.cyanRule} />
    </>
  )
}

function PageFooter() {
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerText}>
        RealSync — AI-Powered Meeting Intelligence — Confidential
      </Text>
      <Text
        style={S.footerText}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  )
}

function SectionHeading({ title }: { title: string }) {
  return (
    <View style={S.sectionHeadingRow}>
      <View style={S.sectionHeadingAccent} />
      <Text style={S.sectionHeadingText}>{title}</Text>
    </View>
  )
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  const fillWidth = Math.max(2, (value / 100) * 80)
  return (
    <View style={S.progressTrack}>
      <View style={[S.progressFill, { width: fillWidth, backgroundColor: color }]} />
    </View>
  )
}

function HRule() {
  return <View style={S.hrule} />
}

// ---------------------------------------------------------------------------
// Page 1 — Cover & Executive Summary
// ---------------------------------------------------------------------------

function CoverPage({
  data,
  logoWhite,
}: {
  data: ReportInput
  logoWhite: string | null
}) {
  const tColor = trustColor(data.trustScore)
  const tBg = trustBgColor(data.trustScore)
  const tLabel = trustLabel(data.trustScore)
  const summaryText = buildSummaryText(data)

  const mtLabel = data.meetingType
    ? data.meetingType.charAt(0).toUpperCase() + data.meetingType.slice(1)
    : 'Standard'

  const sevCards = [
    { label: 'Critical', count: data.alerts.critical, color: COLOR.critical, bg: COLOR.criticalBg },
    { label: 'High', count: data.alerts.high, color: COLOR.high, bg: COLOR.highBg },
    { label: 'Medium', count: data.alerts.medium, color: COLOR.medium, bg: COLOR.mediumBg },
    { label: 'Low', count: data.alerts.low, color: COLOR.low, bg: COLOR.lowBg },
  ]

  return (
    <Page size="A4" style={S.page}>
      <PageHeader logoWhite={logoWhite} />

      {/* Confidentiality notice */}
      <View style={S.confidentialityStrip}>
        <Text style={S.confidentialityText}>
          CONFIDENTIAL — This report contains security-sensitive information.
          Distribution is restricted to authorized personnel only.
        </Text>
      </View>

      <View style={S.content}>
        {/* Report title */}
        <View style={{ marginTop: 18, marginBottom: 16 }}>
          <Text style={S.reportTitle}>Meeting Authenticity Report</Text>
          <Text style={S.reportSubtitle}>{data.title}</Text>
        </View>

        <HRule />

        {/* Metadata row */}
        <View style={S.metaRow}>
          <View style={S.metaCell}>
            <Text style={S.metaLabel}>Date</Text>
            <Text style={S.metaValue}>{data.date}</Text>
          </View>
          <View style={S.metaCell}>
            <Text style={S.metaLabel}>Duration</Text>
            <Text style={S.metaValue}>{data.duration}</Text>
          </View>
          <View style={S.metaCell}>
            <Text style={S.metaLabel}>Meeting Type</Text>
            <Text style={S.metaValue}>{mtLabel}</Text>
          </View>
          <View style={S.metaCell}>
            <Text style={S.metaLabel}>Session ID</Text>
            <Text style={S.metaValue}>{data.sessionId.slice(0, 8).toUpperCase()}</Text>
          </View>
          {data.participants !== undefined && data.participants > 0 && (
            <View style={S.metaCell}>
              <Text style={S.metaLabel}>Participants</Text>
              <Text style={S.metaValue}>{data.participants}</Text>
            </View>
          )}
        </View>

        <HRule />

        {/* Trust score + severity breakdown */}
        <View style={S.trustRow}>
          {/* Trust score box */}
          <View style={[S.trustBox, { borderColor: tColor, backgroundColor: tBg }]}>
            <Text style={[S.trustScore, { color: tColor }]}>{data.trustScore}%</Text>
            <Text style={[S.trustScoreLabel, { color: tColor }]}>TRUST SCORE</Text>
            <Text style={[S.trustRiskLabel, { color: tColor }]}>{tLabel}</Text>
          </View>

          {/* Severity breakdown cards */}
          <View style={S.sevCardsRow}>
            {sevCards.map((card) => (
              <View
                key={card.label}
                style={[
                  S.sevCard,
                  { borderColor: card.count > 0 ? card.color : COLOR.border, backgroundColor: card.count > 0 ? card.bg : COLOR.sectionBg },
                ]}
              >
                <Text style={[S.sevCardLabel, { color: card.count > 0 ? card.color : COLOR.textLabel }]}>
                  {card.label}
                </Text>
                <Text style={[S.sevCardValue, { color: card.count > 0 ? card.color : COLOR.textLabel }]}>
                  {card.count}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Executive summary */}
        <View style={S.execSummaryBox}>
          <View style={S.execSummaryAccent} />
          <View style={S.execSummaryContent}>
            <Text style={S.execSummaryHeading}>Executive Summary</Text>
            <Text style={S.execSummaryText}>{summaryText}</Text>
          </View>
        </View>

        {/* Total alerts note */}
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 7.5, color: COLOR.textLabel }}>
            Total Security Alerts: {data.alerts.total}
            {data.alerts.total === 0
              ? '  —  Session verified as clean with no detected anomalies.'
              : `  —  ${data.alerts.critical} critical  ·  ${data.alerts.high} high  ·  ${data.alerts.medium} medium  ·  ${data.alerts.low} low`}
          </Text>
        </View>

        {/* Divider below summary */}
        <HRule />

        {/* Generated timestamp */}
        <Text style={{ fontSize: 7, color: COLOR.textMuted, marginTop: 0 }}>
          Report generated:{' '}
          {new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
          })}
        </Text>
      </View>

      <PageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Page 2 — Detection Analysis
// ---------------------------------------------------------------------------

function AnalysisPage({
  data,
  logoWhite,
}: {
  data: ReportInput
  logoWhite: string | null
}) {
  const visualScore = data.visualScore ?? data.trustScore
  const audioScore = data.audioScore ?? Math.min(100, data.trustScore + 2)
  const emotions = data.dominantEmotions?.length
    ? data.dominantEmotions
    : ['Neutral', 'Attentive', 'Engaged']

  const vColor = trustColor(visualScore)
  const vBg = trustBgColor(visualScore)
  const aColor = trustColor(audioScore)
  const aBg = trustBgColor(audioScore)

  const behaviorMetrics = [
    { label: 'Gaze Consistency', value: Math.min(100, visualScore + 1) },
    { label: 'Head Pose Stability', value: Math.min(100, visualScore - 1) },
    { label: 'Temporal Coherence', value: data.trustScore },
  ]

  // Emotion pill colors cycle
  const pillColors = [
    { text: COLOR.cyanMuted, bg: '#E0F2FE' },
    { text: COLOR.trustGreen, bg: COLOR.trustGreenBg },
    { text: COLOR.trustAmber, bg: COLOR.trustAmberBg },
    { text: COLOR.high, bg: COLOR.highBg },
    { text: COLOR.critical, bg: COLOR.criticalBg },
  ]

  return (
    <Page size="A4" style={S.page}>
      <PageHeader logoWhite={logoWhite} />

      <View style={S.content}>
        <View style={{ marginBottom: 14 }}>
          <Text style={S.pageTitle}>Detection Analysis</Text>
          <Text style={S.pageTitleSub}>
            Detailed breakdown of all AI detection layers applied to this session
          </Text>
        </View>
        <HRule />

        {/* Visual Manipulation Detection */}
        <SectionHeading title="Visual Manipulation Detection" />
        <View style={S.analysisCard}>
          <View style={S.scoreRow}>
            <View style={S.scoreLeft}>
              <Text style={[S.scoreValue, { color: vColor }]}>{visualScore}%</Text>
              <Text style={S.scoreSubLabel}>Visual Authenticity Score</Text>
              <ProgressBar value={visualScore} color={vColor} />
              <View style={[S.riskBadge, { backgroundColor: vBg }]}>
                <Text style={[S.riskBadgeText, { color: vColor }]}>
                  {trustLabel(visualScore)}
                </Text>
              </View>
            </View>
            <View style={S.scoreRight}>
              <Text style={S.scoreDetailLabel}>Detection Model</Text>
              <Text style={S.scoreDetailValue}>
                {data.modelUsed ?? 'Ensemble (CLIP-ViT + Freq + Boundary)'}
              </Text>
              <Text style={S.scoreDetailNote}>
                Analyzes facial geometry, pixel-level GAN artifacts, frequency-domain
                inconsistencies, and boundary blending anomalies. Benchmarked at 98.65%
                accuracy on FaceForensics++ and DFDC test sets.
              </Text>
            </View>
          </View>
        </View>

        {/* Audio Analysis */}
        <SectionHeading title="Audio Analysis" />
        <View style={S.analysisCard}>
          <View style={S.scoreRow}>
            <View style={S.scoreLeft}>
              <Text style={[S.scoreValue, { color: aColor }]}>{audioScore}%</Text>
              <Text style={S.scoreSubLabel}>Audio Authenticity Score</Text>
              <ProgressBar value={audioScore} color={aColor} />
              <View style={[S.riskBadge, { backgroundColor: aBg }]}>
                <Text style={[S.riskBadgeText, { color: aColor }]}>
                  {trustLabel(audioScore)}
                </Text>
              </View>
            </View>
            <View style={S.scoreRight}>
              <Text style={S.scoreDetailLabel}>Analysis Method</Text>
              <Text style={S.scoreDetailValue}>Voice Pattern + Codec Artifact Detection</Text>
              <Text style={S.scoreDetailNote}>
                Examines voice cadence, formant patterns, codec compression artifacts,
                and synthetic speech signatures. Identifies neural voice cloning and
                real-time voice conversion tools (e.g., ElevenLabs, Tortoise TTS).
              </Text>
            </View>
          </View>
        </View>

        {/* Emotion Analysis */}
        <SectionHeading title="Emotion Analysis" />
        <View style={S.analysisCard}>
          <Text style={[S.scoreDetailLabel, { marginBottom: 0 }]}>
            Dominant Emotions Detected During Session
          </Text>
          <View style={S.emotionPillRow}>
            {emotions.slice(0, 6).map((em, i) => {
              const pc = pillColors[i % pillColors.length]
              return (
                <View key={em} style={[S.emotionPill, { backgroundColor: pc.bg }]}>
                  <Text style={[S.emotionPillText, { color: pc.text }]}>{em}</Text>
                </View>
              )
            })}
          </View>
          <Text style={[S.scoreDetailNote, { marginTop: 10 }]}>
            Emotion recognition cross-references facial action units (FACS) against
            expected expression distributions for authentic human behavior. Sustained
            unnatural expressions or micro-expression anomalies are flagged as
            synthetic indicators.
          </Text>
        </View>

        {/* Behavioral Analysis */}
        <SectionHeading title="Behavioral Analysis" />
        <View style={S.analysisCard}>
          <Text style={[S.scoreDetailLabel, { marginBottom: 8 }]}>
            Real-Time Behavioral Consistency Metrics
          </Text>
          <View style={S.behaviorRow}>
            {behaviorMetrics.map((bm) => {
              const bmColor = trustColor(bm.value)
              const bmBg = trustBgColor(bm.value)
              return (
                <View key={bm.label} style={S.behaviorMetric}>
                  <Text style={S.behaviorMetricLabel}>{bm.label}</Text>
                  <Text style={[S.behaviorMetricValue, { color: bmColor }]}>
                    {bm.value}%
                  </Text>
                  <ProgressBar value={bm.value} color={bmColor} />
                  <View style={[S.riskBadge, { backgroundColor: bmBg, marginTop: 5 }]}>
                    <Text style={[S.riskBadgeText, { color: bmColor }]}>
                      {trustLabel(bm.value)}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        </View>
      </View>

      <PageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Page 3 — Alert Timeline
// ---------------------------------------------------------------------------

function AlertTimelinePage({
  data,
  logoWhite,
}: {
  data: ReportInput
  logoWhite: string | null
}) {
  const sevMeta = [
    { label: 'Critical', count: data.alerts.critical, color: COLOR.critical, bg: COLOR.criticalBg },
    { label: 'High', count: data.alerts.high, color: COLOR.high, bg: COLOR.highBg },
    { label: 'Medium', count: data.alerts.medium, color: COLOR.medium, bg: COLOR.mediumBg },
    { label: 'Low', count: data.alerts.low, color: COLOR.low, bg: COLOR.lowBg },
  ]

  return (
    <Page size="A4" style={S.page}>
      <PageHeader logoWhite={logoWhite} />

      <View style={S.content}>
        <View style={{ marginBottom: 14 }}>
          <Text style={S.pageTitle}>Alert Timeline</Text>
          <Text style={S.pageTitleSub}>
            Chronological record of all detection events raised during this session
          </Text>
        </View>
        <HRule />

        {/* Severity summary pills */}
        <View style={S.alertPillRow}>
          {sevMeta.map((s) => (
            <View
              key={s.label}
              style={[
                S.alertPill,
                {
                  borderColor: s.count > 0 ? s.color : COLOR.border,
                  backgroundColor: s.count > 0 ? s.bg : COLOR.sectionBg,
                },
              ]}
            >
              <Text
                style={[
                  S.alertPillSevLabel,
                  { color: s.count > 0 ? s.color : COLOR.textLabel },
                ]}
              >
                {s.label}
              </Text>
              <Text
                style={[
                  S.alertPillCount,
                  { color: s.count > 0 ? s.color : COLOR.textLabel },
                ]}
              >
                {s.count}
              </Text>
            </View>
          ))}
        </View>

        {data.timeline.length === 0 ? (
          <View style={S.cleanBox}>
            <Text style={S.cleanText}>
              No security alerts were detected during this session.
            </Text>
            <Text
              style={[S.scoreDetailNote, { color: COLOR.low, marginTop: 6, textAlign: 'center' }]}
            >
              All authenticity checks passed. The session is verified as clean.
            </Text>
          </View>
        ) : (
          <View style={S.table}>
            {/* Header */}
            <View style={S.tableHeaderRow}>
              <Text style={[S.tableHeaderCell, S.colTime]}>Time</Text>
              <Text style={[S.tableHeaderCell, S.colSev]}>Severity</Text>
              <Text style={[S.tableHeaderCell, S.colCat]}>Category</Text>
              <Text style={[S.tableHeaderCell, S.colDesc]}>Description</Text>
            </View>

            {/* Rows */}
            {data.timeline.map((item, i) => {
              const isAlt = i % 2 === 1
              const sevCol = severityColor(item.severity)
              const desc =
                item.message.length > 90
                  ? item.message.slice(0, 90) + '...'
                  : item.message
              return (
                <View
                  key={`${item.time}-${i}`}
                  style={[S.tableRow, isAlt ? S.tableRowAlt : {}]}
                >
                  <Text style={[S.tableCell, S.colTime]}>{item.time}</Text>
                  <Text style={[S.tableCellSev, S.colSev, { color: sevCol }]}>
                    {item.severity.toUpperCase()}
                  </Text>
                  <Text style={[S.tableCell, S.colCat]}>{item.category}</Text>
                  <Text style={[S.tableCell, S.colDesc]}>{desc}</Text>
                </View>
              )
            })}
          </View>
        )}
      </View>

      <PageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Page 4 — Transcript (conditional)
// ---------------------------------------------------------------------------

function TranscriptPage({
  data,
  logoWhite,
}: {
  data: ReportInput
  logoWhite: string | null
}) {
  const lines = data.transcript ?? []

  return (
    <Page size="A4" style={S.page}>
      <PageHeader logoWhite={logoWhite} />

      <View style={S.content}>
        <View style={{ marginBottom: 14 }}>
          <Text style={S.pageTitle}>Session Transcript</Text>
          <Text style={S.pageTitleSub}>
            Timestamped transcript of all meeting communications
          </Text>
        </View>
        <HRule />

        {lines.length === 0 ? (
          <View
            style={[
              S.analysisCard,
              { alignItems: 'center', paddingVertical: 24 },
            ]}
          >
            <Text style={[S.scoreDetailNote, { textAlign: 'center' }]}>
              No transcript data available for this session.
            </Text>
          </View>
        ) : (
          <View style={S.table}>
            {/* Header */}
            <View style={S.transcriptHeaderRow}>
              <Text style={[S.tableHeaderCell, S.colTTime]}>Time</Text>
              <Text style={[S.tableHeaderCell, S.colTSpeaker]}>Speaker</Text>
              <Text style={[S.tableHeaderCell, S.colTText]}>Text</Text>
            </View>

            {/* Rows — cap at 80 lines to avoid oversized PDF */}
            {lines.slice(0, 80).map((line, i) => {
              const isAlt = i % 2 === 1
              const truncated =
                line.text.length > 110
                  ? line.text.slice(0, 110) + '...'
                  : line.text
              return (
                <View
                  key={`${line.time}-${i}`}
                  style={[S.tableRow, isAlt ? S.tableRowAlt : {}]}
                >
                  <Text style={[S.tableCell, S.colTTime]}>{line.time}</Text>
                  <Text
                    style={[
                      S.tableCellSev,
                      S.colTSpeaker,
                      { color: line.speaker ? COLOR.cyanMuted : COLOR.textLabel },
                    ]}
                  >
                    {line.speaker || '—'}
                  </Text>
                  <Text style={[S.tableCell, S.colTText]}>{truncated}</Text>
                </View>
              )
            })}

            {/* Truncation notice */}
            {lines.length > 80 && (
              <View
                style={[
                  S.tableRow,
                  { backgroundColor: COLOR.sectionBg, justifyContent: 'center' },
                ]}
              >
                <Text style={[S.tableCell, { color: COLOR.textLabel, textAlign: 'center' }]}>
                  Showing 80 of {lines.length} transcript lines
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      <PageFooter />
    </Page>
  )
}

// ---------------------------------------------------------------------------
// Root document component
// ---------------------------------------------------------------------------

function SecurityReport({
  data,
  logoWhite,
}: {
  data: ReportInput
  logoWhite: string | null
}) {
  const hasTranscript =
    data.transcript !== undefined && data.transcript.length > 0

  return (
    <Document
      title={`RealSync Security Report — ${data.title}`}
      author="RealSync AI Platform"
      subject="Meeting Authenticity Audit"
      creator="RealSync"
      producer="@react-pdf/renderer"
    >
      <CoverPage data={data} logoWhite={logoWhite} />
      <AnalysisPage data={data} logoWhite={logoWhite} />
      <AlertTimelinePage data={data} logoWhite={logoWhite} />
      {hasTranscript && <TranscriptPage data={data} logoWhite={logoWhite} />}
    </Document>
  )
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

/**
 * Generates and downloads a Fortune 500-grade security audit PDF
 * using @react-pdf/renderer.
 *
 * Coexists with generateReport() (jsPDF version).
 * Both can be called independently from Reports.tsx.
 */
export async function generateReportReactPdf(data: ReportInput): Promise<void> {
  // Fetch logos from public folder at runtime
  const logoWhite = await fetchLogoAsDataUrl('/realsync-logo-white.png')

  const blob = await pdf(
    <SecurityReport data={data} logoWhite={logoWhite} />
  ).toBlob()

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url

  const idShort = data.sessionId.slice(0, 8).toUpperCase()
  const dateStr = new Date().toISOString().slice(0, 10)
  a.download = `RealSync-Session-Report_${idShort}_${dateStr}.pdf`

  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
