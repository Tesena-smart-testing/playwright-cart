export type AuthUser =
  | {
      type: 'user'
      id: number
      username: string
      role: 'admin' | 'user'
      theme: 'dark' | 'light' | 'system'
      exp: number
    }
  | {
      type: 'apikey'
      keyId: number
    }

export type HonoEnv = {
  Variables: {
    authUser: AuthUser
  }
}
