import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { Shield, AlertTriangle, Users, Zap, Eye, Mic, Brain, AlertCircle, Info } from 'lucide-react'
import BentoCard from '../components/ui/BentoCard'
import TrustGauge from '../components/ui/TrustGauge'
import $ from '../lib/tokens'
import { EASE, LABEL_STYLE, MONO_STYLE } from '../lib/tokens'
import type { AlertSeverity } from '../lib/mockData'
import { useWsMessages, useWebSocket } from '../contexts/WebSocketContext'
import { useSessionContext } from '../contexts/SessionContext'
import { authFetch } from '../lib/api'
import { useIsMobile } from '../hooks/useIsMobile'

const LABEL = LABEL_STYLE

const SEVERITY_STYLE: Record<AlertSeverity, { color: string; bg: string; icon: typeof AlertCircle }> = {
  critical: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', icon: AlertCircle },
  high: { color: '#F97316', bg: 'rgba(249,115,22,0.08)', icon: AlertTriangle },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', icon: AlertTriangle },
  low: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', icon: Info },
}

type EmotionLabel = 'Happy' | 'Neutral' | 'Angry' | 'Fear' | 'Surprise' | 'Sad'
type RiskLevel = 'low' | 'medium' | 'high'

interface LiveMetrics {
  trustScore: number
  emotion: { label: EmotionLabel; confidence: number }
  deepfake: { authenticityScore: number; riskLevel: RiskLevel }
  confidenceLayers: { audio: number | null; video: number | null; behavior: number | null }
  source: string
  timestamp: string
}

interface LiveAlert {
  alertId: string
  severity: AlertSeverity
  category: string
  title: string
  message: string
  ts: string
}

interface Participant {
  faceId: number
  name: string | null
  firstSeen: string
}

interface TrustPoint { t: string; score: number }

const DEFAULT_METRICS: LiveMetrics = {
  trustScore: 0,
  emotion: { label: 'Neutral', confidence: 0 },
  deepfake: { authenticityScore: 0, riskLevel: undefined as unknown as RiskLevel },
  confidenceLayers: { audio: 0, video: 0, behavior: 0 },
  source: 'waiting',
  timestamp: new Date().toISOString(),
}

function riskLabel(level: RiskLevel | undefined): string {
  if (!level) return '—'
  return level.toUpperCase()
}

function riskColor(level: RiskLevel | undefined): string {
  if (level === 'high') return '#EF4444'
  if (level === 'medium') return '#F59E0B'
  if (level === 'low') return $.green
  return $.t4
}

function pct(val: number | null | undefined): number {
  if (val === null || val === undefined) return 0
  return Math.round(val * 100)
}

function SignalBar({ label, value, color, delay }: { label: string; value: number | null; color: string; delay: number }) {
  const displayPct = pct(value)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: $.t3, width: 56, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: $.bg2, borderRadius: 2, overflow: 'hidden' }}>
        <motion.div
          style={{ height: '100%', borderRadius: 2, background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${displayPct}%` }}
          transition={{ duration: 0.8, delay, ease: EASE }}
        />
      </div>
      <span style={{ fontSize: 11, ...MONO_STYLE, color: $.t2, width: 32, textAlign: 'right' }}>{displayPct}%</span>
    </div>
  )
}

interface DetectionPanelProps {
  icon: typeof Eye
  label: string
  score: number
  risk: string
  riskColor: string
  color: string
  delay: number
}

function DetectionPanel({ icon: Icon, label, score, risk, riskColor: rc, color, delay }: DetectionPanelProps) {
  return (
    <BentoCard delay={delay}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={14} color={color} />
          </div>
          <span style={{ fontSize: 12, color: $.t2, fontWeight: 500 }}>{label}</span>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 20,
          background: `${rc}18`, color: rc,
        }}>
          {risk}
        </span>
      </div>

      <div style={{
        fontSize: 24, fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 300, color: $.t1,
        fontFeatureSettings: "'tnum' 1",
        display: 'block', marginBottom: 10,
        lineHeight: 1.2,
      }}>
        {score}%
      </div>

      <div style={{ height: 3, background: $.bg2, borderRadius: 2, overflow: 'hidden' }}>
        <motion.div
          style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${color}, ${$.blue})` }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.9, delay: delay + 0.2, ease: EASE }}
        />
      </div>
    </BentoCard>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: $.bg2, border: `1px solid ${$.b2}`,
      borderRadius: 8, padding: '8px 12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontSize: 10, color: $.t3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, ...MONO_STYLE, color: $.cyan, fontWeight: 600 }}>{payload[0].value}%</div>
    </div>
  )
}

function TimelineChart({ data, height, margin, interval }: { data: TrustPoint[]; height: number; margin: object; interval: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={margin as React.ComponentProps<typeof AreaChart>['margin']}>
          <defs>
            <linearGradient id="timeline-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={$.cyan} stopOpacity={0.2} />
              <stop offset="100%" stopColor={$.cyan} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 10, fill: $.t4 }} axisLine={false} tickLine={false} interval={interval} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: $.t4 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: $.b2 }} />
          <Area
            type="monotone" dataKey="score"
            stroke={$.cyan} strokeWidth={2}
            fill="url(#timeline-fill)"
            dot={false}
            activeDot={{ r: 4, fill: $.cyan, stroke: $.bg0, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Dashboard() {
  const isMobile = useIsMobile()
  const { activeSession } = useSessionContext()
  const { isConnected } = useWebSocket()

  const [metrics, setMetrics] = useState<LiveMetrics>(DEFAULT_METRICS)
  const [alerts, setAlerts] = useState<LiveAlert[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [timeline, setTimeline] = useState<TrustPoint[]>([])
  const [dataSource, setDataSource] = useState<'waiting' | 'live'>('waiting')

  // Subscribe to WebSocket messages
  useWsMessages(useCallback((msg: Record<string, unknown>) => {
    if (msg.type === 'metrics' && msg.data) {
      const data = msg.data as Record<string, unknown>
      setMetrics({
        trustScore: (data.trustScore as number) ?? DEFAULT_METRICS.trustScore,
        emotion: (data.emotion as LiveMetrics['emotion']) ?? DEFAULT_METRICS.emotion,
        deepfake: (data.deepfake as LiveMetrics['deepfake']) ?? DEFAULT_METRICS.deepfake,
        confidenceLayers: (data.confidenceLayers as LiveMetrics['confidenceLayers']) ?? DEFAULT_METRICS.confidenceLayers,
        source: (data.source as string) ?? 'simulated',
        timestamp: (data.timestamp as string) ?? new Date().toISOString(),
      })
      setDataSource('live')
      setTimeline((prev) => {
        const now = new Date()
        const label = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
        const score = Math.round(((data.trustScore as number) ?? 0.98) * 100)
        return [...prev.slice(-29), { t: label, score }]
      })
    }

    if (msg.type === 'alert') {
      const a = msg as Record<string, unknown>
      setAlerts((prev) => [{
        alertId: (a.alertId as string) ?? crypto.randomUUID(),
        severity: (a.severity as AlertSeverity) ?? 'low',
        category: (a.category as string) ?? 'unknown',
        title: (a.title as string) ?? '',
        message: (a.message as string) ?? '',
        ts: (a.ts as string) ?? new Date().toISOString(),
      }, ...prev].slice(0, 50))
    }

    if (msg.type === 'participants') {
      const list = msg.participants as Participant[] | undefined
      if (Array.isArray(list)) setParticipants(list)
    }
  }, []))

  // On mount, fetch historical alerts if there's an active session
  useEffect(() => {
    if (!activeSession?.sessionId) return
    authFetch(`/api/sessions/${activeSession.sessionId}/alerts`)
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json() as { alerts?: Record<string, unknown>[] }
        if (data.alerts && Array.isArray(data.alerts)) {
          setAlerts(data.alerts.map((a) => ({
            alertId: (a.alertId as string) ?? (a.id as string) ?? crypto.randomUUID(),
            severity: (a.severity as AlertSeverity) ?? 'low',
            category: (a.category as string) ?? 'unknown',
            title: (a.title as string) ?? '',
            message: (a.message as string) ?? '',
            ts: (a.ts as string) ?? new Date().toISOString(),
          })))
        }
      })
      .catch(() => {})
  }, [activeSession?.sessionId])

  // Derived display values
  const trustPct = Math.round(metrics.trustScore * 100)
  const videoPct = pct(metrics.deepfake?.authenticityScore)
  const audioPct = pct(metrics.confidenceLayers?.audio)
  const behaviorPct = pct(metrics.confidenceLayers?.behavior)
  const emotionPct = Math.round((metrics.emotion?.confidence ?? 0) * 100)
  const dfRisk = metrics.deepfake?.riskLevel ?? 'low'

  const statCards = [
    { icon: Shield, label: 'Trust Score', val: `${trustPct}%`, sub: trustPct >= 95 ? 'All signals authentic' : 'Monitoring active', accent: $.cyan },
    { icon: AlertTriangle, label: 'Alerts', val: String(alerts.length), sub: alerts.length === 0 ? 'No alerts' : `${alerts.filter(a => a.severity === 'critical').length} critical`, accent: $.red },
    { icon: Users, label: 'Participants', val: String(participants.length || '—'), sub: participants.length > 0 ? `${participants.length} tracked` : 'Waiting for session', accent: $.blue },
    { icon: Zap, label: 'Source', val: dataSource === 'live' ? 'LIVE' : 'SIM', sub: isConnected ? 'WebSocket connected' : activeSession ? 'Reconnecting...' : 'No active session', accent: $.violet },
  ]

  const detectionPanels = [
    { icon: Eye, label: 'Visual', score: videoPct, risk: riskLabel(dfRisk), rc: riskColor(dfRisk), color: $.cyan, delay: 0.3 },
    { icon: Mic, label: 'Audio', score: audioPct, risk: audioPct >= 85 ? 'LOW' : audioPct >= 60 ? 'MEDIUM' : 'HIGH', rc: audioPct >= 85 ? $.green : audioPct >= 60 ? '#F59E0B' : '#EF4444', color: $.blue, delay: 0.4 },
    { icon: Brain, label: 'Emotion', score: emotionPct, risk: 'LOW', rc: $.green, color: $.violet, delay: 0.5 },
  ]

  const signalBars = [
    { label: 'Audio', value: metrics.confidenceLayers?.audio, color: $.cyan, delay: 0.7 },
    { label: 'Video', value: metrics.confidenceLayers?.video ?? metrics.deepfake?.authenticityScore, color: $.blue, delay: 0.8 },
    { label: 'Behavior', value: metrics.confidenceLayers?.behavior, color: $.orange, delay: 0.9 },
  ]

  // No active session banner
  const noSessionBanner = !activeSession && (
    <div style={{
      gridColumn: 'span 12',
      padding: '12px 16px', borderRadius: 10,
      background: 'rgba(34,211,238,0.06)', border: `1px solid ${$.cyan}22`,
      fontSize: 12, color: $.t3, marginBottom: 4,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <Zap size={13} color={$.cyan} />
      No active session. Go to Sessions to start monitoring a meeting.
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!activeSession && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(34,211,238,0.06)', border: `1px solid ${$.cyan}22`, fontSize: 11, color: $.t3, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={12} color={$.cyan} />
            No active session.
          </div>
        )}

        {/* Stat cards 2×2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {statCards.map((card, i) => (
            <BentoCard key={card.label} delay={0.05 + i * 0.05}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${card.accent}, transparent)` }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <card.icon size={11} color={card.accent} />
                <span style={LABEL}>{card.label}</span>
              </div>
              <div style={{ fontSize: 20, fontFamily: 'JetBrains Mono, monospace', color: $.t1, fontWeight: 400, fontFeatureSettings: "'tnum' 1", marginBottom: 3 }}>{card.val}</div>
              <div style={{ fontSize: 10, color: card.accent }}>{card.sub}</div>
            </BentoCard>
          ))}
        </div>

        {/* Trust gauge */}
        <BentoCard delay={0.2}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={LABEL}>Live Trust Score</span>
            <span style={{ fontSize: 9, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>{dataSource}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <TrustGauge pct={trustPct} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {signalBars.map((b) => <SignalBar key={b.label} {...b} />)}
          </div>
        </BentoCard>

        {/* Detection panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {detectionPanels.map((p) => (
            <DetectionPanel key={p.label} icon={p.icon} label={p.label} score={p.score} risk={p.risk} riskColor={p.rc} color={p.color} delay={p.delay} />
          ))}
        </div>

        {/* Alerts */}
        <LiveAlertFeed alerts={alerts} />

        {/* Timeline */}
        <BentoCard delay={0.5} style={{ padding: '12px 12px 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={LABEL_STYLE}>Trust Score Timeline</span>
            <span style={{ fontSize: 9, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>{dataSource}</span>
          </div>
          <TimelineChart data={timeline} height={90} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} interval={8} />
        </BentoCard>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(12, 1fr)',
      gridTemplateRows: 'auto auto 1fr',
      gap: 12, alignContent: 'start', height: '100%',
    }}>
      {/* No session banner */}
      {noSessionBanner}

      {/* Stat cards — row 1 */}
      {statCards.map((card, i) => (
        <BentoCard key={card.label} span={3} delay={0.05 + i * 0.05}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${card.accent}, transparent)` }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <card.icon size={13} color={card.accent} />
            <span style={LABEL}>{card.label}</span>
          </div>
          <div style={{ fontSize: 22, fontFamily: 'JetBrains Mono, monospace', color: $.t1, fontWeight: 400, fontFeatureSettings: "'tnum' 1", marginBottom: 4 }}>{card.val}</div>
          <div style={{ fontSize: 11, color: card.accent }}>{card.sub}</div>
        </BentoCard>
      ))}

      {/* Trust gauge — spans rows 2-3 */}
      <BentoCard span={5} rowSpan={2} delay={0.2}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={LABEL}>Live Trust Score</span>
          <span style={{ fontSize: 9, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>{dataSource}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <TrustGauge pct={trustPct} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {signalBars.map((b) => <SignalBar key={b.label} {...b} />)}
        </div>
      </BentoCard>

      {/* Detection panels column */}
      <div style={{ gridColumn: 'span 3', gridRow: 'span 2', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {detectionPanels.map((p) => (
          <DetectionPanel key={p.label} icon={p.icon} label={p.label} score={p.score} risk={p.risk} riskColor={p.rc} color={p.color} delay={p.delay} />
        ))}
      </div>

      {/* Alert feed */}
      <BentoCard span={4} rowSpan={2} delay={0.25} style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={LABEL}>Live Alerts</span>
          <span style={{ fontSize: 10, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>{alerts.length}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
          <AlertFeedItems alerts={alerts} />
        </div>
      </BentoCard>

      {/* Timeline */}
      <BentoCard span={12} delay={0.5} style={{ padding: '16px 16px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={LABEL}>Trust Score Timeline</span>
          <span style={{ fontSize: 10, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>{dataSource}</span>
        </div>
        <TimelineChart data={timeline} height={120} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} interval={4} />
      </BentoCard>
    </div>
  )
}

function LiveAlertFeed({ alerts }: { alerts: LiveAlert[] }) {
  return (
    <BentoCard delay={0.25} style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={LABEL_STYLE}>Live Alerts</span>
        <span style={{ fontSize: 10, color: $.t4, fontFamily: 'JetBrains Mono, monospace' }}>{alerts.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <AlertFeedItems alerts={alerts} />
      </div>
    </BentoCard>
  )
}

function AlertFeedItems({ alerts }: { alerts: LiveAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div style={{ fontSize: 12, color: $.t4, textAlign: 'center', padding: '16px 0' }}>
        No alerts yet
      </div>
    )
  }

  return (
    <AnimatePresence initial={false}>
      {alerts.slice(0, 10).map((alert, i) => {
        const sev = SEVERITY_STYLE[alert.severity]
        const Icon = sev.icon
        const timeStr = new Date(alert.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        return (
          <motion.div
            key={alert.alertId}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.3, delay: i < 4 ? 0.4 + i * 0.08 : 0 }}
            style={{
              borderLeft: `2px solid ${sev.color}`,
              background: sev.bg,
              borderRadius: '0 8px 8px 0',
              padding: '8px 10px',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon size={13} color={sev.color} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: sev.color, textTransform: 'uppercase' }}>{alert.category}</span>
                  <span style={{ fontSize: 9, color: $.t4 }}>{timeStr}</span>
                </div>
                <p style={{ fontSize: 11, color: $.t2, lineHeight: 1.4, margin: 0 }}>{alert.message || alert.title}</p>
              </div>
            </div>
          </motion.div>
        )
      })}
    </AnimatePresence>
  )
}
