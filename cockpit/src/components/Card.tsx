import type { ReactNode } from 'react'

const C = {
  navyLight: '#162438',
  navyBorder: '#243a55',
}

interface CardProps {
  children: ReactNode
  style?: React.CSSProperties
  className?: string
}

export function Card({ children, style, className }: CardProps) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: C.navyLight,
        border: `1px solid ${C.navyBorder}`,
        borderRadius: 12,
        padding: 20,
        ...style
      }}
    >
      {children}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
  icon?: string
}

export function StatCard({ label, value, sub, accent, icon }: StatCardProps) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>
            {label}
          </div>
          <div style={{
            fontSize: 32,
            fontWeight: 700,
            color: accent ? '#F4C20D' : '#fff',
            lineHeight: 1,
            letterSpacing: '-0.5px'
          }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{sub}</div>
          )}
        </div>
        {icon && (
          <div style={{
            fontSize: 24,
            opacity: 0.6,
            backgroundColor: '#1E3050',
            width: 44,
            height: 44,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}
