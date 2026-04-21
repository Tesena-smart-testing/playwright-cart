import { describe, expect, it } from 'vitest'
import { ProviderError, type ProviderErrorCategory } from './errors.js'

describe('ProviderError', () => {
  it('is an instance of Error', () => {
    const err = new ProviderError('auth')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name ProviderError', () => {
    expect(new ProviderError('auth').name).toBe('ProviderError')
  })

  it.each<[ProviderErrorCategory, string]>([
    ['auth', 'API key is invalid or has been revoked — check your AI settings.'],
    [
      'permission',
      'The API key does not have permission to use this model — check your AI settings.',
    ],
    ['rate_limit', 'The AI provider rate limit was reached. Try again in a few minutes.'],
    ['server_error', 'The AI provider is experiencing issues. Try again later.'],
    ['connection_timeout', 'The request to the AI provider timed out. Try again later.'],
    ['connection', 'Could not connect to the AI provider. Check your network or try again later.'],
    [
      'bad_request',
      'The request was rejected by the AI provider. Check your model selection in Settings.',
    ],
    ['unknown', 'An unexpected error occurred while generating the summary.'],
  ])('category %s maps to correct user message', (category, expected) => {
    expect(new ProviderError(category).message).toBe(expected)
  })
})
