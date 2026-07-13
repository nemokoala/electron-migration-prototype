export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000'

// 데모에서 "유휴(idle)" 상태를 쉽게 관찰할 수 있도록 짧게 잡음.
export const IDLE_AFTER_MS = 60_000
