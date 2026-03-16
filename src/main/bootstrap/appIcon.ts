import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage, type NativeImage } from 'electron'

const GENERATED_ICON_DIR = 'app-icons'

const resolveIconPath = (fileName: string): string => {
  const appPath = app.getAppPath()
  const candidates = [
    join(appPath, 'public', GENERATED_ICON_DIR, fileName),
    join(appPath, 'dist', GENERATED_ICON_DIR, fileName),
    join(process.cwd(), 'public', GENERATED_ICON_DIR, fileName),
    join(process.cwd(), 'dist', GENERATED_ICON_DIR, fileName),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`Icon asset "${fileName}" not found. Run "npm run generate:icons".`)
}

const loadIcon = (fileName: string): NativeImage => {
  const icon = nativeImage.createFromPath(resolveIconPath(fileName))
  if (icon.isEmpty()) {
    throw new Error(`Icon asset "${fileName}" could not be loaded.`)
  }

  return icon
}

export function createTrayIcon(): NativeImage {
  return loadIcon('tray.png')
}

export function createWindowIcon(): NativeImage {
  return loadIcon('icon.png')
}
