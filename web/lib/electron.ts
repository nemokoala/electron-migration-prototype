// Electron preload API로의 브리지 + 플랫폼에 따라 분기하는 알림 디스패치.
// 순수 브라우저에서는 `window.electronAPI`가 undefined다.

export type NotifyPayload = {
  title: string
  body: string
  roomId: string
}

type ElectronAPI = {
  isElectron: true
  platform: string
  notify: (p: NotifyPayload) => void
  setUnread: (count: number) => void
  focusWindow: () => void
  onOpenRoom: (cb: (roomId: string) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export function getElectron(): ElectronAPI | null {
  if (typeof window === 'undefined') return null
  return window.electronAPI ?? null
}

export function isElectron(): boolean {
  return getElectron() !== null
}

/**
 * 들어온 메시지에 대해 알림을 띄운다.
 * - Electron 데스크톱 앱 -> IPC를 통한 네이티브 OS 알림.
 * - 순수 웹 / PWA       -> 실제 앱이라면 FCM + Service Worker push를 쓴다.
 *   (이 프로토타입에는 미구현. 사용자가 마침 권한을 허용한 경우에만
 *    브라우저 Notification API로 best-effort 처리한다.)
 */
export function dispatchNotification(p: NotifyPayload): 'electron' | 'web' | 'none' {
  const el = getElectron()
  if (el) {
    el.notify(p)
    return 'electron'
  }

  // --- 웹/PWA 경로 자리표시 ---
  // 실제 구현: 서버가 FCM으로 push -> Service Worker가 알림 표시.
  // 탭이 닫혀 있어도 동작한다. 여기서는 웹 빌드가 완전히 무음이 되지 않도록
  // 인페이지 Notification API로 best-effort 처리만 한다.
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(p.title, { body: p.body })
      return 'web'
    } catch {
      /* 무시 */
    }
  }
  return 'none'
}

/** unread 총합을 트레이/배지에 반영 (Electron 전용). */
export function reportUnread(total: number) {
  const el = getElectron()
  if (el) el.setUnread(total)
}
