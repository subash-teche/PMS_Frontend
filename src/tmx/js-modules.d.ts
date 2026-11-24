// Types for the few plain-JavaScript PMS modules that the Task Management screens (TypeScript) import.
declare module '@/auth/auth-context' {
  export function useAuth(): { user: { id: number; name: string; email?: string | null; isSuperAdmin?: boolean; role?: { code: string } } | null }
}
declare module '@/components/layout/Sidebar' {
  import type { ReactElement } from 'react'
  export function Sidebar(props: { collapsed: boolean; onToggle: () => void; variant?: 'pms' | 'tm' }): ReactElement
}
declare module '@/api/client' {
  import type { AxiosInstance } from 'axios'
  export const api: AxiosInstance
}
declare module '@/lib/timezone' {
  export function todayIso(): string
}
