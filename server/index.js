"use strict";

/*
 * 최소 글로벌 WS 채팅 서버 (데모).
 *
 * 설계 선택: 사용자당 WebSocket 연결 하나가 모든 방 이벤트를 전달한다
 * (아키텍처 1 / "게이트웨이" 모델). 클라이언트가 모든 메시지를 받아서
 * 무엇을 렌더링/알림할지 판단한다. 덕분에 Electron의 "WS + 네이티브 알림"
 * 경로가 어느 방이든 알림을 띄울 수 있다.
 *
 * 또한 일정 주기로 임의의 방에 메시지를 보내는 데모용 "봇"을 돌린다.
 * 사용자 한 명만으로도 앱을 최소화해두고 알림이 뜨는지 확인할 수 있다.
 */

const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT) || 4000;
const BOT_INTERVAL_MS = Number(process.env.BOT_INTERVAL_MS) || 8000;
const BOT_ENABLED = process.env.BOT !== "off";

const ROOMS = [
  { id: "general", name: "일반" },
  { id: "random", name: "잡담" },
  { id: "dev", name: "개발" },
  { id: "design", name: "디자인" },
];

const BOT_AUTHORS = ["Nova", "Pixel", "Echo", "Juno"];
const BOT_LINES = [
  "이거 방금 배포됐어요 확인 부탁!",
  "점심 뭐 먹을까요 🍜",
  "리뷰 남겨놨습니다~",
  "알림 잘 오는지 테스트 중",
  "오늘 회의 3시로 옮겨졌어요",
  "이 버그 재현되네요",
  "ㅋㅋㅋ 굿",
  "스크린샷 첨부합니다",
  "최소화해두고 확인해보세요",
  "방금 그거 좋다",
];

let msgSeq = 1;
function nextId() {
  return "m" + (msgSeq++).toString(36) + "-" + Date.now().toString(36);
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 접속자 저장: ws -> { userId, name, presence: { state, activeRoom } }
const clients = new Map();

const server = http.createServer((req, res) => {
  // 간단한 헬스 엔드포인트; 실제 동작은 전부 WS로 이뤄진다.
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("chat demo server ok\n");
});

const wss = new WebSocketServer({ server });

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of clients.keys()) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

function broadcastMessage(message) {
  broadcast({ type: "message", message });
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const userId =
    url.searchParams.get("userId") ||
    "u-" + Math.random().toString(36).slice(2, 8);
  const name = url.searchParams.get("name") || "You";

  clients.set(ws, {
    userId,
    name,
    presence: { state: "online", activeRoom: null },
  });
  console.log(`[+] connected: ${name} (${userId}) — clients: ${clients.size}`);

  // 초기 페이로드: 당신이 누구인지 + 방 목록.
  send(ws, { type: "init", me: { userId, name }, rooms: ROOMS });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "send") {
      const meta = clients.get(ws);
      if (!meta) return;
      const room = ROOMS.find((r) => r.id === msg.roomId);
      if (!room) return;
      const message = {
        id: nextId(),
        roomId: room.id,
        author: meta.name,
        authorId: meta.userId,
        text: String(msg.text || "").slice(0, 2000),
        ts: Date.now(),
      };
      broadcastMessage(message);
    } else if (msg.type === "presence") {
      const meta = clients.get(ws);
      if (!meta) return;
      meta.presence = {
        state: msg.state || "online", // online | away | idle (온라인 | 자리비움 | 유휴)
        activeRoom: msg.activeRoom || null,
      };
      console.log(
        `[presence] ${meta.name}: ${meta.presence.state} @ ${meta.presence.activeRoom || "-"}`,
      );
    }
  });

  ws.on("close", () => {
    const meta = clients.get(ws);
    clients.delete(ws);
    console.log(
      `[-] disconnected: ${meta ? meta.name : "?"} — clients: ${clients.size}`,
    );
  });

  ws.on("error", () => {
    clients.delete(ws);
  });
});

// ---- 데모 봇: 일정 주기로 임의의 방에 메시지 전송 --------------------------
if (BOT_ENABLED) {
  setInterval(() => {
    if (clients.size === 0) return; // 아무도 듣고 있지 않음
    const room = pick(ROOMS);
    const message = {
      id: nextId(),
      roomId: room.id,
      author: pick(BOT_AUTHORS),
      authorId: "bot",
      text: pick(BOT_LINES),
      ts: Date.now(),
    };
    broadcastMessage(message);
    console.log(`[bot] -> #${room.id}: ${message.author}: ${message.text}`);
  }, BOT_INTERVAL_MS);
}

server.listen(PORT, () => {
  console.log(`chat demo server listening on ws://localhost:${PORT}`);
  console.log(
    `bot: ${BOT_ENABLED ? `every ${BOT_INTERVAL_MS}ms` : "off"} (set BOT=off to disable)`,
  );
});
