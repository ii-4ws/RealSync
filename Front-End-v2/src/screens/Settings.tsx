import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Shield, Bell, Lock, Eye, EyeOff, Check, Monitor } from 'lucide-react'
import Toggle from '../components/ui/Toggle'
import $ from '../lib/tokens'
import { EASE, LABEL_STYLE } from '../lib/tokens'
import { useSessionContext } from '../contexts/SessionContext'
import { supabase } from '../lib/supabaseClient'
import { authFetch } from '../lib/api'
import { useIsMobile } from '../hooks/useIsMobile'

// ─── Shared sub-components ────────────────────────────────────────────────────

function SettingsCard({ children, style, delay = 0 }: { children: React.ReactNode; style?: React.CSSProperties; delay?: number }) {
  const [hov, setHov] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: $.bg1,
        border: `1px solid ${hov ? $.b2 : $.b1}`,
        borderRadius: 14, padding: 20,
        transition: 'border-color 200ms cubic-bezier(0.4,0,0.2,1), transform 200ms cubic-bezier(0.4,0,0.2,1)',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        overflow: 'hidden', position: 'relative',
        ...style,
      }}
    >
      {children}
    </motion.div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: $.t1, margin: 0, marginBottom: subtitle ? 3 : 0 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 11, color: $.t3, margin: 0, lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
  )
}

function ToggleRow({ label, description, on, onChange, delay }: {
  label: string; description?: string; on: boolean; onChange: (v: boolean) => void; delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: delay ?? 0, ease: EASE }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '12px 0', borderBottom: `1px solid ${$.b1}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: $.t1, fontWeight: 500 }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: $.t3, marginTop: 2, lineHeight: 1.5 }}>{description}</div>}
      </div>
      <Toggle on={on} onChange={onChange} />
    </motion.div>
  )
}

function TextInput({ label, value, onChange, disabled, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange?: (v: string) => void; disabled?: boolean; type?: string; placeholder?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, color: $.t3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
      <input
        type={type} value={value} placeholder={placeholder} disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          background: $.bg2, border: `1px solid ${focused ? $.cyan : $.b1}`,
          borderRadius: 10, padding: '10px 12px', color: disabled ? $.t3 : $.t1,
          fontSize: 13, outline: 'none', width: '100%', fontFamily: 'Inter, sans-serif',
          transition: 'border-color 200ms cubic-bezier(0.4,0,0.2,1)',
          cursor: disabled ? 'not-allowed' : 'text', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function PasswordInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [focused, setFocused] = useState(false)
  const [visible, setVisible] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, color: $.t3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={visible ? 'text' : 'password'} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            background: $.bg2, border: `1px solid ${focused ? $.cyan : $.b1}`,
            borderRadius: 10, padding: '10px 40px 10px 12px', color: $.t1,
            fontSize: 13, outline: 'none', width: '100%', fontFamily: 'Inter, sans-serif',
            transition: 'border-color 200ms', boxSizing: 'border-box',
          }}
        />
        <button
          type="button" onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: $.t3, display: 'flex', alignItems: 'center', padding: 0, lineHeight: 1,
          }}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  )
}

// ─── Tab: General ─────────────────────────────────────────────────────────────

function GeneralTab() {
  const { profile, supabaseSession, setProfile } = useSessionContext()
  const PROTOTYPE_MODE = import.meta.env.VITE_PROTOTYPE_MODE === '1'

  const profileWithTitle = profile as (typeof profile & { job_title?: string | null }) | null
  const [name, setName] = useState(
    PROTOTYPE_MODE ? 'Demo User' : (profile?.full_name ?? profile?.username ?? '')
  )
  const [title, setTitle] = useState(
    PROTOTYPE_MODE ? 'Demo Account' : (profileWithTitle?.job_title ?? '')
  )
  const email = PROTOTYPE_MODE ? 'demo@realsync.ai' : (supabaseSession?.user?.email ?? '')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  // Sync if profile loads after mount
  useEffect(() => {
    if (profile && !PROTOTYPE_MODE) {
      setName(profile.full_name ?? profile.username ?? '')
      setTitle((profile as typeof profile & { job_title?: string | null })?.job_title ?? '')
    }
  }, [profile, PROTOTYPE_MODE])

  const avatarInitials = name
    .split(' ')
    .map((n) => n.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'RS'

  async function save() {
    if (PROTOTYPE_MODE) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
      return
    }

    const userId = supabaseSession?.user?.id
    if (!userId) { setSaveError('Not authenticated.'); return }
    if (!name.trim()) { setSaveError('Name cannot be empty.'); return }

    setSaving(true)
    setSaveError('')

    const updates: Record<string, unknown> = {
      id: userId,
      full_name: name.trim(),
      username: name.trim(),
      job_title: title.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('profiles')
      .upsert(updates, { onConflict: 'id' })
      .select('id, username, full_name, avatar_url, job_title, created_at, updated_at')
      .single()

    setSaving(false)

    if (error) {
      setSaveError(error.message)
      return
    }

    if (data) setProfile(data)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SettingsCard delay={0.05}>
        <SectionHeader title="Profile" subtitle="Your public-facing account information" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', background: $.bg2, borderRadius: 12, border: `1px solid ${$.b1}`, marginBottom: 20 }}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${$.b2}` }} />
          ) : (
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: `linear-gradient(135deg, ${$.cyan}, ${$.violet})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0,
              boxShadow: '0 0 24px rgba(34,211,238,0.22), 0 0 48px rgba(139,92,246,0.12)',
              letterSpacing: '-0.02em',
            }}>
              {avatarInitials}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, color: $.t1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'Your Name'}</div>
            {title && <div style={{ fontSize: 11, color: $.t3, marginTop: 3 }}>{title}</div>}
            <div style={{ fontSize: 11, color: $.t4, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextInput label="Full Name" value={name} onChange={setName} />
          <TextInput label="Email Address" value={email} disabled />
          <TextInput label="Job Title" value={title} onChange={setTitle} placeholder="e.g. Security Analyst" />
        </div>

        {saveError && (
          <p style={{ fontSize: 12, color: $.red, margin: '10px 0 0' }}>{saveError}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <motion.button
            onClick={save} whileTap={{ scale: 0.97 }} disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px',
              background: saved ? 'rgba(16,185,129,0.12)' : 'rgba(34,211,238,0.1)',
              border: `1px solid ${saved ? $.green : $.cyan}`,
              borderRadius: 10, color: saved ? $.green : $.cyan, fontSize: 13,
              fontWeight: 600, cursor: saving ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif',
              transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
              opacity: saving ? 0.7 : 1,
            }}
          >
            <AnimatePresence mode="wait">
              {saved
                ? <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Check size={14} />Saved
                  </motion.span>
                : <motion.span key="save" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </motion.span>
              }
            </AnimatePresence>
          </motion.button>
        </div>
      </SettingsCard>
    </div>
  )
}

// ─── Tab: Detection ───────────────────────────────────────────────────────────

function DetectionTab() {
  const [visual, setVisual] = useState(true)
  const [audio, setAudio] = useState(true)
  const [emotion, setEmotion] = useState(true)
  const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>(() => {
    const saved = localStorage.getItem('rs_detection_sensitivity')
    return (saved as 'low' | 'medium' | 'high') ?? 'high'
  })
  useEffect(() => { localStorage.setItem('rs_detection_sensitivity', sensitivity) }, [sensitivity])
  const [savingDetection, setSavingDetection] = useState(false)
  const [savedDetection, setSavedDetection] = useState(false)

  // Load detection settings from backend on mount
  useEffect(() => {
    authFetch('/api/settings')
      .then((res) => res.ok ? res.json() : null)
      .then((data: { facialAnalysis?: boolean; voicePattern?: boolean; emotionDetection?: boolean } | null) => {
        if (!data) return
        if (typeof data.facialAnalysis === 'boolean') setVisual(data.facialAnalysis)
        if (typeof data.voicePattern === 'boolean') setAudio(data.voicePattern)
        if (typeof data.emotionDetection === 'boolean') setEmotion(data.emotionDetection)
      })
      .catch(() => { /* API unavailable — use defaults */ })
  }, [])

  async function saveDetectionSettings() {
    setSavingDetection(true)
    try {
      await authFetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facialAnalysis: visual, voicePattern: audio, emotionDetection: emotion }),
      })
      setSavedDetection(true)
      setTimeout(() => setSavedDetection(false), 2200)
    } catch {
      // Best-effort
    } finally {
      setSavingDetection(false)
    }
  }

  const SENS_OPTIONS = [
    { value: 'low', label: 'Low', color: $.blue },
    { value: 'medium', label: 'Medium', color: $.amber },
    { value: 'high', label: 'High', color: $.red },
  ] as const

  const SENS_HINTS: Record<string, string> = {
    low: 'Only flags high-confidence anomalies. Fewer false positives, may miss subtle manipulations.',
    medium: 'Balanced threshold. Recommended for most sessions with mixed participants.',
    high: 'Flags all suspicious signals. Maximum security — expect an increase in false positives.',
  }

  const MODELS = [
    { key: 'Visual', val: 'CLIP ViT-L/14 + Frequency + Boundary' },
    { key: 'Audio', val: 'WavLM-base (Fine-tuned)' },
    { key: 'Emotion', val: 'EfficientNet-B2 + MediaPipe' },
    { key: 'Text', val: 'DeBERTa-v3 Zero-Shot NLI' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SettingsCard delay={0.05}>
        <SectionHeader title="Detection Modules" subtitle="Enable or disable individual detection systems" />
        <div>
          <ToggleRow label="Visual Deepfake Detection" description="Analyzes video stream for facial manipulation and neural synthesis artifacts" on={visual} onChange={setVisual} delay={0.1} />
          <ToggleRow label="Audio Manipulation Detection" description="Identifies voice cloning, audio splicing, and codec-level deepfake signals" on={audio} onChange={setAudio} delay={0.15} />
          <ToggleRow label="Emotion Analysis" description="Tracks micro-expression inconsistencies and behavioral pattern anomalies" on={emotion} onChange={setEmotion} delay={0.2} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: `1px solid ${$.b1}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: $.t3, fontWeight: 500 }}>Identity Verification</div>
              <div style={{ fontSize: 11, color: $.t4, marginTop: 2, lineHeight: 1.5 }}>Continuous biometric cross-referencing against registered participant profiles</div>
            </div>
            <span style={{ fontSize: 10, color: $.amber, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>Coming Soon</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <motion.button
            onClick={saveDetectionSettings} whileTap={{ scale: 0.97 }} disabled={savingDetection}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px',
              background: savedDetection ? 'rgba(16,185,129,0.12)' : 'rgba(34,211,238,0.1)',
              border: `1px solid ${savedDetection ? $.green : $.cyan}`,
              borderRadius: 10, color: savedDetection ? $.green : $.cyan, fontSize: 13,
              fontWeight: 600, cursor: savingDetection ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif',
              transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
              opacity: savingDetection ? 0.7 : 1,
            }}
          >
            <AnimatePresence mode="wait">
              {savedDetection
                ? <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Check size={14} />Saved
                  </motion.span>
                : <motion.span key="save" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                    {savingDetection ? 'Saving...' : 'Save Changes'}
                  </motion.span>
              }
            </AnimatePresence>
          </motion.button>
        </div>
      </SettingsCard>

      <SettingsCard delay={0.15}>
        <SectionHeader title="Detection Sensitivity" subtitle="Adjust the confidence threshold for flagging anomalies" />
        <div style={{ display: 'flex', gap: 8 }}>
          {SENS_OPTIONS.map((opt) => {
            const selected = sensitivity === opt.value
            return (
              <button
                key={opt.value} onClick={() => setSensitivity(opt.value)}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 10,
                  border: `1px solid ${selected ? opt.color : $.b1}`,
                  background: selected ? `${opt.color}14` : $.bg2,
                  color: selected ? opt.color : $.t3, fontSize: 12,
                  fontWeight: selected ? 600 : 400, cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={sensitivity}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={{ fontSize: 11, color: $.t3, margin: '10px 0 0', lineHeight: 1.6 }}
          >
            {SENS_HINTS[sensitivity]}
          </motion.p>
        </AnimatePresence>
      </SettingsCard>

      <SettingsCard delay={0.25}>
        <SectionHeader title="Active Models" subtitle="Inference engine configuration — read only" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MODELS.map((m, i) => (
            <motion.div
              key={m.key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.28 + i * 0.05, ease: EASE }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: $.bg2, borderRadius: 9, border: `1px solid ${$.b1}`,
              }}
            >
              <span style={{ fontSize: 11, color: $.t3, fontWeight: 500 }}>{m.key}</span>
              <span style={{ fontSize: 11, color: $.t2, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.02em' }}>{m.val}</span>
            </motion.div>
          ))}
        </div>
      </SettingsCard>
    </div>
  )
}

// ─── Tab: Notifications ───────────────────────────────────────────────────────

function NotificationsTab() {
  const [desktop, setDesktop] = useState(() => {
    const saved = localStorage.getItem('rs_notif_desktop')
    return saved !== null ? saved === 'true' : true
  })
  const [sound, setSound] = useState(() => {
    const saved = localStorage.getItem('rs_notif_sound')
    return saved !== null ? saved === 'true' : true
  })
  const [email, setEmail] = useState(() => {
    const saved = localStorage.getItem('rs_notif_email')
    return saved !== null ? saved === 'true' : false
  })
  const [levels, setLevels] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('rs_notif_levels')
      return saved ? JSON.parse(saved) : { critical: true, high: true, medium: false, low: false }
    } catch {
      return { critical: true, high: true, medium: false, low: false }
    }
  })

  useEffect(() => {
    localStorage.setItem('rs_notif_desktop', String(desktop))
    localStorage.setItem('rs_notif_sound', String(sound))
    localStorage.setItem('rs_notif_email', String(email))
    localStorage.setItem('rs_notif_levels', JSON.stringify(levels))
  }, [desktop, sound, email, levels])

  const LEVEL_OPTS = [
    { key: 'critical', label: 'Critical', color: $.red, bg: 'rgba(239,68,68,0.08)' },
    { key: 'high', label: 'High', color: $.orange, bg: 'rgba(249,115,22,0.08)' },
    { key: 'medium', label: 'Medium', color: $.amber, bg: 'rgba(245,158,11,0.06)' },
    { key: 'low', label: 'Low', color: $.blue, bg: 'rgba(59,130,246,0.08)' },
  ] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SettingsCard delay={0.05}>
        <SectionHeader title="Alert Channels" subtitle="Choose how you receive real-time detection alerts" />
        <div>
          <ToggleRow label="Desktop Notifications" description="Push alerts directly to your OS notification center" on={desktop} onChange={setDesktop} delay={0.1} />
          <ToggleRow label="Sound Alerts" description="Play an audio cue when a new alert is triggered" on={sound} onChange={setSound} delay={0.15} />
          <ToggleRow label="Email Reports" description="Receive a post-session summary report to your inbox" on={email} onChange={setEmail} delay={0.2} />
        </div>
      </SettingsCard>

      <SettingsCard delay={0.15}>
        <SectionHeader title="Severity Filter" subtitle="Only receive notifications for the selected severity levels" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {LEVEL_OPTS.map(({ key, label, color, bg }, i) => {
            const on = levels[key]
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, delay: 0.18 + i * 0.06, ease: EASE }}
                onClick={() => setLevels((prev) => ({ ...prev, [key]: !prev[key] }))}
                role="checkbox" aria-checked={on} tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLevels((prev) => ({ ...prev, [key]: !prev[key] })) } }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  borderRadius: 10, border: `1px solid ${on ? color + '38' : $.b1}`,
                  background: on ? bg : $.bg2, cursor: 'pointer',
                  transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)', userSelect: 'none', outline: 'none',
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: 4,
                  border: `1.5px solid ${on ? color : $.t4}`,
                  background: on ? color : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
                }}>
                  {on && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: 13, color: on ? $.t1 : $.t2, fontWeight: on ? 500 : 400, flex: 1, transition: 'color 200ms' }}>{label}</span>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', background: color,
                  boxShadow: on ? `0 0 7px ${color}` : 'none', transition: 'box-shadow 200ms', flexShrink: 0,
                }} />
              </motion.div>
            )
          })}
        </div>
      </SettingsCard>
    </div>
  )
}

// ─── Tab: Security ────────────────────────────────────────────────────────────

function SecurityTab() {
  const PROTOTYPE_MODE = import.meta.env.VITE_PROTOTYPE_MODE === '1'
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [updated, setUpdated] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  async function updatePassword() {
    if (!newPw || !confirm) { setError('All fields are required.'); return }
    if (newPw !== confirm) { setError('New passwords do not match.'); return }
    if (newPw.length < 8) { setError('Password must be at least 8 characters.'); return }
    setError('')

    if (PROTOTYPE_MODE) {
      setUpdated(true)
      setCurrent(''); setNewPw(''); setConfirm('')
      setTimeout(() => setUpdated(false), 2200)
      return
    }

    setUpdating(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPw })
    setUpdating(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setUpdated(true)
    setCurrent(''); setNewPw(''); setConfirm('')
    setTimeout(() => setUpdated(false), 2200)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SettingsCard delay={0.05}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: $.t1, margin: '0 0 4px' }}>Two-Factor Authentication</h3>
            <p style={{ fontSize: 11, color: $.t3, margin: 0, lineHeight: 1.6, maxWidth: 340 }}>
              Add an extra layer of security to your account with an authenticator app.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: $.amber, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Coming Soon</span>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard delay={0.12}>
        <SectionHeader title="Change Password" subtitle="Use a strong, unique password you don't reuse on other services" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PasswordInput label="New Password" value={newPw} onChange={setNewPw} placeholder="Minimum 8 characters" />
          <PasswordInput label="Confirm New Password" value={confirm} onChange={setConfirm} placeholder="Repeat new password" />

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                style={{ fontSize: 11, color: $.red, margin: 0 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <motion.button
              onClick={updatePassword} whileTap={{ scale: 0.97 }} disabled={updating}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px',
                background: updated ? 'rgba(16,185,129,0.12)' : $.bg2,
                border: `1px solid ${updated ? $.green : $.b2}`,
                borderRadius: 10, color: updated ? $.green : $.t2, fontSize: 13,
                fontWeight: 500, cursor: updating ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif',
                transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)', opacity: updating ? 0.7 : 1,
              }}
            >
              <AnimatePresence mode="wait">
                {updated
                  ? <motion.span key="updated" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Check size={14} />Password Updated
                    </motion.span>
                  : <motion.span key="update" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      {updating ? 'Updating...' : 'Update Password'}
                    </motion.span>
                }
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard delay={0.2}>
        <SectionHeader title="Active Sessions" subtitle="Devices currently signed into your account" />
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.26, ease: EASE }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '12px 14px', background: $.bg2, border: `1px solid ${$.b1}`, borderRadius: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.14)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Monitor size={16} color={$.cyan} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: $.t1, fontWeight: 500 }}>This Device</div>
              <div style={{ fontSize: 10, color: $.t3, marginTop: 2, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.01em' }}>Active now</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)', flexShrink: 0 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: $.green, boxShadow: `0 0 5px ${$.green}` }} />
            <span style={{ fontSize: 10, color: $.green, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Current</span>
          </div>
        </motion.div>
      </SettingsCard>
    </div>
  )
}

// ─── Settings (main) ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'general', label: 'General', Icon: User, description: 'Profile & account' },
  { id: 'detection', label: 'Detection', Icon: Shield, description: 'AI model preferences' },
  { id: 'notifications', label: 'Notifications', Icon: Bell, description: 'Alerts & reports' },
  { id: 'security', label: 'Security', Icon: Lock, description: '2FA & password' },
] as const

type TabId = typeof TABS[number]['id']

function TabContent({ tab }: { tab: TabId }) {
  switch (tab) {
    case 'general': return <GeneralTab />
    case 'detection': return <DetectionTab />
    case 'notifications': return <NotificationsTab />
    case 'security': return <SecurityTab />
    default: return null
  }
}

export default function Settings() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<TabId>('general')

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Tab pills */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          style={{ display: 'flex', gap: 6, overflowX: 'auto', borderBottom: `1px solid ${$.b1}`, paddingBottom: 10 }}
        >
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id} onClick={() => setTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                  borderRadius: 8, flexShrink: 0,
                  border: `1px solid ${active ? 'rgba(34,211,238,0.30)' : $.b1}`,
                  background: active ? 'rgba(34,211,238,0.08)' : $.bg1,
                  color: active ? $.cyan : $.t3, cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: active ? 600 : 400,
                  transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)', whiteSpace: 'nowrap',
                }}
              >
                <t.Icon size={13} strokeWidth={active ? 2.2 : 1.8} />
                {t.label}
              </button>
            )
          })}
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <TabContent tab={tab} />
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 14, height: '100%', minHeight: 0 }}>
      {/* Left nav */}
      <motion.div
        initial={{ opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        style={{ width: 200, minWidth: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 2 }}
      >
        <div style={{ fontSize: 9, color: $.t4, textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 600, marginBottom: 8, paddingLeft: 12 }}>
          Preferences
        </div>
        {TABS.map((t, i) => {
          const active = tab === t.id
          return (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.05 + i * 0.05, ease: EASE }}
              onClick={() => setTab(t.id)}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = $.t2; e.currentTarget.style.transform = 'translateY(-1px)' } }}
              onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = $.t3; e.currentTarget.style.transform = 'translateY(0)' } }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                borderRadius: 10, border: `1px solid ${active ? 'rgba(34,211,238,0.18)' : 'transparent'}`,
                background: active ? 'rgba(34,211,238,0.07)' : 'transparent',
                color: active ? $.cyan : $.t3, cursor: 'pointer', textAlign: 'left',
                fontFamily: 'Inter, sans-serif', transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
                position: 'relative', width: '100%',
              }}
            >
              {active && (
                <motion.div
                  layoutId="settings-tab-indicator"
                  style={{ position: 'absolute', left: -1, top: 7, bottom: 7, width: 3, borderRadius: '0 2px 2px 0', background: $.cyan }}
                  transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                />
              )}
              <t.Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: active ? 600 : 400 }}>{t.label}</div>
                <div style={{ fontSize: 10, color: active ? 'rgba(34,211,238,0.55)' : $.t4, marginTop: 1, transition: 'color 200ms' }}>{t.description}</div>
              </div>
            </motion.button>
          )
        })}
      </motion.div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', paddingRight: 2 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <TabContent tab={tab} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
