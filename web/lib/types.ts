export type Room = {
  id: string
  name: string
}

export type Message = {
  id: string
  roomId: string
  author: string
  authorId: string
  text: string
  ts: number
}

export type Me = {
  userId: string
  name: string
}

export type PresenceState = 'online' | 'away' | 'idle'

// ---- 통신 프로토콜 (서버 <-> 클라이언트) ----------------------------------

export type ServerEvent =
  | { type: 'init'; me: Me; rooms: Room[] }
  | { type: 'message'; message: Message }

export type ClientEvent =
  | { type: 'send'; roomId: string; text: string }
  | { type: 'presence'; state: PresenceState; activeRoom: string | null }
