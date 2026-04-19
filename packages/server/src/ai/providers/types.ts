export interface LLMProvider {
  name: string
  availableModels: { id: string; label: string }[]
  generateSummary(opts: {
    prompt: string
    images: { data: string; mediaType: string }[]
    model: string
    apiKey: string
  }): Promise<string>
}
