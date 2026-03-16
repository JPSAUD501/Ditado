import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow } from 'electron'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const sourceSvgPath = join(rootDir, 'public', 'favicon.svg')
const outputDir = join(rootDir, 'public', 'app-icons')

const renderSizes = [16, 24, 32, 48, 64, 128, 256]

const createIco = (images) => {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(images.length * 16)
  let offset = header.length + directory.length

  images.forEach(({ size, buffer }, index) => {
    const entryOffset = index * 16
    directory[entryOffset] = size >= 256 ? 0 : size
    directory[entryOffset + 1] = size >= 256 ? 0 : size
    directory[entryOffset + 2] = 0
    directory[entryOffset + 3] = 0
    directory.writeUInt16LE(1, entryOffset + 4)
    directory.writeUInt16LE(32, entryOffset + 6)
    directory.writeUInt32LE(buffer.length, entryOffset + 8)
    directory.writeUInt32LE(offset, entryOffset + 12)
    offset += buffer.length
  })

  return Buffer.concat([header, directory, ...images.map(({ buffer }) => buffer)])
}

app.commandLine.appendSwitch('disable-gpu')
app.on('window-all-closed', (event) => {
  event.preventDefault()
})

const renderSvgToPng = async (window, svgMarkup, size) => {
  const dataUrl = await window.webContents.executeJavaScript(
    `(${async (svg, iconSize) => {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)

      try {
        const image = new Image()
        image.src = url
        await image.decode()

        const canvas = document.createElement('canvas')
        canvas.width = iconSize
        canvas.height = iconSize

        const context = canvas.getContext('2d')
        if (!context) {
          throw new Error('Could not create canvas context.')
        }

        context.clearRect(0, 0, iconSize, iconSize)
        context.drawImage(image, 0, 0, iconSize, iconSize)
        return canvas.toDataURL('image/png')
      } finally {
        URL.revokeObjectURL(url)
      }
    }})(${JSON.stringify(svgMarkup)}, ${size})`,
    true,
  )

  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
}

const main = async () => {
  await app.whenReady()

  const svgMarkup = await readFile(sourceSvgPath, 'utf8')
  const window = new BrowserWindow({
    show: false,
    width: 256,
    height: 256,
    webPreferences: {
      sandbox: false,
    },
  })

  await window.loadURL('data:text/html,<html><body></body></html>')

  const rendered = []
  for (const size of renderSizes) {
    rendered.push({
      size,
      buffer: await renderSvgToPng(window, svgMarkup, size),
    })
  }

  await mkdir(outputDir, { recursive: true })
  await writeFile(join(outputDir, 'tray.png'), rendered.find(({ size }) => size === 32).buffer)
  await writeFile(join(outputDir, 'icon.png'), rendered.find(({ size }) => size === 256).buffer)
  await writeFile(join(outputDir, 'icon.ico'), createIco(rendered))

  window.destroy()
}

main()
  .then(() => {
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
