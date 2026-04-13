interface Props {
  tag: string
  onClick?: () => void
  active?: boolean
  small?: boolean
}

export default function TagChip({ tag, onClick, active, small }: Props) {
  const className = [
    'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-xs transition-colors',
    small ? 'text-[11px]' : '',
    active
      ? 'border-tn-blue bg-tn-blue/10 text-tn-blue'
      : 'border-tn-border bg-tn-highlight/40 text-tn-muted',
    onClick ? 'cursor-pointer hover:border-tn-blue/60 hover:text-tn-fg' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (!onClick) return <span className={className}>{tag}</span>

  return (
    <button type="button" onClick={onClick} className={className}>
      {tag}
    </button>
  )
}
