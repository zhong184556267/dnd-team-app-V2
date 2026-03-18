import { createContext, useContext, useEffect, useState } from 'react'
import { getStoredUser, setStoredUser, clearStoredUser, isUserAdmin } from '../lib/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    setUser(getStoredUser() ?? null)
  }, [])

  const login = (name) => {
    const n = String(name).trim()
    if (!n) return
    setStoredUser(n)
    setUser({
      name: n,
      isAdmin: isUserAdmin(n),
    })
  }

  const logout = () => {
    clearStoredUser()
    setUser(null)
  }

  const value = {
    user,
    login,
    logout,
    isAdmin: user?.isAdmin ?? false,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
