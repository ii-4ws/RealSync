import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Shield } from 'lucide-react'
import $ from '../lib/tokens'
import { EASE } from '../lib/tokens'
import { supabase } from '../lib/supabaseClient'
import { isBlockedDomain } from '../lib/blockedDomains'
import { useIsMobile } from '../hooks/useIsMobile'

const PROTOTYPE_MODE = import.meta.env.VITE_PROTOTYPE_MODE === '1'

// ─── SVG logos ────────────────────────────────────────────────────────────────
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

// ─── Animated background orb ──────────────────────────────────────────────────
function Orb({
  size, color, xStart, yStart, xEnd, yEnd, duration,
}: {
  size: number
  color: string
  xStart: string
  yStart: string
  xEnd: string
  yEnd: string
  duration: number
}) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        filter: `blur(${size * 0.4}px)`,
        pointerEvents: 'none',
        left: xStart,
        top: yStart,
      }}
      animate={{ left: [xStart, xEnd, xStart], top: [yStart, yEnd, yStart] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

// ─── Scan line ────────────────────────────────────────────────────────────────
function ScanLine({ cardRef }: { cardRef: React.RefObject<HTMLDivElement | null> }) {
  const [cardHeight, setCardHeight] = useState(600)

  React.useEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight)
  }, [cardRef])

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        background: 'rgba(255,255,255,0.05)',
        pointerEvents: 'none',
        zIndex: 10,
      }}
      animate={{ y: [0, cardHeight] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'linear', delay: 0.7 }}
    />
  )
}

export default function Login() {
  const navigate = useNavigate()
  const isMobile = useIsMobile(767)
  const cardRef = useRef<HTMLDivElement>(null)

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
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color 180ms, box-shadow 180ms',
    fontFamily: 'Inter, sans-serif',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#08080c',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      padding: isMobile ? '24px 16px' : '48px 24px',
    }}>
      {/* ── Animated orbs ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0 }}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <Orb size={500} color="rgba(34,211,238,0.12)" xStart="55%" yStart="-10%" xEnd="60%" yEnd="-5%" duration={10} />
        <Orb size={600} color="rgba(139,92,246,0.10)" xStart="-15%" yStart="60%" xEnd="-10%" yEnd="65%" duration={12} />
      </motion.div>

      {/* ── Grid overlay (desktop only) ── */}
      {!isMobile && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }} />
      )}

      {/* ── Logo ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
        style={{ position: 'relative', zIndex: 1, marginBottom: 16, textAlign: 'center' }}
      >
        <motion.img
          src={`${import.meta.env.BASE_URL}realsync-logo-white.png`}
          alt="RealSync"
          style={{ height: isMobile ? 60 : 80, width: 'auto' }}
          animate={{ scale: [1, 1.02, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      {/* ── Tagline ── */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35, ease: EASE }}
        style={{
          position: 'relative', zIndex: 1,
          fontSize: 14, color: 'rgba(255,255,255,0.45)',
          marginBottom: 32, letterSpacing: '0.01em',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        AI-Powered Meeting Security
      </motion.p>

      {/* ── Glass card ── */}
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.5, ease: EASE }}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px) saturate(120%)',
          WebkitBackdropFilter: 'blur(20px) saturate(120%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: isMobile ? 24 : 40,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) inset',
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        {/* Scan line */}
        <ScanLine cardRef={cardRef} />

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Welcome copy */}
          <div style={{ marginBottom: 4 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', margin: '0 0 6px' }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
              Sign in with your corporate email
            </p>
          </div>

          {/* Email field */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
              Email
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="you@company.com"
                style={{ ...inputBase, padding: '12px 14px 12px 40px' }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,211,238,0.1)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
          </div>

          {/* Password field */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>
                Password
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                style={{
                  background: 'none', border: 'none', color: '#22D3EE',
                  fontSize: 12, cursor: 'pointer', padding: 0,
                  fontWeight: 500, transition: 'opacity 150ms',
                  fontFamily: 'Inter, sans-serif',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                Forgot password?
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={15} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder="Enter password"
                style={{ ...inputBase, padding: '12px 44px 12px 40px' }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,211,238,0.1)'
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
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.3)',
                  padding: 4, display: 'flex', transition: 'color 150ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

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
                <span style={{ fontSize: 12, color: $.red, lineHeight: 1.4, fontFamily: 'Inter, sans-serif' }}>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

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
                : 'linear-gradient(135deg, #22D3EE, #3B82F6)',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: loading ? 'none' : '0 0 24px rgba(34,211,238,0.25)',
              transition: 'background 200ms, box-shadow 200ms',
              letterSpacing: '0.01em',
              fontFamily: 'Inter, sans-serif',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.boxShadow = '0 0 36px rgba(34,211,238,0.4)'
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.boxShadow = '0 0 24px rgba(34,211,238,0.25)'
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
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.04em', fontFamily: 'Inter, sans-serif' }}>or</span>
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
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                  fontFamily: 'Inter, sans-serif',
                  transition: 'border-color 150ms, background 150ms, color 150ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
                  e.currentTarget.style.color = '#ffffff'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                }}
              >
                {logo}
                {label}
              </button>
            ))}
          </div>
        </form>

        {/* Sign up link */}
        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif' }}>
          Don't have an account?{' '}
          <button
            onClick={() => navigate('/signup')}
            style={{
              background: 'none', border: 'none', color: '#22D3EE',
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
        <div style={{
          marginTop: 18, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.14)',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <Shield size={13} color={$.blue} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, fontFamily: 'Inter, sans-serif' }}>
            Corporate or institutional email required. Personal providers (Gmail, Yahoo) are not accepted.
          </span>
        </div>
      </motion.div>
    </div>
  )
}
