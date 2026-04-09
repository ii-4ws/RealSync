import React, { useState } from 'react'
import { motion } from 'framer-motion'
import $ from '../../lib/tokens'
import { EASE } from '../../lib/tokens'

interface BentoCardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  delay?: number
  span?: number
  rowSpan?: number
}

export default function BentoCard({ children, style, delay = 0, span, rowSpan }: BentoCardProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: $.bg1,
        border: `1px solid ${hovered ? $.b2 : $.b1}`,
        borderRadius: 14,
        padding: 20,
        transition: 'border-color 200ms cubic-bezier(0.4,0,0.2,1), transform 200ms cubic-bezier(0.4,0,0.2,1)',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        gridColumn: span ? `span ${span}` : undefined,
        gridRow: rowSpan ? `span ${rowSpan}` : undefined,
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      {children}
    </motion.div>
  )
}
