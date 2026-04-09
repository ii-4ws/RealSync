import React, { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Briefcase, Users, Star, Clock, AlertTriangle, Trash2, Monitor, FileText,
  ExternalLink, CheckCircle, Loader, X, Play,
} from 'lucide-react'
import $ from '../lib/tokens'
import { EASE, LABEL_STYLE, MONO_STYLE } from '../lib/tokens'
import { authFetch } from '../lib/api'
import { useSessionContext } from '../contexts/SessionContext'
import { useIsMobile } from '../hooks/useIsMobile'

type SessionType = 'official' | 'business' | 'friends'

type SessionStatus = 'connected' | 'joining' | 'completed' | 'waiting'

interface Session {
  id: string
  title: string
  type: SessionType
  createdAt: string
  duration: string
  status: SessionStatus
  alerts: number
  zoomUrl?: string
  endedAt?: string | null
  botStatus?: string
}

const SESSION_TYPE_CONFIG = {
  official: { icon: Star, label: 'Official', color: $.violet, bg: 'rgba(139,92,246,0.10)' },
  business: { icon: Briefcase, label: 'Business', color: $.blue, bg: 'rgba(59,130,246,0.10)' },
  friends: { icon: Users, label: 'Friends', color: $.cyan, bg: 'rgba(34,211,238,0.08)' },
}

const STATUS_CONFIG = {
  connected: { label: 'Connected', color: $.green, bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)' },
  joining: { label: 'Joining', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)' },
  waiting: { label: 'Waiting', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)' },
  completed: { label: 'Completed', color: $.t3, bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.06)' },
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.completed
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10,
      fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
      color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.border}`, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap',
    }}>
      {status === 'connected' && (
        <span style={{ position: 'relative', display: 'inline-flex', width: 6, height: 6, flexShrink: 0 }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: cfg.color, boxShadow: `0 0 6px ${cfg.color}` }} />
          <motion.span
            style={{ position: 'absolute', inset: -2, borderRadius: '50%', border: `1.5px solid ${cfg.color}` }}
            animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
        </span>
      )}
      {(status === 'joining' || status === 'waiting') && (
        <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.1, repeat: Infinity }}>
          <Loader size={8} />
        </motion.span>
      )}
      {status === 'completed' && <CheckCircle size={8} />}
      {cfg.label}
    </span>
  )
}

function TypeBadge({ type }: { type: SessionType }) {
  const cfg = SESSION_TYPE_CONFIG[type] ?? SESSION_TYPE_CONFIG.business
  const Icon = cfg.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
      fontWeight: 500, color: cfg.color, background: cfg.bg,
      borderRadius: 7, padding: '4px 9px', whiteSpace: 'nowrap',
    }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  )
}

function IconBtn({ icon: Icon, title, color, onClick }: { icon: typeof Trash2; title: string; color: string; onClick?: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
        border: `1px solid ${hov ? $.b2 : $.b1}`,
        background: hov ? 'rgba(255,255,255,0.05)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 150ms cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      <Icon size={13} color={hov ? color : $.t3} />
    </button>
  )
}

function StatCard({ label, value, sub, accent, delay }: { label: string; value: string; sub: string; accent: string; delay: number }) {
  const [hov, setHov] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        background: $.bg1, border: `1px solid ${hov ? $.b2 : $.b1}`,
        borderRadius: 14, padding: '16px 18px',
        transition: 'border-color 200ms, transform 200ms',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div style={{ ...LABEL_STYLE, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, color: $.t1, fontWeight: 400, ...MONO_STYLE, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: accent }}>{sub}</div>
    </motion.div>
  )
}

function durationStr(createdAt: string, endedAt?: string | null): string {
  const start = new Date(createdAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const diffMs = Math.max(0, end - start)
  const totalSec = Math.floor(diffMs / 1000)
  const hrs = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function apiStatusToLocal(apiSession: Record<string, unknown>): Session {
  const endedAt = apiSession.endedAt as string | null
  const botStatus = (apiSession.botStatus as string) ?? 'idle'
  let status: SessionStatus = 'completed'
  if (!endedAt) {
    if (botStatus === 'joining') status = 'joining'
    else if (botStatus === 'connected' || botStatus === 'streaming') status = 'connected'
    else status = 'waiting'
  }
  const type = (apiSession.meetingType as SessionType) ?? 'business'
  return {
    id: apiSession.id as string,
    title: apiSession.title as string,
    type: SESSION_TYPE_CONFIG[type] ? type : 'business',
    createdAt: new Date(apiSession.createdAt as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    duration: durationStr(apiSession.createdAt as string, endedAt),
    status,
    alerts: 0,
    zoomUrl: (apiSession.meetingUrl as string) ?? undefined,
    endedAt,
    botStatus,
  }
}

function TableRow({ session, index, onDelete, onMonitor, onViewReport }: { session: Session; index: number; onDelete: (id: string) => void; onMonitor: (s: Session) => void; onViewReport: (id: string) => void }) {
  const [hov, setHov] = useState(false)
  const alertColor = session.alerts >= 5 ? $.red : session.alerts >= 2 ? '#F59E0B' : session.alerts === 1 ? $.blue : $.t4
  const TypeIcon = SESSION_TYPE_CONFIG[session.type]?.icon ?? Briefcase

  return (
    <motion.tr
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.3, delay: 0.08 + index * 0.055, ease: EASE }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'rgba(255,255,255,0.022)' : 'transparent',
        borderBottom: `1px solid ${$.b1}`,
        transition: 'background 200ms',
      }}
    >
      <td style={{ padding: '13px 16px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: SESSION_TYPE_CONFIG[session.type]?.bg ?? $.bg2,
            border: `1px solid ${SESSION_TYPE_CONFIG[session.type]?.color ?? $.b1}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 200ms',
            transform: hov ? 'scale(1.07)' : 'scale(1)',
          }}>
            <TypeIcon size={14} color={SESSION_TYPE_CONFIG[session.type]?.color ?? $.t3} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: $.t1, fontWeight: 500, lineHeight: 1.3 }}>{session.title}</div>
            <div style={{ fontSize: 10, color: $.t4, marginTop: 1, ...MONO_STYLE }}>{session.id}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '13px 12px', verticalAlign: 'middle' }}>
        <TypeBadge type={session.type} />
      </td>
      <td style={{ padding: '13px 12px', verticalAlign: 'middle' }}>
        <StatusBadge status={session.status} />
      </td>
      <td style={{ padding: '13px 12px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Clock size={11} color={$.t4} />
          <span style={{ fontSize: 12, color: $.t2, ...MONO_STYLE }}>{session.duration}</span>
        </div>
      </td>
      <td style={{ padding: '13px 12px', verticalAlign: 'middle' }}>
        <span style={{ fontSize: 12, color: $.t3 }}>{session.createdAt}</span>
      </td>
      <td style={{ padding: '13px 12px', verticalAlign: 'middle' }}>
        {session.alerts > 0
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: alertColor, background: `${alertColor}14`, borderRadius: 6, padding: '3px 8px', ...MONO_STYLE }}>
              <AlertTriangle size={10} />{session.alerts}
            </span>
          : <span style={{ fontSize: 11, color: $.t4, ...MONO_STYLE }}>—</span>
        }
      </td>
      <td style={{ padding: '13px 12px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: hov ? 1 : 0, transition: 'opacity 180ms' }}>
          {session.status === 'completed' ? (
            <IconBtn icon={FileText} title="View report" color={$.blue} onClick={() => onViewReport(session.id)} />
          ) : (
            <>
              <IconBtn icon={Monitor} title="Monitor live" color={$.cyan} onClick={() => onMonitor(session)} />
              {session.zoomUrl && <IconBtn icon={ExternalLink} title="Open in Zoom" color={$.t2} onClick={() => window.open(session.zoomUrl, '_blank')} />}
            </>
          )}
          <IconBtn icon={Trash2} title="Delete session" color={$.red} onClick={() => onDelete(session.id)} />
        </div>
      </td>
    </motion.tr>
  )
}

function MobileCard({ session, index, onDelete, onMonitor, onViewReport }: { session: Session; index: number; onDelete: (id: string) => void; onMonitor: (s: Session) => void; onViewReport: (id: string) => void }) {
  const alertColor = session.alerts >= 5 ? $.red : session.alerts >= 2 ? '#F59E0B' : session.alerts === 1 ? $.blue : $.t4
  const TypeIcon = SESSION_TYPE_CONFIG[session.type]?.icon ?? Briefcase

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.3, delay: 0.06 + index * 0.04, ease: EASE }}
      style={{
        background: $.bg1, border: `1px solid ${$.b1}`,
        borderRadius: 12, padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: SESSION_TYPE_CONFIG[session.type]?.bg ?? $.bg2,
          border: `1px solid ${SESSION_TYPE_CONFIG[session.type]?.color ?? $.b1}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <TypeIcon size={14} color={SESSION_TYPE_CONFIG[session.type]?.color ?? $.t3} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: $.t1, fontWeight: 500, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title}</div>
          <div style={{ fontSize: 10, color: $.t4, ...MONO_STYLE }}>{session.id}</div>
        </div>
        <StatusBadge status={session.status} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TypeBadge type={session.type} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={10} color={$.t4} />
          <span style={{ fontSize: 11, color: $.t3, ...MONO_STYLE }}>{session.duration}</span>
        </div>
        <span style={{ fontSize: 11, color: $.t4 }}>{session.createdAt}</span>
        {session.alerts > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: alertColor, background: `${alertColor}14`, borderRadius: 6, padding: '2px 6px', ...MONO_STYLE }}>
            <AlertTriangle size={9} />{session.alerts}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {session.status === 'completed' ? (
            <IconBtn icon={FileText} title="View report" color={$.blue} onClick={() => onViewReport(session.id)} />
          ) : (
            <>
              <IconBtn icon={Monitor} title="Monitor" color={$.cyan} onClick={() => onMonitor(session)} />
              {session.zoomUrl && <IconBtn icon={ExternalLink} title="Open in Zoom" color={$.t2} onClick={() => window.open(session.zoomUrl, '_blank')} />}
            </>
          )}
          <IconBtn icon={Trash2} title="Delete" color={$.red} onClick={() => onDelete(session.id)} />
        </div>
      </div>
    </motion.div>
  )
}

function NewSessionModal({ open, onClose, onCreate }: {
  open: boolean
  onClose: () => void
  onCreate: (s: { title: string; type: SessionType; meetingUrl?: string }) => Promise<void>
}) {
  const isMobile = useIsMobile()
  const [name, setName] = useState('')
  const [type, setType] = useState<SessionType>('business')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = name.trim().length > 0 && !loading

  const inputBase: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none',
    borderRadius: 9, padding: '10px 14px', fontSize: 13, color: $.t1,
    fontFamily: 'Inter, sans-serif', transition: 'border-color 150ms, background 150ms',
  }

  async function submit() {
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      await onCreate({ title: name.trim(), type, meetingUrl: url.trim() || undefined })
      setName(''); setType('business'); setUrl('')
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create session.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: isMobile ? 1 : 0.95, y: isMobile ? 16 : -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: isMobile ? 1 : 0.95, y: isMobile ? 16 : -12 }}
            transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.8 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: isMobile ? '100%' : 'min(460px, 92vw)',
              maxHeight: isMobile ? '92vh' : undefined,
              overflowY: isMobile ? 'auto' : undefined,
              zIndex: 201, background: $.bg1,
              border: `1px solid ${$.b2}`,
              borderRadius: isMobile ? '18px 18px 0 0' : 18,
              boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
              overflow: 'hidden', alignSelf: isMobile ? 'flex-end' : 'auto',
            }}
          >
            <div style={{ height: 2, background: `linear-gradient(90deg, ${$.cyan}, ${$.violet}, transparent)` }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Play size={15} color={$.cyan} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: $.t1 }}>New Session</div>
                  <div style={{ fontSize: 10, color: $.t4, marginTop: 1 }}>Start monitoring a meeting</div>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 28, height: 28, borderRadius: 7, border: `1px solid ${$.b1}`,
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: $.t3,
                }}
              >
                <X size={14} color={$.t3} />
              </button>
            </div>

            <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Session Name */}
              <div>
                <label style={{ ...LABEL_STYLE, display: 'block', marginBottom: 7 }}>Session Name</label>
                <input
                  value={name} onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="e.g. Q2 Budget Review"
                  style={{ ...inputBase, background: $.bg2, boxShadow: `0 0 0 1px ${$.b1}` }}
                  onFocus={(e) => { e.currentTarget.style.background = $.bg3; e.currentTarget.style.boxShadow = `0 0 0 1px ${$.b3}` }}
                  onBlur={(e) => { e.currentTarget.style.background = $.bg2; e.currentTarget.style.boxShadow = `0 0 0 1px ${$.b1}` }}
                />
              </div>

              {/* Meeting URL */}
              <div>
                <label style={{ ...LABEL_STYLE, display: 'block', marginBottom: 7 }}>
                  Meeting URL <span style={{ color: $.t4, fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  value={url} onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://zoom.us/j/..."
                  style={{ ...inputBase, ...MONO_STYLE, fontSize: 12, background: $.bg2, boxShadow: `0 0 0 1px ${$.b1}` }}
                  onFocus={(e) => { e.currentTarget.style.background = $.bg3; e.currentTarget.style.boxShadow = `0 0 0 1px ${$.b3}` }}
                  onBlur={(e) => { e.currentTarget.style.background = $.bg2; e.currentTarget.style.boxShadow = `0 0 0 1px ${$.b1}` }}
                />
              </div>

              {/* Session Type */}
              <div>
                <label style={{ ...LABEL_STYLE, display: 'block', marginBottom: 8 }}>Session Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {(Object.entries(SESSION_TYPE_CONFIG) as [SessionType, typeof SESSION_TYPE_CONFIG[SessionType]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon
                    const selected = type === key
                    return (
                      <button
                        key={key} onClick={() => setType(key)}
                        style={{
                          padding: '11px 8px',
                          background: selected ? cfg.bg : $.bg2,
                          border: `1px solid ${selected ? cfg.color + '55' : $.b1}`,
                          borderRadius: 10, cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                          transition: 'all 150ms', fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        <Icon size={16} color={selected ? cfg.color : $.t3} />
                        <span style={{ fontSize: 11, color: selected ? cfg.color : $.t3, fontWeight: selected ? 600 : 400 }}>{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {error && (
                <div style={{ fontSize: 12, color: $.red, padding: '8px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {error}
                </div>
              )}

              <div style={{ height: 1, background: $.b1 }} />

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={onClose}
                  style={{
                    flex: 1, padding: 11, borderRadius: 10, cursor: 'pointer',
                    background: $.bg2, border: `1px solid ${$.b1}`,
                    color: $.t3, fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                  }}
                >
                  Cancel
                </button>
                <motion.button
                  onClick={submit}
                  disabled={!canSubmit}
                  whileTap={canSubmit ? { scale: 0.98 } : undefined}
                  style={{
                    flex: 2, padding: 11,
                    background: canSubmit ? 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(59,130,246,0.15))' : $.bg2,
                    border: `1px solid ${canSubmit ? 'rgba(34,211,238,0.40)' : $.b1}`,
                    borderRadius: 10, cursor: canSubmit ? 'pointer' : 'not-allowed',
                    color: canSubmit ? $.cyan : $.t4, fontSize: 13, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 180ms', fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {loading
                    ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-flex' }}><Loader size={14} /></motion.span>Starting session...</>
                    : <><Play size={14} />Start Session</>
                  }
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Sessions' },
  { value: 'connected', label: 'Connected' },
  { value: 'joining', label: 'Joining' },
  { value: 'completed', label: 'Completed' },
]

function ThCell({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th style={{
      padding: '10px 12px', textAlign: 'left', ...LABEL_STYLE,
      fontWeight: 500, userSelect: 'none', whiteSpace: 'nowrap', width: width ?? undefined,
    }}>
      {children}
    </th>
  )
}

export default function Sessions() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { handleStartSession, handleEndSession, activeSession } = useSessionContext()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [filter, setFilter] = useState('all')

  // Fetch sessions from API
  const fetchSessions = useCallback(async () => {
    try {
      const res = await authFetch('/api/sessions')
      if (!res.ok) throw new Error('Failed to fetch sessions')
      const data = await res.json() as { sessions?: Record<string, unknown>[] }
      if (data.sessions && Array.isArray(data.sessions)) {
        setSessions(data.sessions.map(apiStatusToLocal))
      }
    } catch {
      // If API fails, sessions remain empty
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
    // Poll every 30s to update status
    const interval = setInterval(fetchSessions, 30_000)
    return () => clearInterval(interval)
  }, [fetchSessions])

  const active = sessions.filter((s) => s.status !== 'completed')
  const totalAlerts = sessions.reduce((a, s) => a + s.alerts, 0)
  const completed = sessions.filter((s) => s.status === 'completed').length

  const filtered = filter === 'all' ? sessions : sessions.filter((s) => s.status === filter)

  const handleCreate = useCallback(async (data: { title: string; type: SessionType; meetingUrl?: string }) => {
    const res = await authFetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        meetingType: data.type,
        meetingUrl: data.meetingUrl || null,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string }
      throw new Error(err.error ?? 'Failed to create session')
    }

    const result = await res.json() as { sessionId: string }
    handleStartSession(result.sessionId, data.title, data.type)

    // Refresh list
    await fetchSessions()
  }, [fetchSessions, handleStartSession])

  const handleDelete = useCallback(async (id: string) => {
    // If this is the active session, end it first
    if (activeSession?.sessionId === id) {
      await handleEndSession()
    }
    // Stop on backend
    try {
      await authFetch(`/api/sessions/${id}/stop`, { method: 'POST' })
    } catch {
      // Best-effort
    }
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }, [activeSession?.sessionId, handleEndSession])

  const handleMonitor = useCallback((session: Session) => {
    handleStartSession(session.id, session.title, session.type)
  }, [handleStartSession])

  const handleViewReport = useCallback((id: string) => {
    navigate('/reports', { state: { sessionId: id } })
  }, [navigate])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard label="Active Sessions" value={loading ? '…' : String(active.length)} sub="Connected or joining" accent={$.green} delay={0.05} />
        <StatCard label="Total Sessions" value={loading ? '…' : String(sessions.length)} sub="Across all sessions" accent={$.cyan} delay={0.1} />
        <StatCard label="Total Alerts" value={loading ? '…' : String(totalAlerts)} sub="Across all sessions" accent={$.red} delay={0.15} />
        <StatCard label="Completed" value={loading ? '…' : String(completed)} sub="Finished & archived" accent={$.blue} delay={0.2} />
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{
          background: $.bg1, border: `1px solid ${$.b1}`, borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: `1px solid ${$.b1}`, flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {FILTER_OPTIONS.map((opt) => {
              const isActive = filter === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 12,
                    border: `1px solid ${isActive ? 'rgba(34,211,238,0.30)' : $.b1}`,
                    background: isActive ? 'rgba(34,211,238,0.08)' : $.bg2,
                    color: isActive ? $.cyan : $.t3, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', fontWeight: isActive ? 600 : 400,
                    transition: 'all 150ms', whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              background: 'rgba(34,211,238,0.10)', border: '1px solid rgba(34,211,238,0.25)',
              borderRadius: 9, color: $.cyan, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              fontFamily: 'Inter, sans-serif', transition: 'all 150ms',
            }}
          >
            <Play size={13} /> New Session
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: $.t4, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-flex' }}>
              <Loader size={14} color={$.t4} />
            </motion.span>
            Loading sessions...
          </div>
        ) : isMobile ? (
          <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <AnimatePresence>
              {filtered.map((s, i) => (
                <MobileCard key={s.id} session={s} index={i} onDelete={handleDelete} onMonitor={handleMonitor} onViewReport={handleViewReport} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${$.b1}` }}>
                  <ThCell>Session</ThCell>
                  <ThCell>Type</ThCell>
                  <ThCell>Status</ThCell>
                  <ThCell>Duration</ThCell>
                  <ThCell>Created</ThCell>
                  <ThCell>Alerts</ThCell>
                  <ThCell width="120px">Actions</ThCell>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filtered.map((s, i) => (
                    <TableRow key={s.id} session={s} index={i} onDelete={handleDelete} onMonitor={handleMonitor} onViewReport={handleViewReport} />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: $.t4, fontSize: 13 }}>
            No sessions found
          </div>
        )}
      </motion.div>

      <NewSessionModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={handleCreate} />
    </div>
  )
}
