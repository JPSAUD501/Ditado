import { Menu, Tray } from 'electron'

import { createTrayIcon } from './appIcon.js'

type TrayHandlers = {
  openOverview: () => void
  openHistory: () => void
  showOverlay: () => void
  quit: () => void
}

export const registerTray = (handlers: TrayHandlers): Tray => {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip('Ditado')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Ditado', click: handlers.openOverview },
      { label: 'Open History', click: handlers.openHistory },
      { label: 'Show Overlay', click: handlers.showOverlay },
      { type: 'separator' },
      { label: 'Quit', click: handlers.quit },
    ]),
  )
  tray.on('click', handlers.openOverview)
  return tray
}
