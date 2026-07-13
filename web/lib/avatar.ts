const COLORS = ['#5865f2', '#23a55a', '#f0b232', '#ed4245', '#eb459e', '#3ba55d', '#faa61a']

export function colorFor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

export function initials(name: string): string {
  const s = name.trim()
  return s ? s[0].toUpperCase() : '?'
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}
