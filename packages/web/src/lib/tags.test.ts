import { describe, expect, it } from 'vitest'
import { collectUniqueTags, getVisibleTags, matchesAllTags } from './tags.js'

describe('matchesAllTags', () => {
  it('returns true when no filters selected', () => {
    expect(matchesAllTags(['@smoke'], [])).toBe(true)
  })

  it('applies AND semantics', () => {
    expect(matchesAllTags(['@auth', '@smoke'], ['@auth', '@smoke'])).toBe(true)
    expect(matchesAllTags(['@auth'], ['@auth', '@smoke'])).toBe(false)
  })
})

describe('getVisibleTags', () => {
  it('returns all tags when no filters selected', () => {
    expect(getVisibleTags(['@auth', '@smoke'], [])).toEqual(['@auth', '@smoke'])
  })

  it('returns only selected tags when filters active', () => {
    expect(getVisibleTags(['@auth', '@smoke', '@slow'], ['@smoke', '@slow'])).toEqual([
      '@smoke',
      '@slow',
    ])
  })
})

describe('collectUniqueTags', () => {
  it('deduplicates and sorts tags', () => {
    expect(
      collectUniqueTags([
        ['@slow', '@smoke'],
        ['@auth', '@smoke'],
      ]),
    ).toEqual(['@auth', '@slow', '@smoke'])
  })
})
