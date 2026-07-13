# Electron 채팅 알림 프로토타입 계획

> **목적:** 기존 **웹 서비스를 Electron으로 이식**할 때 핵심이 되는 흐름 —
> WebSocket 상시 연결 + 백그라운드/트레이 상주 + 네이티브 데스크톱 알림 + 웹↔Electron IPC —
> 를 실제로 동작시켜 **이식 가능성과 설계 리스크를 선검증(PoC)** 한다.
>
> 기존 서비스 본체를 건드리지 않고, 디스코드/슬랙 류 채팅 앱을 모방한 **분리된 샌드박스**에서
> 이식 핵심 로직만 검증한다. 운영 서비스가 아니라 **그린필드 데모** — 서버/웹/Electron 전부 새로 만든다.

---

## 1. 스코프 (확정)

| 항목 | 결정 |
|---|---|
| 프론트 | **Next.js** |
| 서버 | **Node + `ws`** (가벼운 데모 서버) |
| UI | **디스코드 스타일** (사이드바 방 목록 + 채팅 영역) |
| FCM / SW Push | **구현 안 함** (VAPID·HTTPS·SW 부담 커서 프로토타입에선 제외) |
| 집중 영역 | **Electron + WebSocket + 네이티브 알림 + 웹↔Electron IPC** |
| WS 아키텍처 | **글로벌 WS(아키텍처 1)** — 한 연결로 모든 방 이벤트 수신 (우리가 그렇게 설계) |

> FCM은 "웹/모바일이라면 이 경로"라는 **자리(주석/분기)만 남기고**, 실제 알림 동작은 Electron의 WS+네이티브 알림으로 시연.

---

## 2. 시연 목표 = 이식 검증 항목 (이게 동작하면 성공)

> 아래 6개는 곧 **"기존 서비스를 Electron으로 이식했을 때 이 흐름들이 실제로 되는가"** 를 확인하는 검증 체크리스트다.

1. **최소화/트레이 상태**에서도 WS 연결 유지 → 메시지 오면 **네이티브 알림**
2. **완전 종료** 시 → 프로세스 죽음 → 알림 없음 (디스코드/슬랙과 동일한 의도)
3. **포커스 + 해당 방 보는 중** → 알림 생략 (중복 방지)
4. **다른 방** 메시지 → 포커스 중이어도 알림 + unread 뱃지
5. **알림 클릭** → 창 복원 + 해당 방으로 이동 (IPC 라우팅)
6. **presence 보고** → 최소화/idle 시 상태 변경 (서버가 활성 판단)

---

## 3. 아키텍처

```
┌─────────────────────────────────────────────┐
│  데모 서버 (Node + ws)                        │
│  - 글로벌 WS: userId 단위 1연결               │
│  - 방(room) 관리, 메시지 브로드캐스트         │
│  - presence(online/away/idle) 추적            │
│  - 봇/스크립트로 임의 방에 메시지 주입 (시연용)│
└───────────────┬─────────────────────────────┘
                │  WebSocket (모든 방 이벤트)
                │
┌───────────────▼─────────────────────────────┐
│  Next.js 프론트 (렌더러)                      │
│  - 디스코드풍 UI (방 목록 + 채팅)             │
│  - WS 연결/수신/렌더링                        │
│  - isElectron 분기:                           │
│      · Electron → window.electronAPI.notify   │
│      · 웹      → (FCM 자리, 데모에선 no-op)    │
│  - focus/active-room/idle 보고                │
└───────────────┬─────────────────────────────┘
                │  IPC (preload 브리지)
                │
┌───────────────▼─────────────────────────────┐
│  Electron 쉘 (main + preload)                 │
│  - BrowserWindow (backgroundThrottling:false) │
│  - 트레이 상주 (close → hide)                 │
│  - 네이티브 Notification + 클릭 라우팅        │
│  - setAppUserModelId (Windows 알림)           │
└─────────────────────────────────────────────┘
```

---

## 4. 폴더 구조 (예정)

```
electron-notification/
├── PLAN.md
├── server/                 # Node + ws 데모 서버
│   ├── package.json
│   └── index.js            # WS, room, presence, 메시지 주입
├── web/                    # Next.js 프론트
│   ├── package.json
│   ├── app/ (or pages/)
│   ├── lib/ws.ts           # WS 연결/구독
│   ├── lib/electron.ts     # isElectron 감지 + 브리지 호출
│   └── components/         # Sidebar, ChatRoom, MessageList ...
└── electron/               # Electron 쉘
    ├── package.json
    ├── main.js
    ├── preload.js
    └── tray.js
```

> 세 파트를 분리해, `web`은 브라우저에서도 그대로 돌고 `electron`은 그 URL(개발 시 localhost:3000)을 `loadURL`로 띄운다.

---

## 5. 파트별 구현 항목

### 5.1 데모 서버 (`server/`)

- `ws` 서버, 클라이언트 접속 시 `userId`로 식별 (쿼리스트링 등 간단히)
- 방 목록 하드코딩 (예: general, random, dev)
- 클라이언트가 보낸 메시지를 해당 방 구독자에게 브로드캐스트
- presence: 클라이언트가 보내는 `{type:'presence', state, activeRoom}` 저장
- **시연용 봇**: 일정 주기 또는 수동 트리거로 임의 방에 메시지 주입 (앱 최소화 상태 알림 테스트용)

### 5.2 Next.js 프론트 (`web/`)

- 디스코드풍 레이아웃: 좌측 방 목록(unread 뱃지) + 우측 채팅
- `lib/ws.ts`: 앱 로드 시 WS 1개 연결, 모든 방 메시지 수신
- 메시지 수신 핸들러:
  ```
  renderMessage(msg)
  const hidden = document.hidden || !document.hasFocus()
  const viewing = msg.roomId === activeRoom && !hidden
  if (!viewing) {
    if (isElectron) window.electronAPI.notify({title, body, roomId})
    else { /* FCM 자리 — 데모 no-op */ }
    bumpUnread(msg.roomId)
  }
  ```
- presence 보고: focus/blur/visibilitychange + idle 타이머 → 서버로 전송
- `electronAPI.onOpenRoom(roomId => setActiveRoom(roomId))` 구독 (알림 클릭 시 이동)

### 5.3 Electron 쉘 (`electron/`)

- `main.js`
  - `app.setAppUserModelId('com.demo.chat')`
  - `BrowserWindow`: `preload`, `contextIsolation:true`, `backgroundThrottling:false`
  - 개발: `loadURL('http://localhost:3000')`
  - `mainWindow.on('close', ...)` → hide (트레이 상주), `app.isQuitting` 플래그로 진짜 종료 구분
  - `ipcMain.on('notify', ...)` → `new Notification()` + click → `show()` + `webContents.send('open-room', roomId)`
- `preload.js`
  - `contextBridge.exposeInMainWorld('electronAPI', { notify, onOpenRoom })`
- `tray.js`
  - 트레이 아이콘 + 메뉴(열기 / 종료)

---

## 6. 주의사항

- **preload 보안**: `contextIsolation: true`, 렌더러에서 `require` 직접 금지, 브리지로만 통신
- **presence 정확성**: 최소화 시 `visibilitychange`/`blur` 정상 발생 확인 → 안 그러면 "항상 활성"으로 오인
- **중복 알림 방지**: 포커스 + 해당 방이면 생략
- **Windows**: `setAppUserModelId` 없으면 알림 이름/표시 깨짐 → 필수
- **크로스플랫폼 아이콘**: 트레이/알림 아이콘 png 준비 (mac 템플릿 이미지 고려는 후순위)

---

## 7. 진행 순서

1. **[쉘]** `electron/` — main + preload + 트레이, 빈 창 + `backgroundThrottling:false` 부터 동작 확인
2. **[서버]** `server/` — WS + 방 + 메시지 브로드캐스트 + 시연용 봇
3. **[프론트]** `web/` — 디스코드풍 UI + WS 연결 + 메시지 렌더링
4. **[연결]** isElectron 분기 + preload 알림 브리지 + 알림 클릭 라우팅
5. **[presence]** focus/idle 보고 + 중복 알림 방지
6. **[검증]** 최소화 알림 / 완전종료 무알림 / 다른 방 알림 / 클릭 이동 시나리오 확인

---

## 8. 데모에서 의도적으로 단순화하는 것 (문서에 명시)

- FCM/SW Push 미구현 (자리만)
- 인증/DB 없음 (인메모리, userId 쿼리로 대체)
- 메시지 영속화 없음 (재시작 시 초기화)
- 패키징/배포(빌드 서명 등)는 후순위 — 우선 `electron .` 개발 실행 기준
