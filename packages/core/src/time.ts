export function parseClock(text: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) throw new Error(`无效时刻：${text}`)
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) throw new Error(`无效时刻：${text}`)
  // 00:00–03:59 视为服务日次日（北京地铁末班可跨零点）
  return (h < 4 ? h + 24 : h) * 60 + min
}

export function formatClock(totalSeconds: number): { text: string; nextDay: boolean } {
  const totalMinutes = Math.round(totalSeconds / 60)
  const nextDay = totalMinutes >= 24 * 60
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const hh = String(Math.floor(m / 60)).padStart(2, '0')
  const mm = String(m % 60).padStart(2, '0')
  return { text: `${hh}:${mm}`, nextDay }
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0 && m === 0 && sec === 0) return `${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  if (m > 0 && sec === 0) return `${m} 分`
  if (m > 0) return `${m} 分 ${String(sec).padStart(2, '0')} 秒`
  return `${sec} 秒`
}

export function formatMargin(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m > 0 && sec === 0) return `${m} 分`
  if (m > 0) return `${m} 分 ${String(sec).padStart(2, '0')} 秒`
  return `${sec} 秒`
}
