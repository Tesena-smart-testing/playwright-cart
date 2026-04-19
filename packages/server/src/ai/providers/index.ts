import { AnthropicProvider } from './anthropic.js'
import type { LLMProvider } from './types.js'

const providers: Record<string, LLMProvider> = {
  anthropic: new AnthropicProvider(),
}

export function getProvider(name: string): LLMProvider {
  const p = providers[name]
  if (!p) throw new Error(`Unknown LLM provider: ${name}`)
  return p
}

export function listProviders(): { name: string; models: { id: string; label: string }[] }[] {
  return Object.values(providers).map((p) => ({ name: p.name, models: p.availableModels }))
}
