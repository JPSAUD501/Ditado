import { Menu, Tray } from 'electron'

import { createTrayIcon } from './appIcon.js'

type TrayHotkeys = {
  pushToTalkHotkey: string
  toggleHotkey: string
}

type TrayHandlers = {
  openOverview: () => void
  openHistory: () => void
  openSettings: () => void
  quit: () => void
}

type TrayLabels = {
  openApp: string
  openHistory: string
  openSettings: string
  version: string
  toggle: string
  pushToTalk: string
  quit: string
}

type TrayRegistration = {
  tray: Tray
  refresh: () => void
}

const buildTrayMenu = (handlers: TrayHandlers, hotkeys: TrayHotkeys, labels: TrayLabels, appVersion: string) => Menu.buildFromTemplate([
  { label: labels.openApp, click: handlers.openOverview },
  { label: labels.openHistory, click: handlers.openHistory },
  { label: labels.openSettings, click: handlers.openSettings },
  { type: 'separator' },
  { label: `${labels.version}: v${appVersion}`, enabled: false },
  { label: `${labels.toggle}: ${hotkeys.toggleHotkey}`, enabled: false },
  { label: `${labels.pushToTalk}: ${hotkeys.pushToTalkHotkey}`, enabled: false },
  { type: 'separator' },
  { label: labels.quit, click: handlers.quit },
])

export const registerTray = (
  handlers: TrayHandlers,
  getHotkeys: () => TrayHotkeys,
  getLabels: () => TrayLabels,
  appVersion: string,
): TrayRegistration => {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip('Ditado')
  const refresh = (): void => {
    tray.setContextMenu(buildTrayMenu(handlers, getHotkeys(), getLabels(), appVersion))
  }

  refresh()
  tray.on('click', handlers.openOverview)
  return { tray, refresh }
}
