import { describe, expect, it } from 'vitest'
import { applyOutcomeInversion } from './outcome.js'

const t = (status: string, annotationTypes: string[] = []) => ({
  status,
  annotations: annotationTypes.map((type) => ({ type })),
  title: 'some test',
  retry: 0,
})

describe('applyOutcomeInversion', () => {
  it('leaves normal passed test unchanged', () => {
    expect(applyOutcomeInversion(t('passed')).status).toBe('passed')
  })

  it('leaves normal failed test unchanged', () => {
    expect(applyOutcomeInversion(t('failed')).status).toBe('failed')
  })

  it('inverts failed→passed for expected failure (test.fail() that failed)', () => {
    expect(applyOutcomeInversion(t('failed', ['fail'])).status).toBe('passed')
  })

  it('inverts passed→failed for unexpected pass (test.fail() that passed)', () => {
    expect(applyOutcomeInversion(t('passed', ['fail'])).status).toBe('failed')
  })

  it('leaves timedOut unchanged even with fail annotation', () => {
    expect(applyOutcomeInversion(t('timedOut', ['fail'])).status).toBe('timedOut')
  })

  it('leaves interrupted unchanged even with fail annotation', () => {
    expect(applyOutcomeInversion(t('interrupted', ['fail'])).status).toBe('interrupted')
  })

  it('leaves skipped unchanged even with fail annotation', () => {
    expect(applyOutcomeInversion(t('skipped', ['fail'])).status).toBe('skipped')
  })

  it('ignores non-fail annotation types', () => {
    expect(applyOutcomeInversion(t('failed', ['slow', 'issue'])).status).toBe('failed')
  })

  it('handles multiple annotations where one is fail', () => {
    expect(applyOutcomeInversion(t('failed', ['slow', 'fail'])).status).toBe('passed')
  })

  it('preserves all other fields', () => {
    const input = { status: 'failed', annotations: [{ type: 'fail' }], title: 'my test', retry: 2 }
    const result = applyOutcomeInversion(input)
    expect(result.title).toBe('my test')
    expect(result.retry).toBe(2)
    expect(result.annotations).toEqual([{ type: 'fail' }])
  })
})
