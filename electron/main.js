'use strict'

const path = require('path')
const {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  Menu,
} = require('electron')
const { createTray, setTrayUnread } = require('./tray')

// 개발: Next.js 개발 서버를 로드. 배포 환경에서는 배포된 URL을 가리킨다.
const APP_URL = process.env.APP_URL || 'http://localhost:3010'

// Windows: 네이티브 알림에 앱 이름/아이콘이 제대로 표시되려면 필수.
// 알림 헤더에는 이 AUMID와 매칭되는 시작 메뉴 바로가기의 표시 이름이 뜬다.
// 개발 중(미패키징)에는 바로가기가 없어 이 문자열이 그대로 노출되므로,
// 읽을 수 있는 이름을 쓴다.
app.setAppUserModelId('Demo Chat')

// Windows/Linux 기본 메뉴바(File/Edit/View/Window/Help)를 제거한다.
// macOS는 앱 메뉴가 시스템 상단바에 붙고 이걸 없애면 단축키(복사·붙여넣기 등)까지
// 죽어버리므로 그대로 둔다.
if (process.platform !== 'darwin') {
  Menu.setApplicationMenu(null)
}

let mainWindow = null

// 단일 인스턴스: 두 번째로 실행하면 새 창을 띄우지 않고 기존 창을 포커스한다.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 780,
    minHeight: 480,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#313338',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 핵심: 최소화/숨김 상태에서도 렌더러(와 그 WebSocket)를 살려둔다.
      // 백그라운드 브라우저 탭처럼 스로틀링/freeze 되지 않게 한다.
      backgroundThrottling: false,
    },
  })

  mainWindow.loadURL(APP_URL)

  // 렌더러의 경고/에러(예: React 하이드레이션 미스매치)를 터미널로 노출.
  // 원격 웹앱을 감싸는 쉘을 개발할 때 유용하다.
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 || /hydrat|did not match/i.test(message)) {
      console.log(`[renderer] ${message}`)
    }
  })

  // 트레이 상주 동작: 창을 닫아도 종료하지 않고 숨긴다.
  // 그래야 WS 연결이 유지되고 알림도 계속 동작한다.
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// ---- IPC: 렌더러(웹) -> 메인 ----------------------------------------------

// 네이티브 OS 알림을 띄운다. 웹앱이 "알림을 띄워야 한다"고 판단했을 때만 호출된다
// (창이 포커스가 아니거나 / 해당 방을 보고 있지 않을 때).
ipcMain.on('notify', (_e, payload) => {
  const { title, body, roomId } = payload || {}
  console.log(
    `[notify] room=${roomId} "${title}: ${body}" (supported=${Notification.isSupported()})`
  )
  if (!Notification.isSupported()) return

  const n = new Notification({
    title: title || 'New message',
    body: body || '',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    silent: false,
  })

  n.on('click', () => {
    showWindow()
    if (roomId && mainWindow) {
      mainWindow.webContents.send('open-room', roomId)
    }
  })

  n.show()
})

// unread 상태를 트레이 아이콘 + OS 배지에 반영.
ipcMain.on('unread', (_e, count) => {
  const n = Number(count) || 0
  console.log(`[unread] total=${n}`)
  setTrayUnread(n > 0)
  // macOS 독 배지. Windows에서는 no-op (여기선 오버레이 아이콘을 쓰게 됨).
  if (typeof app.setBadgeCount === 'function') {
    app.setBadgeCount(n)
  }
})

// 렌더러가 창을 앞으로 가져오도록 요청할 수 있게 한다 (인앱 액션 등).
ipcMain.on('focus-window', () => showWindow())

// ---- 앱 생명주기 -----------------------------------------------------------

app.whenReady().then(() => {
  createWindow()
  createTray({
    onShow: showWindow,
    onQuit: () => {
      app.isQuitting = true
      app.quit()
    },
  })

  app.on('activate', () => {
    // macOS: 독 아이콘 클릭 시 열린 창이 없으면 다시 생성/표시.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else showWindow()
  })
})

// 모든 창이 닫혀도 종료하지 않는다: 트레이에 상주.
app.on('window-all-closed', () => {
  // 의도적으로 비워 둠 (트레이 메뉴로는 실제 종료가 가능).
})

app.on('before-quit', () => {
  app.isQuitting = true
})
