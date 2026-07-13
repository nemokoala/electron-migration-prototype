'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// (원격) 웹 렌더러와 Electron 메인 프로세스 사이의 안전한 브리지.
// 웹앱은 `window.electronAPI` 존재 여부로 알림 경로를 분기한다:
//   - 존재  -> 데스크톱 앱: IPC로 네이티브 알림 사용
//   - 없음  -> 순수 웹/PWA: 자체 경로 사용 (실제 앱에선 FCM/SW push)
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // 메인에 네이티브 OS 알림을 띄우도록 요청.
  notify: (payload) => ipcRenderer.send('notify', payload),

  // 현재 총 unread 개수를 보고 (트레이 아이콘 + 독 배지 갱신).
  setUnread: (count) => ipcRenderer.send('unread', count),

  // 필요 시 렌더러에서 창을 앞으로 가져오기.
  focusWindow: () => ipcRenderer.send('focus-window'),

  // "이 방 열기" 이벤트 구독 (알림 클릭 시 발생).
  onOpenRoom: (cb) => {
    const handler = (_e, roomId) => cb(roomId)
    ipcRenderer.on('open-room', handler)
    // 구독 해제 함수를 반환
    return () => ipcRenderer.removeListener('open-room', handler)
  },
})
