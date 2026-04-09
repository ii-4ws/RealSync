import React, { useState } from 'react'
import { motion } from 'framer-motion'
import $ from '../../lib/tokens'

interface ToggleProps {
  on: boolean
  onChange: (val: boolean) => void
}

export default function Toggle({ on, onChange }: ToggleProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onClick={() => onChange(!on)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!on) } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
        position: 'relative', flexShrink: 0,
        background: on ? $.cyan : $.bg3,
        border: `1px solid ${on ? $.cyan : hovered ? $.b2 : $.b1}`,
        transition: 'background 200ms cubic-bezier(0.4,0,0.2,1), border-color 200ms cubic-bezier(0.4,0,0.2,1), box-shadow 200ms cubic-bezier(0.4,0,0.2,1)',
        boxShadow: on ? '0 0 10px rgba(34,211,238,0.30)' : 'none',
        outline: 'none',
      }}
    >
      <motion.div
        animate={{ x: on ? 22 : 2 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{
          position: 'absolute', top: 3,
          width: 16, height: 16, borderRadius: '50%',
          background: on ? '#fff' : $.t3,
          boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        }}
      />
    </div>
  )
}
