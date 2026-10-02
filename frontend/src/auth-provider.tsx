import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api, type MeResponse } from './api'
import { AuthContext, type AuthStatus } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<MeResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((me) => {
        if (cancelled) return
        setSession(me)
        setStatus(me.user ? 'authed' : 'guest')
      })
      .catch(() => {
        if (cancelled) return
        setSession(null)
        setStatus('guest')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const applySession = useCallback((me: MeResponse) => {
    setSession(me)
    setStatus(me.user ? 'authed' : 'guest')
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      applySession(await api.login(email, password))
    },
    [applySession],
  )

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      applySession(await api.signup(name, email, password))
    },
    [applySession],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setSession(null)
      setStatus('guest')
    }
  }, [])

  return (
    <AuthContext.Provider value={{ status, session, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}