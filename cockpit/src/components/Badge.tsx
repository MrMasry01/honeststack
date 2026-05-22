const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:      { bg: '#1e293b', color: '#94a3b8' },
  ready:      { bg: '#1a3a2a', color: '#4ade80' },
  scheduled:  { bg: '#1a2a4a', color: '#60a5fa' },
  posted:     { bg: '#2a1a3a', color: '#c084fc' },
  pending:    { bg: '#1e293b', color: '#94a3b8' },
  publishing: { bg: '#1a2a4a', color: '#60a5fa' },
  failed:     { bg: '#3a1a1a', color: '#f87171' },
  twitter:    { bg: '#0a1929', color: '#1d9bf0' },
  rss:        { bg: '#1a1a0a', color: '#f97316' },
  instagram:  { bg: '#2a0a1a', color: '#e879f9' },
  youtube:    { bg: '#2a0a0a', color: '#f87171' },
  tiktok:     { bg: '#0a1a1a', color: '#2dd4bf' },
  active:     { bg: '#1a3a2a', color: '#4ade80' },
  inactive:   { bg: '#1e293b', color: '#64748b' },
}

interface BadgeProps {
  label: string
  type?: string
}

export function Badge({ label, type }: BadgeProps) {
  const key = type || label.toLowerCase()
  const colors = STATUS_COLORS[key] || { bg: '#1e293b', color: '#94a3b8' }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.3px',
      backgroundColor: colors.bg,
      color: colors.color,
      textTransform: 'capitalize',
    }}>
      {label}
    </span>
  )
}
