import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Clock, FileText, Settings, HelpCircle, Pin } from 'lucide-react'
import $ from '../../lib/tokens'

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Clock, label: 'Sessions', path: '/sessions' },
  { icon: FileText, label: 'Reports', path: '/reports' },
]

const COLLAPSED_W = 64
const EXPANDED_W = 220

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(() => localStorage.getItem('rs-sidebar-pinned') === 'true')
  const expanded = hovered || pinned

  function togglePin() {
    const next = !pinned
    setPinned(next)
    localStorage.setItem('rs-sidebar-pinned', String(next))
  }

  function isActive(path: string) {
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path))
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: pinned ? EXPANDED_W : COLLAPSED_W, flexShrink: 0, position: 'relative', zIndex: 50 }}
    >
      <motion.div
        animate={{ width: expanded ? EXPANDED_W : COLLAPSED_W }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          position: 'absolute',
          left: 0, top: 0, height: '100%',
          background: $.bg1,
          borderRight: `1px solid ${$.b1}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: expanded ? 'stretch' : 'center',
          paddingTop: 12,
          paddingBottom: 12,
          overflow: 'hidden',
          boxShadow: expanded && !pinned ? '8px 0 24px rgba(0,0,0,0.3)' : 'none',
        }}
      >
        {/* Logo */}
        <div
          onClick={() => navigate('/')}
          style={{
            width: 42, height: 42, borderRadius: 10,
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 24, flexShrink: 0,
            marginLeft: expanded ? 10 : 'auto',
            marginRight: expanded ? 0 : 'auto',
            overflow: 'hidden',
          }}
        >
          <img src={`${import.meta.env.BASE_URL}realsync-eye-only.png`} alt="RealSync" style={{ width: 42, height: 42, objectFit: 'contain' }} />
        </div>

        {/* Primary nav */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, paddingLeft: 0 }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path)
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                title={item.label}
                style={{
                  width: expanded ? 'calc(100% - 16px)' : 44,
                  height: 44,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  background: active ? 'rgba(34,211,238,0.1)' : 'transparent',
                  color: active ? $.cyan : $.t3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: expanded ? 'flex-start' : 'center',
                  gap: 10,
                  paddingLeft: expanded ? 12 : 0,
                  marginLeft: expanded ? 8 : 'auto',
                  marginRight: expanded ? 8 : 'auto',
                  transition: 'all 150ms cubic-bezier(0.4,0,0.2,1)',
                  position: 'relative',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    style={{
                      position: 'absolute',
                      left: expanded ? 0 : -8,
                      top: 8, bottom: 8,
                      width: 3, borderRadius: 2,
                      background: $.cyan,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                {expanded && <span>{item.label}</span>}
              </button>
            )
          })}
        </div>

        {/* Bottom controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          {/* Pin toggle */}
          <button
            onClick={togglePin}
            title={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
            style={{
              width: expanded ? 'calc(100% - 16px)' : 40,
              height: 40, borderRadius: 10,
              border: 'none', cursor: 'pointer',
              background: pinned ? 'rgba(34,211,238,0.1)' : 'transparent',
              color: pinned ? $.cyan : $.t4,
              display: 'flex', alignItems: 'center',
              justifyContent: expanded ? 'flex-start' : 'center',
              gap: 10,
              paddingLeft: expanded ? 12 : 0,
              marginLeft: expanded ? 8 : 'auto',
              marginRight: expanded ? 8 : 'auto',
              transition: 'all 150ms',
              fontFamily: 'Inter, sans-serif', fontSize: 13,
            }}
          >
            <Pin
              size={22} strokeWidth={1.8}
              style={{ transform: pinned ? 'rotate(0deg)' : 'rotate(45deg)', transition: 'transform 200ms' }}
            />
            {expanded && <span>{pinned ? 'Unpin' : 'Pin'} Sidebar</span>}
          </button>

          {/* Settings */}
          <button
            onClick={() => navigate('/settings')}
            title="Settings"
            style={{
              width: expanded ? 'calc(100% - 16px)' : 40,
              height: 40, borderRadius: 10,
              border: 'none', cursor: 'pointer',
              background: isActive('/settings') ? 'rgba(34,211,238,0.1)' : 'transparent',
              color: isActive('/settings') ? $.cyan : $.t4,
              display: 'flex', alignItems: 'center',
              justifyContent: expanded ? 'flex-start' : 'center',
              gap: 10,
              paddingLeft: expanded ? 12 : 0,
              marginLeft: expanded ? 8 : 'auto',
              marginRight: expanded ? 8 : 'auto',
              transition: 'all 150ms',
              fontFamily: 'Inter, sans-serif', fontSize: 13,
            }}
          >
            <Settings size={22} strokeWidth={1.8} />
            {expanded && <span>Settings</span>}
          </button>

          {/* FAQ */}
          <button
            onClick={() => navigate('/faq')}
            title="Help & FAQ"
            style={{
              width: expanded ? 'calc(100% - 16px)' : 40,
              height: 40, borderRadius: 10,
              border: 'none', cursor: 'pointer',
              background: isActive('/faq') ? 'rgba(34,211,238,0.1)' : 'transparent',
              color: isActive('/faq') ? $.cyan : $.t4,
              display: 'flex', alignItems: 'center',
              justifyContent: expanded ? 'flex-start' : 'center',
              gap: 10,
              paddingLeft: expanded ? 12 : 0,
              marginLeft: expanded ? 8 : 'auto',
              marginRight: expanded ? 8 : 'auto',
              transition: 'all 150ms',
              fontFamily: 'Inter, sans-serif', fontSize: 13,
            }}
          >
            <HelpCircle size={22} strokeWidth={1.8} />
            {expanded && <span>FAQ</span>}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
