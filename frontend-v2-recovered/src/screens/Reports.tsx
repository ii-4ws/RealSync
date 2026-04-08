import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import {
  FileText, Calendar, Clock, Users, AlertTriangle, AlertCircle,
  Info, Download, File, Database, Loader,
} from 'lucide-react'
import $ from '../lib/tokens'
import { EASE, LABEL_STYLE, MONO_STYLE, trustColor, SEVERITY_CONFIG } from '../lib/tokens'
import type { AlertSeverity } from '../lib/mockData'
// Mock data removed — reports always fetch from API
import { authFetch } from '../lib/api'
import { useSessionContext } from '../contexts/SessionContext'
import { generateReport } from '../lib/generateReport'
import { generateReportReactPdf } from '../lib/generateReportReactPdf'

interface TrustPoint { t: string; score: number }

interface AlertItem {
  id: string | number
  sev: AlertSeverity
  cat: string
  msg: string
  time: string
}

interface ReportData {
  id: string
  title: string
  date: string
  duration: string
  durationMins: number
  meetingType?: string
  participants: number
  trustAvg: number
  alerts: { total: number; critical: number; high: number; medium: number; low: number }
  timeline: AlertItem[]
  trustCurve: TrustPoint[]
  sessionId?: string
}

// --- Export helpers ---

function downloadJson(report: ReportData) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${report.id}.json`; a.click()
  URL.revokeObjectURL(url)
}

function downloadCsv(report: ReportData) {
  const rows = [
    ['Time', 'Severity', 'Category', 'Message'],
    ...report.timeline.map((t) => [t.time, t.sev, t.cat, t.msg]),
  ]
  const csv = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${report.id}.csv`; a.click()
  URL.revokeObjectURL(url)
}

async function downloadPdf(report: ReportData) {
  await generateReport({
    id: report.id,
    title: report.title,
    date: report.date,
    duration: report.duration,
    durationMins: report.durationMins,
    meetingType: report.meetingType,
    participants: report.participants,
    trustAvg: report.trustAvg,
    alerts: report.alerts,
    timeline: report.timeline,
    trustCurve: report.trustCurve,
  })
}

async function downloadPdfV2(report: ReportData) {
  await generateReportReactPdf({
    sessionId: report.id,
    title: report.title,
    date: report.date,
    duration: report.duration,
    meetingType: report.meetingType ?? 'standard',
    trustScore: report.trustAvg,
    riskLevel: report.trustAvg >= 90 ? 'low' : report.trustAvg >= 75 ? 'moderate' : report.trustAvg >= 60 ? 'high' : 'critical',
    alerts: report.alerts,
    timeline: report.timeline.map((t) => ({
      time: t.time,
      severity: t.sev,
      category: t.cat,
      message: t.msg,
    })),
    participants: report.participants,
  })
}

const SEVERITY_ICONS: Record<AlertSeverity, typeof AlertCircle> = {
  critical: AlertCircle,
  high: AlertTriangle,
  medium: AlertTriangle,
  low: Info,
}

function ExportBtn({ icon: Icon, label, onClick }: { icon: typeof Download; label: string; onClick: () => void | Promise<void> }) {
  const [hov, setHov] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onClick()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px',
        borderRadius: 8, border: `1px solid ${hov ? $.b2 : $.b1}`,
        background: hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        color: hov ? $.t1 : $.t3, cursor: busy ? 'default' : 'pointer', fontSize: 11,
        fontFamily: 'Inter, sans-serif', transition: 'all 150ms',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Icon size={12} />}
      {busy ? 'Generating...' : label}
    </button>
  )
}

function ReportItem({ report, selected, delay, onClick }: { report: ReportData; selected: boolean; delay: number; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  const color = trustColor(report.trustAvg)
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE }}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
        background: selected ? `${$.cyan}08` : hov ? 'rgba(255,255,255,0.02)' : 'transparent',
        border: `1px solid ${selected ? `${$.cyan}20` : hov ? $.b2 : $.b1}`,
        transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: $.t1, fontWeight: 500 }}>{report.title}</span>
        <span style={{ fontSize: 12, ...MONO_STYLE, color, fontWeight: 600 }}>{report.trustAvg}%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: $.t3 }}>{report.date}</span>
        <span style={{ width: 2, height: 2, borderRadius: '50%', background: $.t4 }} />
        <span style={{ fontSize: 10, ...MONO_STYLE, color: $.t4 }}>{report.duration}</span>
      </div>
    </motion.div>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: $.bg2, border: `1px solid ${$.b2}`, borderRadius: 8, padding: '8px 12px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
      <div style={{ fontSize: 10, color: $.t3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, ...MONO_STYLE, color: $.cyan, fontWeight: 600 }}>{payload[0].value}%</div>
    </div>
  )
}

function ReportDetail({ report }: { report: ReportData }) {
  const isMobile = window.innerWidth <= 768
  const trustCol = trustColor(report.trustAvg)
  const yMin = report.trustCurve.length > 0 ? Math.max(60, Math.min(...report.trustCurve.map((p) => p.score)) - 5) : 60

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 14, height: '100%' }}>
      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{
          background: $.bg1, border: `1px solid ${$.b1}`, borderRadius: 14,
          padding: isMobile ? '14px 14px' : '16px 20px',
          position: 'relative', overflow: 'hidden', flexShrink: 0,
        }}
      >
        <div style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <FileText size={13} color={$.cyan} />
              <span style={{ fontSize: 9, color: $.cyan, textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600 }}>Session Report</span>
            </div>
            <h2 style={{ fontSize: isMobile ? 15 : 18, fontWeight: 600, color: $.t1, margin: 0, marginBottom: 8, letterSpacing: '-0.01em' }}>{report.title}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Calendar size={11} color={$.t4} />
                <span style={{ fontSize: 11, color: $.t3 }}>{report.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={11} color={$.t4} />
                <span style={{ fontSize: 11, ...MONO_STYLE, color: $.t3 }}>{report.duration}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Users size={11} color={$.t4} />
                <span style={{ fontSize: 11, color: $.t3 }}>{report.participants} part.</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: isMobile ? 4 : 6, marginTop: 4, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <ExportBtn icon={File} label="PDF (v1)" onClick={() => downloadPdf(report)} />
              <ExportBtn icon={File} label="PDF (v2)" onClick={() => downloadPdfV2(report)} />
              <ExportBtn icon={Database} label="CSV" onClick={() => downloadCsv(report)} />
              <ExportBtn icon={Download} label="JSON" onClick={() => downloadJson(report)} />
            </div>
            <div style={{
              textAlign: 'right',
              background: `${trustCol}0f`, border: `1px solid ${trustCol}28`,
              borderRadius: 10, padding: isMobile ? '8px 12px' : '10px 16px', flexShrink: 0,
            }}>
              <div style={{ fontSize: isMobile ? 24 : 30, ...MONO_STYLE, fontWeight: 300, color: trustCol, lineHeight: 1, marginBottom: 4 }}>{report.trustAvg}%</div>
              <div style={{ fontSize: 9, color: trustCol, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, opacity: 0.75 }}>Trust Avg</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Alerts', val: String(report.alerts.total), icon: AlertTriangle, color: report.alerts.total > 0 ? $.red : $.green },
          { label: 'Critical', val: String(report.alerts.critical), icon: AlertCircle, color: report.alerts.critical > 0 ? '#EF4444' : $.t4 },
          { label: 'High', val: String(report.alerts.high), icon: AlertTriangle, color: report.alerts.high > 0 ? '#F97316' : $.t4 },
          { label: 'Participants', val: String(report.participants), icon: Users, color: $.blue },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05, ease: EASE }}
            style={{
              flex: 1, background: $.bg1, border: `1px solid ${$.b1}`,
              borderRadius: 10, padding: '10px 12px', position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${s.color}, transparent)` }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
              <s.icon size={11} color={s.color} />
              <span style={{ fontSize: 9, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 18, ...MONO_STYLE, color: $.t1, fontWeight: 400, marginBottom: 2 }}>{s.val}</div>
          </motion.div>
        ))}
      </div>

      {/* Trust curve chart */}
      {report.trustCurve.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: EASE }}
          style={{ background: $.bg1, border: `1px solid ${$.b1}`, borderRadius: 14, padding: '16px 16px 8px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={LABEL_STYLE}>Trust Score Timeline</span>
            <span style={{ fontSize: 10, color: $.t4, ...MONO_STYLE }}>{report.duration}</span>
          </div>
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.trustCurve} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={`report-fill-${report.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={trustCol} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={trustCol} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: $.t4 }} axisLine={false} tickLine={false} />
                <YAxis domain={[yMin, 100]} tick={{ fontSize: 10, fill: $.t4 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: $.b2 }} />
                <Area type="monotone" dataKey="score" stroke={trustCol} strokeWidth={2} fill={`url(#report-fill-${report.id})`} dot={false} activeDot={{ r: 4, fill: trustCol, stroke: $.bg0, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* Alert timeline */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25, ease: EASE }}
        style={{ background: $.bg1, border: `1px solid ${$.b1}`, borderRadius: 14, padding: '16px 16px', flex: 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={LABEL_STYLE}>Alert Timeline</span>
          <span style={{ fontSize: 10, color: $.t4, ...MONO_STYLE }}>{report.alerts.total}</span>
        </div>

        {report.timeline.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: $.t4, fontSize: 13 }}>
            No alerts detected — session was clean
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.timeline.map((alert, i) => {
              const cfg = SEVERITY_CONFIG[alert.sev]
              const Icon = SEVERITY_ICONS[alert.sev]
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 + i * 0.07, ease: EASE }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '9px 12px', borderLeft: `2px solid ${cfg.color}`,
                    background: cfg.bg, borderRadius: '0 8px 8px 0',
                  }}
                >
                  <Icon size={13} color={cfg.color} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{alert.cat}</span>
                      <span style={{ fontSize: 9, ...MONO_STYLE, color: $.t4 }}>{alert.time}</span>
                      <span style={{ fontSize: 8, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}28` }}>{cfg.label.toUpperCase()}</span>
                    </div>
                    <p style={{ fontSize: 11, color: $.t2, lineHeight: 1.45, margin: 0 }}>{alert.msg}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>
    </div>
  )
}

interface ApiAlertRow {
  id?: string
  alertId?: string
  severity: AlertSeverity
  category: string
  message?: string
  title?: string
  ts: string
}

// Compute trust average from a list of alert severities and timeline length.
// If there are no data points we return null (unknown), not a fake 95.
function computeTrustAvg(alertRows: ApiAlertRow[], durationMins: number): number | null {
  if (durationMins === 0 && alertRows.length === 0) return null
  // Penalty per severity
  const penalty: Record<string, number> = { critical: 20, high: 10, medium: 5, low: 2 }
  const totalPenalty = alertRows.reduce((sum, a) => sum + (penalty[a.severity] ?? 0), 0)
  return Math.max(0, Math.min(100, Math.round(100 - totalPenalty)))
}

// Convert API report data + alert rows to UI ReportData shape
function apiToReport(
  session: Record<string, unknown>,
  reportData: Record<string, unknown> | null,
  alertRows: ApiAlertRow[],
): ReportData {
  const summary = (reportData?.summary as Record<string, unknown>) ?? {}
  const createdAt = (session.createdAt ?? summary.createdAt) as string
  const endedAt = (session.endedAt ?? summary.endedAt) as string | null

  const durationMs = endedAt
    ? Math.max(0, new Date(endedAt).getTime() - new Date(createdAt).getTime())
    : 0
  const durationMins = Math.floor(durationMs / 60000)
  const durationSecs = Math.floor((durationMs % 60000) / 1000)
  const durationStr = durationMins > 0
    ? `${durationMins}m ${durationSecs}s`
    : `${durationSecs}s`

  const severityBreakdown = (summary.severityBreakdown as Record<string, number>) ?? {}
  const totalAlerts = (summary.totalAlerts as number) ?? alertRows.length

  // Build alert timeline from real alert rows
  const timeline: AlertItem[] = alertRows.map((a, i) => ({
    id: a.alertId ?? a.id ?? String(i),
    sev: a.severity,
    cat: a.category,
    msg: a.message ?? a.title ?? 'Alert detected',
    time: new Date(a.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  }))

  // Compute trust avg from real alert data — never hardcode 95
  const trustAvgComputed = computeTrustAvg(alertRows, durationMins)
  const trustAvg = trustAvgComputed !== null ? trustAvgComputed : 0

  // Build a simple trust curve: start at 100 and apply penalty at each alert's timestamp
  let trustCurve: TrustPoint[] = []
  if (durationMins > 0 && endedAt) {
    const startMs = new Date(createdAt).getTime()
    const endMs = new Date(endedAt).getTime()
    const totalMs = endMs - startMs
    // Sample at regular intervals
    const intervals = Math.min(Math.max(durationMins, 2), 20)
    const penalty: Record<string, number> = { critical: 20, high: 10, medium: 5, low: 2 }
    for (let i = 0; i <= intervals; i++) {
      const tMs = startMs + (totalMs * i) / intervals
      const tLabel = new Date(tMs).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      const alertsUpToNow = alertRows.filter((a) => new Date(a.ts).getTime() <= tMs)
      const pen = alertsUpToNow.reduce((sum, a) => sum + (penalty[a.severity] ?? 0), 0)
      trustCurve.push({ t: tLabel, score: Math.max(0, Math.min(100, Math.round(100 - pen))) })
    }
  }

  return {
    id: (session.id as string) ?? '',
    sessionId: (session.id as string) ?? '',
    title: (session.title ?? summary.title) as string ?? 'Session Report',
    date: new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    duration: durationStr,
    durationMins,
    participants: 0,
    trustAvg,
    alerts: {
      total: totalAlerts,
      critical: severityBreakdown.critical ?? alertRows.filter((a) => a.severity === 'critical').length,
      high: severityBreakdown.high ?? alertRows.filter((a) => a.severity === 'high').length,
      medium: severityBreakdown.medium ?? alertRows.filter((a) => a.severity === 'medium').length,
      low: severityBreakdown.low ?? alertRows.filter((a) => a.severity === 'low').length,
    },
    timeline,
    trustCurve,
  }
}

export default function Reports() {
  const isMobile = window.innerWidth <= 768
  const { activeSession } = useSessionContext()
  const location = useLocation()
  const incomingSessionId = (location.state as { sessionId?: string } | null)?.sessionId ?? ''

  const [reports, setReports] = useState<ReportData[]>([])
  const [selectedId, setSelectedId] = useState(incomingSessionId)
  const [loadingReports, setLoadingReports] = useState(true)

  // Fetch sessions and their reports from API
  const fetchReports = useCallback(async () => {
    try {
      const sessionsRes = await authFetch('/api/sessions')
      if (!sessionsRes.ok) throw new Error('Failed to fetch sessions')
      const sessionsData = await sessionsRes.json() as { sessions?: Record<string, unknown>[] }

      if (!sessionsData.sessions || sessionsData.sessions.length === 0) {
        // No sessions yet — use mock data for demo
        setReports([])
        setSelectedId('')
        setLoadingReports(false)
        return
      }

      // Only fetch reports for completed sessions
      const completed = sessionsData.sessions.filter((s) => s.endedAt)
      if (completed.length === 0) {
        // No completed sessions — fall back to mock data
        setReports([])
        setSelectedId('')
        setLoadingReports(false)
        return
      }

      const reportResults = await Promise.allSettled(
        completed.map(async (session) => {
          try {
            // Fetch report summary and alerts in parallel
            const [reportRes, alertsRes] = await Promise.all([
              authFetch(`/api/sessions/${session.id as string}/report`),
              authFetch(`/api/sessions/${session.id as string}/alerts`),
            ])
            const reportData = reportRes.ok ? await reportRes.json() as Record<string, unknown> : null
            const alertsData = alertsRes.ok ? await alertsRes.json() as { alerts?: ApiAlertRow[] } : null
            const alertRows = alertsData?.alerts ?? []
            return apiToReport(session, reportData, alertRows)
          } catch {
            return apiToReport(session, null, [])
          }
        })
      )

      const liveReports = reportResults
        .filter((r): r is PromiseFulfilledResult<ReportData> => r.status === 'fulfilled')
        .map((r) => r.value)

      if (liveReports.length > 0) {
        setReports(liveReports)
        // If navigated from Sessions with a specific session, select it; otherwise first
        setSelectedId((prev) => {
          if (prev && liveReports.some((r) => r.id === prev)) return prev
          return liveReports[0].id
        })
      }
    } catch {
      // API unavailable — show empty state
      setReports([])
      setSelectedId('')
    } finally {
      setLoadingReports(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  // Re-fetch when active session ends
  useEffect(() => {
    if (!activeSession) {
      // Session ended — might have new report
      const timer = setTimeout(fetchReports, 2000)
      return () => clearTimeout(timer)
    }
  }, [activeSession, fetchReports])

  const selected = reports.find((r) => r.id === selectedId) ?? reports[0]

  if (loadingReports) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 10, color: $.t4, fontSize: 13 }}>
        <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-flex' }}>
          <Loader size={16} color={$.t4} />
        </motion.span>
        Loading reports...
      </div>
    )
  }

  if (!selected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '40vh', color: $.t4, fontSize: 13 }}>
        No reports available yet. Complete a session to generate a report.
      </div>
    )
  }

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={LABEL_STYLE}>Completed Sessions</span>
            <span style={{ fontSize: 10, ...MONO_STYLE, color: $.t4 }}>{reports.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {reports.map((r, i) => {
              const col = trustColor(r.trustAvg)
              const isSelected = r.id === selectedId
              return (
                <motion.button
                  key={r.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05, ease: EASE }}
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    flexShrink: 0, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    background: isSelected ? `${$.cyan}08` : $.bg1,
                    border: `1px solid ${isSelected ? `${$.cyan}20` : $.b1}`,
                    textAlign: 'left', fontFamily: 'Inter, sans-serif',
                    transition: 'all 200ms', minWidth: 160,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: $.t1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>{r.title}</span>
                    <span style={{ fontSize: 11, ...MONO_STYLE, color: col, fontWeight: 600 }}>{r.trustAvg}%</span>
                  </div>
                  <div style={{ fontSize: 10, color: $.t3 }}>{r.date}</div>
                </motion.button>
              )
            })}
          </div>
        </div>
        <ReportDetail report={selected} />
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '272px 1fr', gap: 14, height: '100%', minHeight: 0 }}>
      {/* Left panel — report list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', paddingRight: 2 }}>
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, marginBottom: 2 }}
        >
          <span style={LABEL_STYLE}>Completed Sessions</span>
          <span style={{ fontSize: 10, ...MONO_STYLE, color: $.t4 }}>{reports.length}</span>
        </motion.div>
        {reports.map((r, i) => (
          <ReportItem
            key={r.id} report={r}
            selected={r.id === selectedId}
            delay={0.05 + i * 0.06}
            onClick={() => setSelectedId(r.id)}
          />
        ))}
      </div>

      {/* Right panel — detail */}
      <div style={{ overflow: 'auto', minHeight: 0 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ height: '100%' }}
          >
            <ReportDetail report={selected} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
