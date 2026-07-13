'use client'

import { useEffect } from 'react'
import { useChat } from '@/lib/useChat'
import { Sidebar } from '@/components/Sidebar'
import { ChatRoom } from '@/components/ChatRoom'
import { isElectron } from '@/lib/electron'

export default function Page() {
  const chat = useChat()

  // 순수 브라우저(Electron 아님)에서는 웹 폴백 경로가 뭔가 표시할 수 있도록
  // Notification 권한을 한 번 요청한다. 실제 앱이라면 이걸 FCM/Service-Worker
  // push 구독과 연결한다.
  useEffect(() => {
    if (
      !isElectron() &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  const activeRoomObj = chat.rooms.find((r) => r.id === chat.activeRoom) ?? null
  const messages = chat.activeRoom ? chat.messagesByRoom[chat.activeRoom] || [] : []

  return (
    <main className="app">
      <Sidebar
        rooms={chat.rooms}
        activeRoom={chat.activeRoom}
        unreadByRoom={chat.unreadByRoom}
        connected={chat.connected}
        me={chat.me}
        presence={chat.presence}
        runsInElectron={chat.runsInElectron}
        onSelect={chat.selectRoom}
        onSetName={chat.setName}
      />
      <ChatRoom
        room={activeRoomObj}
        messages={messages}
        runsInElectron={chat.runsInElectron}
        onSend={chat.sendMessage}
      />
    </main>
  )
}
