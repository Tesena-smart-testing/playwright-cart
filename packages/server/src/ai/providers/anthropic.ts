import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider } from './types.js'

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'
  readonly availableModels = [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ]

  async generateSummary(opts: {
    prompt: string
    images: { data: string; mediaType: string }[]
    model: string
    apiKey: string
  }): Promise<string> {
    const client = new Anthropic({ apiKey: opts.apiKey })

    const content: Anthropic.MessageParam['content'] = [
      ...opts.images.map(
        (img): Anthropic.ImageBlockParam => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType as 'image/png', data: img.data },
        }),
      ),
      { type: 'text', text: opts.prompt },
    ]

    const msg = await client.messages.create({
      model: opts.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    })

    const text = msg.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') throw new Error('No text in Anthropic response')
    return text.text
  }
}
