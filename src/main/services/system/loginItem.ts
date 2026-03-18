type LoginItemSettings = {
  openAtLogin: boolean
}

type LoginItemApi = {
  isPackaged: boolean
  getPath(name: 'exe'): string
  getLoginItemSettings(): LoginItemSettings
  setLoginItemSettings(settings: LoginItemSettings): void
}

type Logger = Pick<Console, 'warn'>

const isMacLoginItemEnableSupported = (appApi: LoginItemApi, platform: NodeJS.Platform): boolean => {
  if (platform !== 'darwin') {
    return true
  }

  if (!appApi.isPackaged) {
    return false
  }

  const executablePath = appApi.getPath('exe').replace(/\\/g, '/')
  return executablePath.includes('/Applications/')
}

export const syncLoginItemSettings = (
  appApi: LoginItemApi,
  openAtLogin: boolean,
  logger: Logger = console,
  platform: NodeJS.Platform = process.platform,
): boolean => {
  const currentSettings = appApi.getLoginItemSettings()

  if (currentSettings.openAtLogin === openAtLogin) {
    return true
  }

  if (openAtLogin && !isMacLoginItemEnableSupported(appApi, platform)) {
    logger.warn('[ditado][startup] launch-on-login is unavailable for this macOS app bundle', {
      openAtLogin,
      packaged: appApi.isPackaged,
      executablePath: appApi.getPath('exe'),
    })
    return false
  }

  try {
    appApi.setLoginItemSettings({ openAtLogin })
    return true
  } catch (error) {
    logger.warn('[ditado][startup] failed to sync launch-on-login setting', {
      openAtLogin,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
