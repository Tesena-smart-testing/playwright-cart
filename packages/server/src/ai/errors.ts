export type ProviderErrorCategory =
  | 'auth'
  | 'permission'
  | 'rate_limit'
  | 'server_error'
  | 'connection_timeout'
  | 'connection'
  | 'bad_request'
  | 'unknown'

const USER_MESSAGES: Record<ProviderErrorCategory, string> = {
  auth: 'API key is invalid or has been revoked — check your AI settings.',
  permission: 'The API key does not have permission to use this model — check your AI settings.',
  rate_limit: 'The AI provider rate limit was reached. Try again in a few minutes.',
  server_error: 'The AI provider is experiencing issues. Try again later.',
  connection_timeout: 'The request to the AI provider timed out. Try again later.',
  connection: 'Could not connect to the AI provider. Check your network or try again later.',
  bad_request:
    'The request was rejected by the AI provider. Check your model selection in Settings.',
  unknown: 'An unexpected error occurred while generating the summary.',
}

export class ProviderError extends Error {
  readonly category: ProviderErrorCategory

  constructor(category: ProviderErrorCategory) {
    super(USER_MESSAGES[category])
    this.name = 'ProviderError'
    this.category = category
  }
}
