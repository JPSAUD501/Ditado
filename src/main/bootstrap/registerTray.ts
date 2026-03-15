import { Menu, Tray, nativeImage } from 'electron'

type TrayHandlers = {
  openOverview: () => void
  openHistory: () => void
  showOverlay: () => void
  quit: () => void
}

const createTrayIcon = () =>
  nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#e2f5ff" stop-opacity="0.95" />
            <stop offset="100%" stop-color="#6a84ff" stop-opacity="0.72" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="20" fill="#050816" />
        <rect x="12" y="10" width="40" height="44" rx="16" fill="url(#g)" fill-opacity="0.18" stroke="rgba(255,255,255,0.38)" />
        <rect x="26" y="18" width="12" height="18" rx="6" fill="#f8fcff" />
        <path d="M20 31c0 8 5 13 12 13s12-5 12-13" fill="none" stroke="#f8fcff" stroke-width="4" stroke-linecap="round" />
        <path d="M32 44v8" fill="none" stroke="#f8fcff" stroke-width="4" stroke-linecap="round" />
        <path d="M24 52h16" fill="none" stroke="#f8fcff" stroke-width="4" stroke-linecap="round" />
      </svg>`,
    ).toString('base64')}`,
  )

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
