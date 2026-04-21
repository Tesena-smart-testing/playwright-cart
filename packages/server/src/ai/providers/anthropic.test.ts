import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  return {
    ...actual,
    // biome-ignore lint/complexity/useArrowFunction: must be a constructor-compatible function for `new Anthropic()`
    default: vi.fn().mockImplementation(function () {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Test failed due to timeout in payment flow.' }],
          }),
        },
      }
    }),
  }
})

import { AnthropicProvider } from './anthropic.js'

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider

  beforeEach(() => {
    provider = new AnthropicProvider()
  })

  it('exposes correct name and available models', () => {
    expect(provider.name).toBe('anthropic')
    expect(provider.availableModels.map((m) => m.id)).toContain('claude-sonnet-4-6')
  })

  it('returns generated text from the API', async () => {
    const result = await provider.generateSummary({
      prompt: 'Summarise this failure',
      images: [],
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test',
    })
    expect(result).toBe('Test failed due to timeout in payment flow.')
  })

  it('includes base64 images as vision content blocks when provided', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'summary' }],
    })
    // biome-ignore lint/complexity/useArrowFunction: must be a constructor-compatible function for `new Anthropic()`
    vi.mocked(Anthropic).mockImplementation(function () {
      return { messages: { create: mockCreate } } as never
    })

    const p = new AnthropicProvider()
    await p.generateSummary({
      prompt: 'Summarise',
      images: [{ data: 'base64data', mediaType: 'image/png' }],
      model: 'claude-sonnet-4-6',
      apiKey: 'sk-test',
    })

    const call = mockCreate.mock.calls[0][0]
    const imageBlock = call.messages[0].content.find((b: { type: string }) => b.type === 'image')
    expect(imageBlock).toBeDefined()
    expect(imageBlock.source.data).toBe('base64data')
  })

  it('throws ProviderError with auth category when Anthropic returns 401', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const { AuthenticationError } = await import('@anthropic-ai/sdk')
    const mockCreate = vi
      .fn()
      .mockRejectedValue(new AuthenticationError(401, undefined, 'Unauthorized', new Headers()))
    // biome-ignore lint/complexity/useArrowFunction: must be a constructor-compatible function for `new Anthropic()`
    vi.mocked(Anthropic).mockImplementation(function () {
      return { messages: { create: mockCreate } } as never
    })

    const p = new AnthropicProvider()
    await expect(
      p.generateSummary({ prompt: 'test', images: [], model: 'claude-sonnet-4-6', apiKey: 'bad' }),
    ).rejects.toThrow('API key is invalid or has been revoked — check your AI settings.')
  })

  it('throws ProviderError with rate_limit category when Anthropic returns 429', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const { RateLimitError } = await import('@anthropic-ai/sdk')
    const mockCreate = vi
      .fn()
      .mockRejectedValue(new RateLimitError(429, undefined, 'Too Many Requests', new Headers()))
    // biome-ignore lint/complexity/useArrowFunction: must be a constructor-compatible function for `new Anthropic()`
    vi.mocked(Anthropic).mockImplementation(function () {
      return { messages: { create: mockCreate } } as never
    })

    const p = new AnthropicProvider()
    await expect(
      p.generateSummary({ prompt: 'test', images: [], model: 'claude-sonnet-4-6', apiKey: 'sk' }),
    ).rejects.toThrow('The AI provider rate limit was reached. Try again in a few minutes.')
  })

  it('throws ProviderError with unknown category for non-APIError exceptions', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const mockCreate = vi.fn().mockRejectedValue(new Error('some internal error'))
    // biome-ignore lint/complexity/useArrowFunction: must be a constructor-compatible function for `new Anthropic()`
    vi.mocked(Anthropic).mockImplementation(function () {
      return { messages: { create: mockCreate } } as never
    })

    const p = new AnthropicProvider()
    await expect(
      p.generateSummary({ prompt: 'test', images: [], model: 'claude-sonnet-4-6', apiKey: 'sk' }),
    ).rejects.toThrow('An unexpected error occurred while generating the summary.')
  })

  it('throws ProviderError with permission category when Anthropic returns 403', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const { PermissionDeniedError } = await import('@anthropic-ai/sdk')
    const mockCreate = vi
      .fn()
      .mockRejectedValue(new PermissionDeniedError(403, undefined, 'Forbidden', new Headers()))
    // biome-ignore lint/complexity/useArrowFunction: must be a constructor-compatible function for `new Anthropic()`
    vi.mocked(Anthropic).mockImplementation(function () {
      return { messages: { create: mockCreate } } as never
    })

    const p = new AnthropicProvider()
    await expect(
      p.generateSummary({ prompt: 'test', images: [], model: 'claude-sonnet-4-6', apiKey: 'sk' }),
    ).rejects.toThrow(
      'The API key does not have permission to use this model — check your AI settings.',
    )
  })

  it('throws ProviderError with server_error category when Anthropic returns 500', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const { InternalServerError } = await import('@anthropic-ai/sdk')
    const mockCreate = vi
      .fn()
      .mockRejectedValue(
        new InternalServerError(500, undefined, 'Internal Server Error', new Headers()),
      )
    // biome-ignore lint/complexity/useArrowFunction: must be a constructor-compatible function for `new Anthropic()`
    vi.mocked(Anthropic).mockImplementation(function () {
      return { messages: { create: mockCreate } } as never
    })

    const p = new AnthropicProvider()
    await expect(
      p.generateSummary({ prompt: 'test', images: [], model: 'claude-sonnet-4-6', apiKey: 'sk' }),
    ).rejects.toThrow('The AI provider is experiencing issues. Try again later.')
  })

  it('throws ProviderError with connection_timeout category on timeout', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const { APIConnectionTimeoutError } = await import('@anthropic-ai/sdk')
    const mockCreate = vi.fn().mockRejectedValue(new APIConnectionTimeoutError())
    // biome-ignore lint/complexity/useArrowFunction: must be a constructor-compatible function for `new Anthropic()`
    vi.mocked(Anthropic).mockImplementation(function () {
      return { messages: { create: mockCreate } } as never
    })

    const p = new AnthropicProvider()
    await expect(
      p.generateSummary({ prompt: 'test', images: [], model: 'claude-sonnet-4-6', apiKey: 'sk' }),
    ).rejects.toThrow('The request to the AI provider timed out. Try again later.')
  })

  it('throws ProviderError with unknown category when response has no text block', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const mockCreate = vi.fn().mockResolvedValue({ content: [] })
    // biome-ignore lint/complexity/useArrowFunction: must be a constructor-compatible function for `new Anthropic()`
    vi.mocked(Anthropic).mockImplementation(function () {
      return { messages: { create: mockCreate } } as never
    })

    const p = new AnthropicProvider()
    await expect(
      p.generateSummary({ prompt: 'test', images: [], model: 'claude-sonnet-4-6', apiKey: 'sk' }),
    ).rejects.toThrow('An unexpected error occurred while generating the summary.')
  })
})
