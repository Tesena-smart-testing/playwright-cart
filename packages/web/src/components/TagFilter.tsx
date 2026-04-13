import TagChip from './TagChip.js'

interface Props {
  tags: string[]
  selectedTags: string[]
  label: string
  onChange: (tags: string[]) => void
}

export default function TagFilter({ tags, selectedTags, label, onChange }: Props) {
  if (tags.length === 0) return null

  function toggleTag(tag: string) {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((selected) => selected !== tag))
      return
    }

    onChange([...selectedTags, tag].sort())
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-display text-xs font-semibold uppercase tracking-widest text-tn-muted">
          {label}
        </span>
        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="font-display text-xs text-tn-blue transition-colors hover:text-tn-purple"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <TagChip
            key={tag}
            tag={tag}
            active={selectedTags.includes(tag)}
            onClick={() => toggleTag(tag)}
          />
        ))}
      </div>
    </div>
  )
}
