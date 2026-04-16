export type AuthUser =
  | {
      type: 'user'
      id: number
      username: string
      role: 'admin' | 'user'
      theme: 'dark' | 'light' | 'system'
      runsPerPage: number
      chartOrder: string[] | null
      exp: number
      jti: string
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
