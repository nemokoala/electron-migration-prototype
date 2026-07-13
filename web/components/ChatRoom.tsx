'use client'

import { useEffect, useRef, useState } from 'react'
import type { Message, Room } from '@/lib/types'
import { colorFor, initials, formatTime } from '@/lib/avatar'

type Props = {
  room: Room | null
  messages: Message[]
  runsInElectron: boolean
  onSend: (text: string) => void
}

export function ChatRoom({ room, messages, runsInElectron, onSend }: Props) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // 가장 최근 메시지로 자동 스크롤.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, room?.id])

  const submit = () => {
    if (!text.trim()) return
    onSend(text)
    setText('')
  }

  if (!room) {
    return (
      <section className="main">
        <div className="messages">
          <div className="empty">방을 선택하세요</div>
        </div>
      </section>
    )
  }

  return (
    <section className="main">
      <div className="main-header">
        <span className="hash" style={{ color: 'var(--text-muted)' }}>
          #
        </span>
        <span>{room.name}</span>
        <span className="hint">
          {runsInElectron
            ? '앱: 최소화해도 WS 유지 → 안 보는 방/포커스 아닐 때 네이티브 알림'
            : '웹: 실제 앱이라면 FCM(SW Push) 경로'}
        </span>
      </div>

      <div className="messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty">아직 메시지가 없어요.<br />봇이 곧 보낼 거예요 🤖</div>
        ) : (
          messages.map((m) => (
            <div className="msg" key={m.id}>
              <div className="m-avatar" style={{ background: colorFor(m.author) }}>
                {initials(m.author)}
              </div>
              <div className="m-body">
                <div className="m-head">
                  <span className="m-author">{m.author}</span>
                  <span className="m-time">{formatTime(m.ts)}</span>
                </div>
                <div className="m-text">{m.text}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="composer">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // IME 조합 중(한글 등)의 Enter는 "조합 확정"이므로 전송하지 않는다.
            // 이 가드가 없으면 한글 입력 시 메시지가 두 번 전송된다.
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={`#${room.name} 에 메시지 보내기`}
        />
      </div>
    </section>
  )
}
