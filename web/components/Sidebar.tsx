'use client'

import { useState } from 'react'
import type { Me, Room, PresenceState } from '@/lib/types'
import { colorFor, initials } from '@/lib/avatar'

type Props = {
  rooms: Room[]
  activeRoom: string | null
  unreadByRoom: Record<string, number>
  connected: boolean
  me: Me | null
  presence: PresenceState
  runsInElectron: boolean
  onSelect: (roomId: string) => void
  onSetName: (name: string) => void
}

export function Sidebar({
  rooms,
  activeRoom,
  unreadByRoom,
  connected,
  me,
  presence,
  runsInElectron,
  onSelect,
  onSetName,
}: Props) {
  const [draft, setDraft] = useState(me?.name ?? '')

  const name = me?.name ?? 'You'

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Chat</span>
        <span className="conn">
          <span className={`dot ${connected ? 'on' : ''}`} />
          {connected ? '연결됨' : '연결 끊김'}
        </span>
      </div>

      <nav className="room-list">
        {rooms.map((r) => {
          const unread = unreadByRoom[r.id] || 0
          return (
            <button
              key={r.id}
              className={`room ${activeRoom === r.id ? 'active' : ''}`}
              onClick={() => onSelect(r.id)}
            >
              <span className="hash">#</span>
              <span className="name">{r.name}</span>
              {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
          )
        })}
      </nav>

      <div className="user-panel">
        <div className="avatar" style={{ background: colorFor(name) }}>
          {initials(name)}
          <span className={`status ${presence}`} />
        </div>
        <div className="user-meta">
          <input
            className="user-name"
            value={draft || name}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft && draft !== name) onSetName(draft)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            spellCheck={false}
          />
          <div className="user-sub">{presence}</div>
        </div>
        <span className={`env-tag ${runsInElectron ? '' : 'web'}`}>
          {runsInElectron ? 'APP' : 'WEB'}
        </span>
      </div>
    </aside>
  )
}
