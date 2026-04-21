import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk'
import { ProviderError } from '../errors.js'
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
          source: {
            type: 'base64',
            media_type: img.mediaType as Anthropic.Base64ImageSource['media_type'],
            data: img.data,
          },
        }),
      ),
      { type: 'text', text: opts.prompt },
    ]

    try {
      const msg = await client.messages.create({
        model: opts.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
      })

      const text = msg.content.find((b) => b.type === 'text')
      if (!text || text.type !== 'text') throw new ProviderError('unknown')
      return text.text
    } catch (err) {
      if (err instanceof ProviderError) throw err
      if (err instanceof AuthenticationError) throw new ProviderError('auth')
      if (err instanceof PermissionDeniedError) throw new ProviderError('permission')
      if (err instanceof RateLimitError) throw new ProviderError('rate_limit')
      if (err instanceof InternalServerError) throw new ProviderError('server_error')
      if (err instanceof APIConnectionTimeoutError) throw new ProviderError('connection_timeout')
      if (err instanceof APIConnectionError) throw new ProviderError('connection')
      if (err instanceof BadRequestError) throw new ProviderError('bad_request')
      if (err instanceof APIError) throw new ProviderError('unknown')
      throw new ProviderError('unknown')
    }
  }
}
