import { Menu, Tray } from 'electron'

import { createTrayIcon } from './appIcon.js'

type TrayHotkeys = {
  pushToTalkHotkey: string
  toggleHotkey: string
}

type TrayHandlers = {
  openOverview: () => void
  openHistory: () => void
  quit: () => void
}

type TrayRegistration = {
  tray: Tray
  refresh: () => void
}

const buildTrayMenu = (handlers: TrayHandlers, hotkeys: TrayHotkeys) => Menu.buildFromTemplate([
  { label: 'Open Ditado', click: handlers.openOverview },
  { label: 'Open History', click: handlers.openHistory },
  { type: 'separator' },
  { label: `Toggle: ${hotkeys.toggleHotkey}`, enabled: false },
  { label: `Push-to-talk: ${hotkeys.pushToTalkHotkey}`, enabled: false },
  { type: 'separator' },
  { label: 'Quit', click: handlers.quit },
])

export const registerTray = (
  handlers: TrayHandlers,
  getHotkeys: () => TrayHotkeys,
): TrayRegistration => {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip('Ditado')
  const refresh = (): void => {
    tray.setContextMenu(buildTrayMenu(handlers, getHotkeys()))
  }

  refresh()
  tray.on('click', handlers.openOverview)
  return { tray, refresh }
}
