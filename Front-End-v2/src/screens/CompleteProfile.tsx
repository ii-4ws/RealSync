import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, User, Check, Shield } from 'lucide-react'
import $ from '../lib/tokens'
import { EASE } from '../lib/tokens'
import { supabase } from '../lib/supabaseClient'
import { useSessionContext } from '../contexts/SessionContext'

export default function CompleteProfile() {
  const navigate = useNavigate()
  const { supabaseSession, setProfile } = useSessionContext()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const userId = supabaseSession?.user?.id
  const userEmail = supabaseSession?.user?.email

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB.')
      return
    }

    if (!file.type.match(/image\/(jpg|jpeg|png|gif|webp)/)) {
      setError('Please upload a JPG, PNG, GIF, or WebP image.')
      return
    }

    setError('')
    setAvatarFile(file)

    const reader = new FileReader()
    reader.onloadend = () => setAvatarPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required.')
      return
    }
    if (firstName.trim().length > 50 || lastName.trim().length > 50) {
      setError('Names must be 50 characters or less.')
      return
    }
    if (jobTitle.trim().length > 100) {
      setError('Job title must be 100 characters or less.')
      return
    }
    if (!userId) {
      setError('No authenticated user found. Please sign in again.')
      return
    }

    setLoading(true)
    setError('')

    try {
      let avatarUrl: string | null = null

      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop() || 'png'
        const filePath = `avatars/${userId}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { upsert: true })

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
          avatarUrl = urlData.publicUrl
        }
      }

      const fullName = `${firstName.trim()} ${lastName.trim()}`

      const updates: Record<string, unknown> = {
        id: userId,
        username: fullName,
        full_name: fullName,
        job_title: jobTitle.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (avatarUrl) updates.avatar_url = avatarUrl

      const { data, error: upsertError } = await supabase
        .from('profiles')
        .upsert(updates, { onConflict: 'id' })
        .select('id, username, full_name, avatar_url, job_title, created_at, updated_at')
        .single()

      if (upsertError) {
        if (upsertError.code === '23505') {
          setError('That name is already taken.')
        } else {
          setError(upsertError.message)
        }
        return
      }

      if (data) {
        setProfile(data)
        navigate('/')
      } else {
        setError('Profile update returned no data.')
      }
    } catch {
      setError('Unexpected error while updating profile.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: $.bg2, border: `1px solid ${$.b1}`,
    borderRadius: 10, padding: '10px 12px', color: $.t1,
    fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif',
    transition: 'border-color 150ms',
  }

  return (
    <div style={{ minHeight: '100vh', background: $.bg0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.07) 0%, transparent 65%)', top: -250, right: -150, filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 65%)', bottom: -200, left: -100, filter: 'blur(80px)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          width: '100%', maxWidth: 460, position: 'relative',
          background: $.bg1, border: `1px solid ${$.b1}`,
          borderRadius: 20, padding: 32,
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 24, right: 24, height: 1, background: `linear-gradient(90deg, transparent, ${$.b3}, transparent)` }} />

        <h1 style={{ fontSize: 20, fontWeight: 600, color: $.t1, marginBottom: 4 }}>Complete your profile</h1>
        <p style={{ fontSize: 13, color: $.t3, marginBottom: 24 }}>
          Set up your display name to finish onboarding{userEmail ? ` for ${userEmail}` : ''}.
        </p>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 80, height: 80, borderRadius: '50%', overflow: 'hidden',
                background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 0 24px rgba(34,211,238,0.22)',
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarPreview
                ? <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials.length > 0
                  ? <span style={{ color: '#fff', fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>{initials}</span>
                  : <User size={32} color="rgba(255,255,255,0.7)" />
              }
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'transparent', border: `1px solid ${$.b1}`,
                borderRadius: 8, padding: '5px 12px', color: $.t3, cursor: 'pointer',
                fontSize: 12, fontFamily: 'Inter, sans-serif', transition: 'all 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = $.b2; e.currentTarget.style.color = $.t2 }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = $.b1; e.currentTarget.style.color = $.t3 }}
            >
              <Upload size={12} /> Upload Photo
            </button>
            <span style={{ fontSize: 11, color: $.t4 }}>JPG, PNG, GIF or WebP. Max 2MB.</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* First Name */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>First Name</label>
            <input
              value={firstName} onChange={(e) => setFirstName(e.target.value)}
              placeholder="John" maxLength={50} required
              style={inputStyle}
              onFocus={(e) => e.currentTarget.style.borderColor = $.cyan}
              onBlur={(e) => e.currentTarget.style.borderColor = $.b1}
            />
          </div>

          {/* Last Name */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>Last Name</label>
            <input
              value={lastName} onChange={(e) => setLastName(e.target.value)}
              placeholder="Doe" maxLength={50} required
              style={inputStyle}
              onFocus={(e) => e.currentTarget.style.borderColor = $.cyan}
              onBlur={(e) => e.currentTarget.style.borderColor = $.b1}
            />
          </div>

          {/* Job Title */}
          <div>
            <label style={{ display: 'block', fontSize: 11, color: $.t3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontWeight: 500 }}>
              Job Title <span style={{ color: $.t4, fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Security Analyst" maxLength={100}
              style={inputStyle}
              onFocus={(e) => e.currentTarget.style.borderColor = $.cyan}
              onBlur={(e) => e.currentTarget.style.borderColor = $.b1}
            />
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                style={{ fontSize: 12, color: $.red, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit" disabled={loading}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 10,
              background: `linear-gradient(135deg, ${$.cyan}, ${$.blue})`,
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 0 20px rgba(34,211,238,0.2), 0 4px 12px rgba(0,0,0,0.3)',
              opacity: loading ? 0.7 : 1, transition: 'opacity 200ms',
            }}
          >
            {loading
              ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
              : <><Check size={15} />Save Profile</>
            }
          </motion.button>
        </form>

        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: $.t4, fontSize: 11 }}>
          <Shield size={11} />
          <span>Your profile is stored securely with row-level security</span>
        </div>
      </motion.div>
    </div>
  )
}
