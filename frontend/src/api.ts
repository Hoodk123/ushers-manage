const BASE = import.meta.env.VITE_API_URL ?? '/api'

function xsrfCookie(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
}

export interface SessionUser {
  id: string
  email: string
  name: string
}

export interface AdminProfile {
  id: string
  name: string
  email: string
  phone: string | null
  avatarUrl: string | null
}

export interface UsherProfile {
  id: string
  name: string
  email: string
  phone: string | null
  avatarUrl: string | null
  adminId: string
}

export interface MeResponse {
  user: SessionUser | null
  admin: AdminProfile | null
  usher: UsherProfile | null
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = xsrfCookie()
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { 'x-xsrf-token': token } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the API — is the server running?')
  }

  if (res.status === 204) return undefined as T

  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  if (!res.ok) {
    const message =
      body && typeof body.error === 'string'
        ? (body.error as string)
        : `Request failed (${res.status})`
    throw new ApiError(res.status, message)
  }
  return body as T
}

export const api = {
  me: () => request<MeResponse>('/auth/me'),
  login: (email: string, password: string) =>
    request<MeResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  signup: (name: string, email: string, password: string) =>
    request<MeResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
}