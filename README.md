# Electron 채팅 알림 프로토타입

디스코드/슬랙류를 모방한 데스크톱 알림 흐름 데모.
**Electron + WebSocket + 네이티브 알림 + 웹↔Electron IPC** 에 집중한다.

> 자세한 설계·의도는 [PLAN.md](./PLAN.md) 참고.

## 구성

```
server/    Node + ws  — 글로벌 WS, 방/메시지/presence + 데모 봇
web/       Next.js    — 디스코드풍 UI, WS 연결, isElectron 분기 알림
electron/  main+preload+tray — backgroundThrottling:false, 네이티브 알림
```

## 실행 (터미널 3개)

```bash
# 0) 최초 1회: 의존성 설치
npm run setup            # 루트에서 (server/web/electron 전부 설치)

# ▶ 한 번에 실행 (서버 + 웹 + 일렉트론)
npm run dev
```

`npm run dev` 는 [scripts/dev.js](./scripts/dev.js) 오케스트레이터로:

- 웹/서버 포트를 **비어있는 포트로 자동 선택** (3010이 사용 중이면 3011 …)
- 서버 WS 주소를 웹에 주입해 자동으로 잡힌 포트끼리 연결
- **웹이 준비된 뒤에** 일렉트론을 띄움 (빈 화면 로드 방지)
- **Ctrl+C 한 번**으로 셋 다 정리

```bash
WEB_PORT=3010 WS_PORT=4010 npm run dev   # 시작 포트 지정
NO_ELECTRON=1 npm run dev                # 일렉트론 없이 서버+웹만
```

### 개별 실행 (터미널 3개)

```bash
npm run server           # ws://localhost:4000 (+봇)
npm run web              # http://localhost:3010
npm run electron         # localhost:3010 을 loadURL (web이 떠 있어야 함)
```

## 시연 시나리오

1. Electron 앱을 켜고 방을 하나 연다.
2. 앱을 **최소화**(또는 창 닫기 → 트레이로 숨김)한다.
3. 봇이 다른 방/현재 방에 메시지를 보내면 **네이티브 알림**이 뜬다.
   (`backgroundThrottling:false` 덕에 최소화 상태에서도 WS가 살아있음)
4. 알림을 **클릭**하면 창이 복원되고 해당 방으로 이동한다.
5. 앱을 **완전 종료**(트레이 → 종료)하면 알림이 더 이상 오지 않는다.
6. 트레이 아이콘이 unread 상태에 따라 바뀌고, macOS Dock 배지에 개수가 뜬다.

### 웹(브라우저)에서 열면

`http://localhost:3010` 을 브라우저로 열면 우측 상단 태그가 `WEB` 으로 뜬다.
실제 서비스라면 이 경로가 FCM(Service Worker Push)이지만, 이 데모에선
브라우저 `Notification` API 로만 best-effort 처리한다(자리표시).

## 봇 끄기 / 주기 조절

```bash
BOT=off npm run server            # 봇 끔 (직접 메시지 보내며 테스트)
BOT_INTERVAL_MS=4000 npm run server
```

## 핵심 포인트 (코드 위치)

- 최소화해도 WS 유지: `electron/main.js` — `backgroundThrottling: false`
- 트레이 상주 / 완전종료 구분: `electron/main.js` — `close → hide`, `app.isQuitting`
- 네이티브 알림 + 클릭 라우팅: `electron/main.js` — `ipcMain.on('notify')`
- 안전한 브리지: `electron/preload.js` — `contextBridge`
- 플랫폼 분기 알림: `web/lib/electron.ts` — `dispatchNotification`
- 포커스/방 기준 알림 판단 + presence: `web/lib/useChat.ts`
