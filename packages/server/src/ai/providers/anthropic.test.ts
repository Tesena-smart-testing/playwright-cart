import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Test failed due to timeout in payment flow.' }],
      }),
    },
  })),
}))

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
    vi.mocked(Anthropic).mockImplementation(() => ({ messages: { create: mockCreate } }) as never)

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
})
