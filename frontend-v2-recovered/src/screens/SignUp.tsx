import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Shield, AlertTriangle,
  CheckCircle2, MailCheck, LogIn, RefreshCw, Users,
} from 'lucide-react'
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

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: $.t4 }
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 8) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score: 1, label: 'Weak', color: $.red }
  if (score === 2) return { score: 2, label: 'Fair', color: $.orange }
  if (score === 3) return { score: 3, label: 'Good', color: $.amber }
  return { score: 4, label: 'Strong', color: $.green }
}

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

const SOCIAL_PROOF = [
  { label: '500+', desc: 'Organizations protected' },
  { label: '99.4%', desc: 'Detection accuracy' },
  { label: '< 200ms', desc: 'Real-time analysis' },
]

export default function SignUp() {
  const navigate = useNavigate()
  const isMobile = window.innerWidth <= 768
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupComplete, setSignupComplete] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resending, setResending] = useState(false)
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current)
    }
  }, [])

  const strength = getPasswordStrength(password)

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password || !confirmPassword) {
      setError('All fields are required.')
      return
    }

    if (isBlockedDomain(email.trim())) {
      setError('Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Please use your corporate or institutional email.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    })
    setLoading(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    setRegisteredEmail(email.trim())
    setSignupComplete(true)
  }

  async function handleResendEmail() {
    if (resendCooldown > 0 || resending) return
    setResending(true)
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: registeredEmail })
    setResending(false)
    if (resendError) {
      setError(resendError.message)
      return
    }
    setResendCooldown(60)
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current)
    resendIntervalRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendIntervalRef.current) clearInterval(resendIntervalRef.current)
          resendIntervalRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
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

  // Email confirmation success screen
  const successScreen = (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center', padding: '12px 0' }}
    >
      {/* Icon */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 32px ${$.cyan}30`,
        }}>
          <MailCheck size={34} color="#fff" strokeWidth={1.8} />
        </div>
        <div style={{
          position: 'absolute', bottom: -10, left: -10,
          width: 30, height: 30, borderRadius: '50%',
          background: $.green, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 0 3px ${$.bg0}`,
        }}>
          <CheckCircle2 size={17} color="#fff" strokeWidth={2.5} />
        </div>
      </div>

      <h2 style={{ fontSize: 24, fontWeight: 700, color: $.t1, letterSpacing: '-0.02em', margin: 0 }}>
        Account Created!
      </h2>

      <div style={{
        padding: '10px 16px', borderRadius: 10,
        background: 'rgba(16,185,129,0.08)',
        border: '1px solid rgba(16,185,129,0.22)',
        fontSize: 13, color: $.green, lineHeight: 1.5,
      }}>
        Check your inbox for a confirmation email, then sign in.
      </div>

      <p style={{ fontSize: 13, color: $.t3, lineHeight: 1.65, margin: 0, maxWidth: 280 }}>
        We sent a verification link to your corporate email. Please verify to unlock real-time deepfake protection.
      </p>

      <motion.button
        onClick={() => navigate('/login')}
        whileHover={{ scale: 1.015 }}
        whileTap={{ scale: 0.985 }}
        style={{
          width: '100%', padding: '13px 0', borderRadius: 12,
          background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`,
          border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: `0 0 24px ${$.cyan}30, 0 4px 16px rgba(0,0,0,0.4)`,
          fontFamily: 'Inter, sans-serif', letterSpacing: '0.01em',
        }}
      >
        <LogIn size={15} /> Back to Sign In
      </motion.button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
        <p style={{ fontSize: 12, color: $.t4, margin: 0 }}>Didn't receive the email?</p>
        <button
          onClick={handleResendEmail}
          disabled={resendCooldown > 0 || resending}
          style={{
            background: 'none', border: 'none', padding: 0,
            cursor: resendCooldown > 0 || resending ? 'not-allowed' : 'pointer',
            color: resendCooldown > 0 || resending ? $.t4 : $.cyan,
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            fontFamily: 'Inter, sans-serif',
            transition: 'opacity 150ms',
          }}
        >
          {resending
            ? (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-flex' }}>
                  <RefreshCw size={12} />
                </motion.span>
                Sending...
              </>
            )
            : resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : 'Resend Verification Email'
          }
        </button>
      </div>
    </motion.div>
  )

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
        background: `linear-gradient(90deg, transparent, ${$.violet}60, ${$.cyan}60, transparent)`,
        borderRadius: '0 0 4px 4px',
      }} />

      {signupComplete ? successScreen : (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3, ease: EASE }}
          >
            <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: $.t1, marginBottom: 6, letterSpacing: '-0.02em' }}>
              Create an account
            </h2>
            <p style={{ fontSize: 13, color: $.t3, marginBottom: isMobile ? 24 : 30, lineHeight: 1.5 }}>
              Sign up with your corporate email
            </p>
          </motion.div>

          <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Email */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.35, ease: EASE }}
            >
              <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontWeight: 600 }}>
                Corporate Email
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
                    e.currentTarget.style.borderColor = `${$.violet}80`
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${$.violet}15`
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
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="Min. 6 characters"
                  style={{ ...inputBase, padding: '12px 44px 12px 40px' }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = `${$.violet}80`
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${$.violet}15`
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: $.t4,
                    padding: 4, display: 'flex', transition: 'color 150ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = $.t2 }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = $.t4 }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {/* Password strength meter */}
              {password && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ marginTop: 8 }}
                >
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 5 }}>
                    <motion.div
                      animate={{ width: `${(strength.score / 4) * 100}%` }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      style={{ height: '100%', background: strength.color, borderRadius: 4 }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: strength.color, fontWeight: 500 }}>{strength.label}</span>
                </motion.div>
              )}
            </motion.div>

            {/* Confirm password */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.49, ease: EASE }}
            >
              <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, fontWeight: 600 }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} color={$.t4} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
                  placeholder="Re-enter password"
                  style={{ ...inputBase, padding: '12px 44px 12px 40px' }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = `${$.violet}80`
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${$.violet}15`
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: $.t4,
                    padding: 4, display: 'flex', transition: 'color 150ms',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = $.t2 }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = $.t4 }}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
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
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: $.red, flexShrink: 0, marginTop: 4 }} />
                  <span style={{ fontSize: 12, color: $.red, lineHeight: 1.45 }}>{error}</span>
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
                  ? 'rgba(139,92,246,0.3)'
                  : `linear-gradient(135deg, ${$.violet}, ${$.cyan})`,
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading
                  ? 'none'
                  : `0 0 24px ${$.violet}25, 0 4px 16px rgba(0,0,0,0.4)`,
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
                <>Create Account <ArrowRight size={15} /></>
              )}
            </motion.button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: 11, color: $.t4, fontWeight: 500, letterSpacing: '0.04em' }}>Or sign up with</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            </div>

            {/* OAuth buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Google', logo: <GoogleLogo /> },
                { label: 'Microsoft', logo: <MicrosoftLogo /> },
              ].map(({ label, logo }) => (
                <button
                  key={label}
                  type="button"
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

          {/* Domain restriction notice */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.65 }}
            style={{
              marginTop: 18, padding: '10px 14px', borderRadius: 10,
              background: 'rgba(249,115,22,0.06)',
              border: '1px solid rgba(249,115,22,0.16)',
              display: 'flex', alignItems: 'flex-start', gap: 8,
            }}
          >
            <AlertTriangle size={13} color={$.orange} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: $.t3, lineHeight: 1.5 }}>
              Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Use your corporate or institutional email.
            </span>
          </motion.div>

          {/* Sign in link */}
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: $.t3 }}>
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login')}
              style={{
                background: 'none', border: 'none', color: $.cyan,
                cursor: 'pointer', fontWeight: 600, fontSize: 13,
                padding: 0, fontFamily: 'Inter, sans-serif',
                transition: 'opacity 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              Sign in
            </button>
          </p>
        </>
      )}

      {/* SSL badge */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: $.t4, fontSize: 11 }}>
        <Shield size={11} />
        <span>Protected by 256-bit SSL encryption</span>
      </div>
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

        <div style={{ padding: '36px 20px 16px', position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ marginBottom: 20 }}
          >
            <img src="/realsync-logo.png" alt="RealSync" style={{ height: 32, width: 'auto' }} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
          >
            <h1 style={{ fontSize: 28, fontWeight: 700, color: $.t1, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 8 }}>
              Join{' '}
              <span style={{ background: `linear-gradient(135deg, ${$.violet}, ${$.cyan})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                RealSync.
              </span>
            </h1>
            <p style={{ fontSize: 13, color: $.t2, lineHeight: 1.5 }}>Protect your meetings with AI-powered deepfake detection.</p>
          </motion.div>
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
            letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 18,
          }}>
            Join{' '}
            <span style={{
              background: `linear-gradient(135deg, ${$.violet} 0%, ${$.cyan} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              RealSync.
            </span>
          </h1>
          <p style={{ fontSize: 16, color: $.t2, lineHeight: 1.65, maxWidth: 440 }}>
            Create your account and start protecting your meetings with AI-powered deepfake detection and real-time security analytics.
          </p>
        </motion.div>

        {/* Social proof stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.22, ease: EASE }}
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
            padding: '24px', borderRadius: 18,
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.07)',
            marginBottom: 28,
          }}
        >
          {SOCIAL_PROOF.map((item, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 22, fontWeight: 700, color: $.t1,
                letterSpacing: '-0.03em', marginBottom: 4,
                background: `linear-gradient(135deg, ${$.cyan}, ${$.violet})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                {item.label}
              </div>
              <div style={{ fontSize: 11, color: $.t4, lineHeight: 1.4 }}>{item.desc}</div>
            </div>
          ))}
        </motion.div>

        {/* Corporate email requirement callout */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.35, ease: EASE }}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            padding: '16px 18px', borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(249,115,22,0.08), rgba(249,115,22,0.03))',
            border: '1px solid rgba(249,115,22,0.18)',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'rgba(249,115,22,0.12)',
            border: '1px solid rgba(249,115,22,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={17} color={$.orange} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: $.t1, marginBottom: 4 }}>Corporate Email Required</div>
            <div style={{ fontSize: 12, color: $.t3, lineHeight: 1.5 }}>
              Personal email providers (Gmail, Yahoo, Outlook, etc.) are not accepted. Please use your corporate or institutional email address.
            </div>
          </div>
        </motion.div>

        {/* Bottom trust line */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.7 }}
          style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Users size={13} color={$.t4} />
          <span style={{ fontSize: 12, color: $.t4, letterSpacing: '0.02em' }}>
            Join organizations using RealSync to secure their meetings
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
