import { todayIso } from '@/lib/timezone'

// "Today" follows the signed-in PMS user's time zone (Administration -> Users -> Time zone), the same zone the API uses,
// so "due today" and the plan's past days agree between the screen and the server. (The old app used Dubai time.)

/** YYYY-MM-DD in the user's time zone */
export const dubaiToday = (): string => todayIso()

/** YYYY-MM in the user's time zone */
export const dubaiMonth = (): string => todayIso().slice(0, 7)

/** Move a YYYY-MM-DD date into another YYYY-MM, clamping the day (31 Jan -> 28 Feb). */
export function shiftDateToMonth(date: string, month: string): string {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const day = Math.min(Number(date.slice(8, 10)), lastDay)
  return `${month}-${String(day).padStart(2, '0')}`
}
