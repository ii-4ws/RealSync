import React from 'react'
import { motion } from 'framer-motion'
import $ from '../../lib/tokens'
import { EASE } from '../../lib/tokens'

const RADIUS = 72
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface TrustGaugeProps {
  pct: number
}

export default function TrustGauge({ pct }: TrustGaugeProps) {
  const dashLength = CIRCUMFERENCE * pct / 100

  return (
    <div style={{ position: 'relative', width: 172, height: 172 }}>
      {/* Outer glow layer 1 */}
      <div style={{
        position: 'absolute', inset: -30, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(34,211,238,0.20) 0%, transparent 60%)',
        filter: 'blur(12px)',
      }} />
      {/* Outer glow layer 2 */}
      <div style={{
        position: 'absolute', inset: -16, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 65%)',
        filter: 'blur(6px)',
      }} />

      <svg width="172" height="172" viewBox="0 0 172 172" style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%">
            <stop offset="0%" stopColor={$.cyan} />
            <stop offset="50%" stopColor={$.blue} />
            <stop offset="100%" stopColor={$.violet} />
          </linearGradient>
          <filter id="gauge-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur" type="matrix"
              values="0 0 0 0 0.13  0 0 0 0 0.83  0 0 0 0 0.93  0 0 0 0.5 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <circle cx="86" cy="86" r={RADIUS} fill="none" stroke={$.bg2} strokeWidth="6" />
        <circle cx="86" cy="86" r={RADIUS} fill="none" stroke={$.cyan} strokeWidth="6" opacity="0.04" />

        {/* Tick marks */}
        {Array.from({ length: 60 }).map((_, i) => {
          const angle = (i / 60) * 360 * (Math.PI / 180)
          const major = i % 15 === 0
          const inner = RADIUS - (major ? 10 : 6)
          const outer = RADIUS - 3
          return (
            <line
              key={i}
              x1={86 + inner * Math.cos(angle)}
              y1={86 + inner * Math.sin(angle)}
              x2={86 + outer * Math.cos(angle)}
              y2={86 + outer * Math.sin(angle)}
              stroke={major ? $.t3 : $.bg4}
              strokeWidth={major ? 1 : 0.5}
            />
          )
        })}

        {/* Progress arc */}
        <motion.circle
          cx="86" cy="86" r={RADIUS}
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth="6"
          strokeLinecap="round"
          filter="url(#gauge-glow)"
          initial={{ strokeDasharray: `0 ${CIRCUMFERENCE}` }}
          animate={{ strokeDasharray: `${dashLength} ${CIRCUMFERENCE - dashLength}` }}
          transition={{ duration: 1.6, ease: EASE }}
        />
      </svg>

      {/* Center label */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontSize: 36,
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 300,
          color: $.t1,
          fontFeatureSettings: "'tnum' 1",
          lineHeight: 1,
        }}>
          {pct}%
        </span>
        <span style={{ fontSize: 10, color: $.t3, marginTop: 4, letterSpacing: '0.1em' }}>
          TRUST
        </span>
      </div>
    </div>
  )
}
