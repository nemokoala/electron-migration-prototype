"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Message, Me, Room, PresenceState, ServerEvent } from "./types";
import { WS_URL, IDLE_AFTER_MS } from "./config";
import {
  dispatchNotification,
  getElectron,
  reportUnread,
  isElectron,
} from "./electron";

function loadIdentity(): { userId: string; name: string } {
  if (typeof window === "undefined") return { userId: "", name: "You" };
  let userId = localStorage.getItem("chat.userId");
  if (!userId) {
    userId = "u-" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("chat.userId", userId);
  }
  const name = localStorage.getItem("chat.name") || "You";
  return { userId, name };
}

export type ChatState = {
  me: Me | null;
  rooms: Room[];
  activeRoom: string | null;
  connected: boolean;
  messagesByRoom: Record<string, Message[]>;
  unreadByRoom: Record<string, number>;
  totalUnread: number;
  presence: PresenceState;
  runsInElectron: boolean;
  selectRoom: (roomId: string) => void;
  sendMessage: (text: string) => void;
  setName: (name: string) => void;
};

export function useChat(): ChatState {
  const [me, setMe] = useState<Me | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<string, Message[]>
  >({});
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});
  const [presence, setPresence] = useState<PresenceState>("online");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 소켓 인스턴스별 "의도적으로 닫음" 표시. 반드시 인스턴스 단위여야 한다
  // (공유 boolean이면 안 됨): React StrictMode의 재마운트가 첫 소켓의 비동기
  // onclose가 실행되기 전에 공유 플래그를 리셋해버려, 엉뚱한 재연결이 발생하고
  // 연결이 2개 살아남게 된다.
  const intentionalRef = useRef<WeakSet<WebSocket>>(new WeakSet());
  const identityRef = useRef(loadIdentity());

  // ref로 state를 미러링해, (오래 사는) ws.onmessage 핸들러가 매 렌더마다
  // 재생성되지 않고도 최신 값을 읽을 수 있게 한다.
  const activeRoomRef = useRef<string | null>(null);
  const meRef = useRef<Me | null>(null);
  const focusedRef = useRef(true);
  const presenceRef = useRef<PresenceState>("online");
  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  // Electron 감지는 마운트 이후에 한다. 렌더 도중 계산하면 하이드레이션
  // 미스매치가 난다: 서버(`window` 없음)는 웹 변형을 렌더하는데, 클라이언트는
  // 즉시 Electron 변형을 렌더하기 때문. effect에서 설정하면 첫 클라이언트
  // 렌더가 서버와 동일하고, 다음 틱에 일반 re-render로 전환된다.
  const [runsInElectron, setRunsInElectron] = useState(false);
  useEffect(() => {
    setRunsInElectron(isElectron());
  }, []);

  const totalUnread = useMemo(
    () => Object.values(unreadByRoom).reduce((a, b) => a + b, 0),
    [unreadByRoom]
  );

  // ---- presence 보고 --------------------------------------------------------
  const sendPresence = useCallback(
    (state: PresenceState, room: string | null) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "presence", state, activeRoom: room }));
      }
    },
    []
  );

  const computeAndSendPresence = useCallback(
    (override?: PresenceState) => {
      // 창이 포커스/표시 상태가 아니면 away, 아니면 online
      // (idle은 idle 타이머가 명시적으로 설정한다).
      const visible = typeof document !== "undefined" && !document.hidden;
      let state: PresenceState = override ?? presenceRef.current;
      if (!override) {
        state = focusedRef.current && visible ? "online" : "away";
      }
      presenceRef.current = state;
      setPresence(state);
      // 포커스가 아니면 어떤 방도 "보고 있지 않은" 것이므로 null로 보고.
      const room = state === "online" ? activeRoomRef.current : null;
      sendPresence(state, room);
    },
    [sendPresence]
  );

  // ---- websocket 연결 -------------------------------------------------------
  const connect = useCallback(() => {
    const { userId, name } = identityRef.current;
    const url = `${WS_URL}?userId=${encodeURIComponent(
      userId
    )}&name=${encodeURIComponent(name)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      computeAndSendPresence();
    };

    ws.onclose = () => {
      setConnected(false);
      // 의도적으로 닫은 소켓(언마운트)은 재연결하지 않는다.
      if (intentionalRef.current.has(ws)) return;
      reconnectRef.current = setTimeout(connect, 1500);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (ev) => {
      let data: ServerEvent;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (data.type === "init") {
        setMe(data.me);
        meRef.current = data.me;
        setRooms(data.rooms);
        setMessagesByRoom((prev) => {
          const next = { ...prev };
          for (const r of data.rooms) if (!next[r.id]) next[r.id] = [];
          return next;
        });
        setActiveRoom((cur) => cur ?? data.rooms[0]?.id ?? null);
        return;
      }

      if (data.type === "message") {
        const m = data.message;
        console.log("message", m);
        setMessagesByRoom((prev) => ({
          ...prev,
          [m.roomId]: [...(prev[m.roomId] || []), m],
        }));

        const myId = meRef.current?.userId;
        const isOwn = m.authorId === myId;
        const visible = !document.hidden;
        const isViewing =
          m.roomId === activeRoomRef.current && focusedRef.current && visible;

        // 내 메시지가 아니고, 지금 그 방을 보고 있지 않을 때만
        // 알림 + unread 증가.
        if (!isOwn && !isViewing) {
          setUnreadByRoom((prev) => ({
            ...prev,
            [m.roomId]: (prev[m.roomId] || 0) + 1,
          }));
          dispatchNotification({
            title: `${m.author}`,
            body: m.text,
            roomId: m.roomId,
          });
        }
      }
    };
  }, [computeAndSendPresence]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      const ws = wsRef.current;
      if (ws) {
        intentionalRef.current.add(ws); // 이 소켓을 표시해 onclose가 재연결하지 않게 함
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 포커스 / 표시(visibility) / 유휴(idle) 추적 --------------------------
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (focusedRef.current) {
        idleTimer = setTimeout(() => {
          computeAndSendPresence("idle");
        }, IDLE_AFTER_MS);
      }
    };

    const onFocus = () => {
      focusedRef.current = true;
      computeAndSendPresence("online");
      resetIdle();
      // 지금 보고 있는 방의 unread를 0으로 초기화.
      const room = activeRoomRef.current;
      if (room) setUnreadByRoom((prev) => ({ ...prev, [room]: 0 }));
    };
    const onBlur = () => {
      focusedRef.current = false;
      computeAndSendPresence("away");
      if (idleTimer) clearTimeout(idleTimer);
    };
    const onVisibility = () => {
      if (document.hidden) onBlur();
      else onFocus();
    };
    const onActivity = () => {
      if (!focusedRef.current) return;
      if (presenceRef.current !== "online") computeAndSendPresence("online");
      resetIdle();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);

    focusedRef.current = document.hasFocus();
    resetIdle();

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [computeAndSendPresence]);

  // ---- unread를 트레이/배지 + 문서 제목에 반영 ------------------------------
  useEffect(() => {
    reportUnread(totalUnread);
    if (typeof document !== "undefined") {
      document.title = totalUnread > 0 ? `(${totalUnread}) Chat` : "Chat";
    }
  }, [totalUnread]);

  // ---- 알림 클릭 -> 해당 방 열기 (Electron) ---------------------------------
  useEffect(() => {
    const el = getElectron();
    if (!el) return;
    const unsub = el.onOpenRoom((roomId) => {
      setActiveRoom(roomId);
      setUnreadByRoom((prev) => ({ ...prev, [roomId]: 0 }));
    });
    return unsub;
  }, []);

  // ---- 액션 -----------------------------------------------------------------
  const selectRoom = useCallback(
    (roomId: string) => {
      setActiveRoom(roomId);
      setUnreadByRoom((prev) => ({ ...prev, [roomId]: 0 }));
      // 이제 이 방을 보고 있다고 보고 (포커스 상태일 때).
      if (focusedRef.current) sendPresence("online", roomId);
    },
    [sendPresence]
  );

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    const ws = wsRef.current;
    const room = activeRoomRef.current;
    if (!trimmed || !room || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "send", roomId: room, text: trimmed }));
  }, []);

  const setName = useCallback((name: string) => {
    const clean = name.trim().slice(0, 24) || "You";
    localStorage.setItem("chat.name", clean);
    identityRef.current = { ...identityRef.current, name: clean };
    // 서버가 새 이름을 반영하도록 재연결.
    wsRef.current?.close();
  }, []);

  return {
    me,
    rooms,
    activeRoom,
    connected,
    messagesByRoom,
    unreadByRoom,
    totalUnread,
    presence,
    runsInElectron,
    selectRoom,
    sendMessage,
    setName,
  };
}
