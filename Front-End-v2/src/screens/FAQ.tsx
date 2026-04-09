import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle, ChevronDown, Zap, Shield, Lock, Users } from 'lucide-react'
import $ from '../lib/tokens'
import { EASE } from '../lib/tokens'
import { FAQ_DATA } from '../lib/mockData'
import { useIsMobile } from '../hooks/useIsMobile'

const ICON_MAP: Record<string, typeof HelpCircle> = {
  zap: Zap,
  shield: Shield,
  lock: Lock,
  users: Users,
}

function FaqItem({ q, a, delay }: { q: string; a: string; delay: number }) {
  const [open, setOpen] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', background: 'transparent', border: 'none',
          borderBottom: `1px solid ${$.b1}`, cursor: 'pointer', textAlign: 'left',
          transition: 'background 150ms',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ fontSize: 14, color: open ? $.t1 : $.t2, fontWeight: open ? 500 : 400, transition: 'color 200ms' }}>
          {q}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={16} color={$.t3} />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <p style={{ padding: '12px 16px 16px', fontSize: 13, color: $.t3, lineHeight: 1.7, margin: 0, borderBottom: `1px solid ${$.b1}` }}>
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function FAQ() {
  const isMobile = useIsMobile()

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        style={{ marginBottom: isMobile ? 20 : 32 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <HelpCircle size={isMobile ? 16 : 20} color={$.cyan} />
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 600, color: $.t1, letterSpacing: '-0.02em' }}>
            Frequently Asked Questions
          </h1>
        </div>
        <p style={{ fontSize: isMobile ? 13 : 14, color: $.t3, lineHeight: 1.5 }}>
          Everything you need to know about RealSync's deepfake detection and meeting security platform.
        </p>
      </motion.div>

      {/* FAQ categories */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 24 }}>
        {FAQ_DATA.map((category, catIdx) => {
          const Icon = ICON_MAP[category.iconName] ?? HelpCircle
          return (
            <motion.div
              key={category.category}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: catIdx * 0.08, ease: EASE }}
              style={{ background: $.bg1, border: `1px solid ${$.b1}`, borderRadius: 14, overflow: 'hidden' }}
            >
              {/* Category header */}
              <div style={{
                padding: isMobile ? '12px 12px 10px' : '16px 16px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: `1px solid ${$.b1}`,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: `${$.cyan}10`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={14} color={$.cyan} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: $.t1 }}>{category.category}</span>
                <span style={{ fontSize: 11, color: $.t4, marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>
                  {category.items.length}
                </span>
              </div>

              {/* Items */}
              {category.items.map((item, itemIdx) => (
                <FaqItem
                  key={item.q}
                  q={item.q}
                  a={item.a}
                  delay={0.1 + catIdx * 0.05 + itemIdx * 0.03}
                />
              ))}
            </motion.div>
          )
        })}
      </div>

      {/* Footer CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        style={{
          marginTop: isMobile ? 20 : 32,
          padding: isMobile ? '14px 16px' : '20px 24px',
          borderRadius: 14,
          background: `linear-gradient(135deg, ${$.cyan}06, ${$.blue}06)`,
          border: `1px solid ${$.b1}`,
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: isMobile ? 13 : 14, color: $.t2, marginBottom: 4 }}>Still have questions?</p>
        <a href="mailto:info@real-sync.app" style={{ background: 'none', border: 'none', color: $.cyan, fontSize: isMobile ? 13 : 14, fontWeight: 500, cursor: 'pointer', padding: 0, textDecoration: 'none' }}>
          Contact info@real-sync.app
        </a>
      </motion.div>
    </div>
  )
}
