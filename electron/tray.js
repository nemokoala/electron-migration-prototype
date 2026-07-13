'use strict'

const path = require('path')
const { Tray, Menu, nativeImage } = require('electron')

let tray = null

const ICON_NORMAL = path.join(__dirname, 'assets', 'tray.png')
const ICON_UNREAD = path.join(__dirname, 'assets', 'tray-unread.png')

function buildMenu({ onShow, onQuit }) {
  return Menu.buildFromTemplate([
    { label: '열기 (Open)', click: onShow },
    { type: 'separator' },
    { label: '종료 (Quit)', click: onQuit },
  ])
}

function createTray({ onShow, onQuit }) {
  const img = nativeImage.createFromPath(ICON_NORMAL)
  tray = new Tray(img)
  tray.setToolTip('Chat (demo)')
  tray.setContextMenu(buildMenu({ onShow, onQuit }))

  // 트레이 아이콘 클릭 시 창을 표시로 토글.
  tray.on('click', () => onShow())

  return tray
}

function setTrayUnread(hasUnread) {
  if (!tray) return
  const p = hasUnread ? ICON_UNREAD : ICON_NORMAL
  tray.setImage(nativeImage.createFromPath(p))
  tray.setToolTip(hasUnread ? 'Chat (demo) — 새 메시지' : 'Chat (demo)')
}

module.exports = { createTray, setTrayUnread }
