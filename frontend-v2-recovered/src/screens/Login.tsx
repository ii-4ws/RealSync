import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Shield, Mic, Brain, ShieldCheck } from 'lucide-react'
import $ from '../lib/tokens'
import { EASE } from '../lib/tokens'
import { supabase } from '../lib/supabaseClient'
import { isBlockedDomain } from '../lib/blockedDomains'

// Animated gradient mesh background
const GradientMesh = () => (
  <div style={{
    position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
  }}>
    {/* Base gradient */}
    <div style={{
      position: 'absolute', inset: '-50%', width: '200%', height: '200%',
      background: `
        radial-gradient(at 27% 37%, rgba(34,211,238,0.12) 0px, transparent 50%),
        radial-gradient(at 97% 21%, rgba(139,92,246,0.10) 0px, transparent 50%),
        radial-gradient(at 52% 99%, rgba(59,130,246,0.08) 0px, transparent 50%),
        radial-gradient(at 10% 29%, rgba(34,211,238,0.06) 0px, transparent 50%),
        radial-gradient(at 97% 96%, rgba(139,92,246,0.08) 0px, transparent 50%),
        radial-gradient(at 33% 50%, rgba(59,130,246,0.06) 0px, transparent 50%),
        radial-gradient(at 79% 53%, rgba(34,211,238,0.04) 0px, transparent 50%)
      `,
      animation: 'meshMove 20s ease-in-out infinite alternate',
    }} />
    {/* Grid overlay */}
    <div style={{
      position: 'absolute', inset: 0,
      backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
      backgroundSize: '64px 64px',
    }} />
    {/* Noise texture */}
    <div style={{
      position: 'absolute', inset: 0, opacity: 0.03,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
    }} />
  </div>
)

const PROTOTYPE_MODE = import.meta.env.VITE_PROTOTYPE_MODE === '1'

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Deepfake Detection',
    desc: 'AI-powered visual manipulation analysis in real-time',
    color: $.cyan,
  },
  {
    icon: Brain,
    title: 'Emotion Analysis',
    desc: 'Track facial expressions and behavioral patterns',
    color: $.blue,
  },
  {
    icon: Mic,
    title: 'Audio Forensics',
    desc: 'Voice synthesis and manipulation detection',
    color: $.violet,
  },
]

// Real SVG logos for OAuth providers
const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
)

const MicrosoftLogo = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" style={{ flexShrink: 0 }}>
    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
)

// Floating particle animation
function FloatingParticle({ x, y, delay, size }: { x: string; y: string; delay: number; size: number }) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: '50%',
        background: `rgba(34,211,238,${0.15 + Math.random() * 0.15})`,
        pointerEvents: 'none',
      }}
      animate={{
        y: [0, -18, 0],
        opacity: [0.4, 0.9, 0.4],
      }}
      transition={{
        duration: 3 + Math.random() * 2,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  )
}

const PARTICLES = [
  { x: '8%', y: '15%', delay: 0, size: 4 },
  { x: '18%', y: '65%', delay: 0.7, size: 3 },
  { x: '28%', y: '40%', delay: 1.4, size: 5 },
  { x: '72%', y: '20%', delay: 0.3, size: 3 },
  { x: '85%', y: '55%', delay: 1.1, size: 4 },
  { x: '60%', y: '78%', delay: 0.5, size: 3 },
]

export default function Login() {
  const navigate = useNavigate()
  const isMobile = window.innerWidth <= 768
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Email is required.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

    if (PROTOTYPE_MODE) {
      setLoading(true)
      setTimeout(() => { setLoading(false); navigate('/') }, 600)
      return
    }

    setLoading(true)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError) {
        const msg = authError.message.toLowerCase()
        if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
          setError('Incorrect email or password.')
        } else if (msg.includes('email not confirmed')) {
          setError('Please confirm your email before signing in.')
        } else if (msg.includes('invalid email')) {
          setError('Invalid email address.')
        } else {
          setError(authError.message)
        }
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData.session?.user?.email && isBlockedDomain(sessionData.session.user.email)) {
        await supabase.auth.signOut()
        setError('Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Please use a corporate email.')
        return
      }

      navigate('/')
    } catch {
      setError('Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError('')
    if (PROTOTYPE_MODE) { navigate('/'); return }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (oauthError) setError(oauthError.message)
  }

  async function handleMicrosoftLogin() {
    setError('')
    if (PROTOTYPE_MODE) { navigate('/'); return }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { redirectTo: window.location.origin, scopes: 'email profile openid' },
    })
    if (oauthError) setError(oauthError.message)
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError('Enter your email first to reset password.'); return }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    if (resetError) {
      setError(resetError.message)
    } else {
      setError('')
      alert('Password reset email sent! Check your inbox.')
    }
  }

  const inputBase: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    color: $.t1,
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 180ms, box-shadow 180ms',
    fontFamily: 'Inter, sans-serif',
  }

  const formPanel = (
    <motion.div
      initial={{ opacity: 0, x: isMobile ? 0 : 32, y: isMobile ? 20 : 0 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.55, delay: 0.2, ease: EASE }}
      style={{
        width: '100%',
        maxWidth: isMobile ? '100%' : 400,
        background: 'rgba(15,15,22,0.85)',
        backdropFilter: 'blur(32px) saturate(150%)',
        WebkitBackdropFilter: 'blur(32px) saturate(150%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24,
        padding: isMobile ? 24 : 36,
        position: 'relative',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
      }}
    >
      {/* Top shimmer accent */}
      <div style={{
        position: 'absolute', top: 0, left: 32, right: 32, height: 1,
        background: `linear-gradient(90deg, transparent, ${$.cyan}60, ${$.blue}60, transparent)`,
        borderRadius: '0 0 4px 4px',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3, ease: EASE }}
      >
        <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: $.t1, marginBottom: 6, letterSpacing: '-0.02em' }}>
          Welcome back
        </h2>
        <p style={{ fontSize: 13, color: $.t3, marginBottom: isMobile ? 24 : 32, lineHeight: 1.5 }}>
          Sign in with your corporate email
        </p>
      </motion.div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Email */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.35, ease: EASE }}
        >
          <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontWeight: 600 }}>
            Email
          </label>
          <div style={{ position: 'relative' }}>
            <Mail size={15} color={$.t4} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              placeholder="you@company.com"
              style={{ ...inputBase, padding: '12px 14px 12px 40px' }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = `${$.cyan}80`
                e.currentTarget.style.boxShadow = `0 0 0 3px ${$.cyan}15`
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
        </motion.div>

        {/* Password */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.42, ease: EASE }}
        >
          <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontWeight: 600 }}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <Lock size={15} color={$.t4} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter password"
              style={{ ...inputBase, padding: '12px 44px 12px 40px' }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = `${$.cyan}80`
                e.currentTarget.style.boxShadow = `0 0 0 3px ${$.cyan}15`
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: $.t4,
                padding: 4, display: 'flex', transition: 'color 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = $.t2 }}
              onMouseLeave={(e) => { e.currentTarget.style.color = $.t4 }}
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: $.red, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: $.red, lineHeight: 1.4 }}>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Forgot password */}
        <div style={{ marginTop: -8, textAlign: 'right' }}>
          <button
            type="button"
            onClick={handleForgotPassword}
            style={{
              background: 'none', border: 'none', color: $.cyan,
              fontSize: 12, cursor: 'pointer', padding: 0,
              fontWeight: 500, transition: 'opacity 150ms',
              fontFamily: 'Inter, sans-serif',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            Forgot password?
          </button>
        </div>

        {/* Submit */}
        <motion.button
          type="submit"
          disabled={loading}
          whileHover={{ scale: loading ? 1 : 1.015 }}
          whileTap={{ scale: loading ? 1 : 0.985 }}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 12,
            background: loading
              ? 'rgba(34,211,238,0.3)'
              : `linear-gradient(135deg, ${$.cyan}, ${$.blue})`,
            border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: loading
              ? 'none'
              : `0 0 24px ${$.cyan}30, 0 4px 16px rgba(0,0,0,0.4)`,
            transition: 'background 200ms, box-shadow 200ms',
            letterSpacing: '0.01em',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {loading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
              style={{
                width: 18, height: 18,
                border: '2.5px solid rgba(255,255,255,0.25)',
                borderTopColor: '#fff', borderRadius: '50%',
              }}
            />
          ) : (
            <>Sign in securely <ArrowRight size={15} /></>
          )}
        </motion.button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          <span style={{ fontSize: 11, color: $.t4, fontWeight: 500, letterSpacing: '0.04em' }}>Or continue with</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        </div>

        {/* OAuth buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Google', logo: <GoogleLogo />, onClick: handleGoogleLogin },
            { label: 'Microsoft', logo: <MicrosoftLogo />, onClick: handleMicrosoftLogin },
          ].map(({ label, logo, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              style={{
                padding: '11px 0', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                color: $.t2, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
                fontFamily: 'Inter, sans-serif',
                transition: 'border-color 150ms, background 150ms, color 150ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.color = $.t1
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                e.currentTarget.style.color = $.t2
              }}
            >
              {logo}
              {label}
            </button>
          ))}
        </div>
      </form>

      {/* Sign up link */}
      <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: $.t3 }}>
        Don't have an account?{' '}
        <button
          onClick={() => navigate('/signup')}
          style={{
            background: 'none', border: 'none', color: $.cyan,
            cursor: 'pointer', fontWeight: 600, fontSize: 13,
            padding: 0, fontFamily: 'Inter, sans-serif',
            transition: 'opacity 150ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
        >
          Sign up
        </button>
      </p>

      {/* Corporate email notice */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        style={{
          marginTop: 18, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.14)',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}
      >
        <Shield size={13} color={$.blue} style={{ marginTop: 1, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: $.t3, lineHeight: 1.5 }}>
          Corporate or institutional email required. Personal providers (Gmail, Yahoo) are not accepted.
        </span>
      </motion.div>
    </motion.div>
  )

  if (isMobile) {
    return (
      <div style={{
        minHeight: '100vh', background: $.bg0,
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Animated gradient mesh background */}
        <GradientMesh />

        {/* Mobile header */}
        <div style={{ padding: '36px 20px 16px', position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ marginBottom: 24 }}
          >
            <img src="/realsync-logo.png" alt="RealSync" style={{ height: 32, width: 'auto' }} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
          >
            <h1 style={{ fontSize: 28, fontWeight: 700, color: $.t1, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 10 }}>
              See what's{' '}
              <span style={{ background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                real.
              </span>
            </h1>
            <p style={{ fontSize: 13, color: $.t2, lineHeight: 1.5 }}>AI-powered deepfake detection for video meetings.</p>
          </motion.div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
            {FEATURES.slice(0, 2).map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.18 + i * 0.08, ease: EASE }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 12,
                  background: `linear-gradient(135deg, ${f.color}0a, transparent)`,
                  border: `1px solid ${f.color}18`,
                }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: `${f.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <f.icon size={15} color={f.color} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: $.t1, marginBottom: 1 }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: $.t3, lineHeight: 1.3 }}>{f.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, padding: '0 16px 36px', position: 'relative', zIndex: 1 }}>
          {formPanel}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: $.bg0, display: 'flex', position: 'relative', overflow: 'hidden' }}>
      {/* Animated gradient mesh background */}
      <GradientMesh />

      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <FloatingParticle key={i} {...p} />
      ))}

      {/* Left panel — brand */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '56px 48px', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          style={{ marginBottom: 52 }}
        >
          <img src="/realsync-logo.png" alt="RealSync" style={{ height: 64, width: 'auto' }} />
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
          style={{ marginBottom: 44 }}
        >
          <h1 style={{
            fontSize: 46, fontWeight: 700, color: $.t1,
            letterSpacing: '-0.04em', lineHeight: 1.1,
            marginBottom: 18,
          }}>
            See what's{' '}
            <span style={{
              background: `linear-gradient(135deg, ${$.cyan} 0%, ${$.blue} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              real.
            </span>
          </h1>
          <p style={{ fontSize: 16, color: $.t2, lineHeight: 1.65, maxWidth: 440 }}>
            AI-powered deepfake detection and emotion analysis for video meetings. Protect your organization from identity fraud in real time.
          </p>
        </motion.div>

        {/* Feature cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460 }}>
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.22 + i * 0.1, ease: EASE }}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 18px', borderRadius: 14,
                background: `linear-gradient(135deg, ${f.color}0a, rgba(255,255,255,0.01))`,
                border: `1px solid ${f.color}1a`,
                backdropFilter: 'blur(8px)',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 11, flexShrink: 0,
                background: `${f.color}14`,
                border: `1px solid ${f.color}25`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <f.icon size={19} color={f.color} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: $.t1, marginBottom: 3, letterSpacing: '-0.01em' }}>{f.title}</div>
                <div style={{ fontSize: 12, color: $.t3, lineHeight: 1.45 }}>{f.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom trust line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.7 }}
          style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: $.green }} />
          <span style={{ fontSize: 12, color: $.t4, letterSpacing: '0.02em' }}>
            Trusted by security teams across the region
          </span>
        </motion.div>
      </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        width: 500, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '48px 48px',
        position: 'relative', zIndex: 1,
        borderLeft: '1px solid rgba(255,255,255,0.04)',
      }}>
        {formPanel}
      </div>
    </div>
  )
}
