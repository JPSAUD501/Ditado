/**
 * Generate installer visual assets for electron-builder
 *
 * This script generates:
 * - Windows NSIS: installerSidebar.bmp (164x314), installerHeader.bmp (150x57)
 * - macOS DMG: background.png (540x380), background@2x.png (1080x760)
 * - Linux icons: multiple sizes in build/icons/
 * - General: icon.png (1024x1024)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const sourceSvgPath = join(rootDir, 'public', 'favicon.svg')
const buildDir = join(rootDir, 'build')
const iconsDir = join(buildDir, 'icons')

// Color palette from the app icon
const colors = {
  darkStart: '#1a1a2e',
  darkEnd: '#0d0d1a',
  goldLight: '#f0e6d3',
  goldDark: '#c8a96e',
}

/**
 * Extract inner SVG content (without outer <svg> tags) and rename gradient IDs
 * to avoid conflicts when embedded inside another SVG.
 */
const extractIconContent = (svgString, prefix) => {
  return svgString
    .replace(/id="bg"/g, `id="${prefix}-bg"`)
    .replace(/url\(#bg\)/g, `url(#${prefix}-bg)`)
    .replace(/id="mic"/g, `id="${prefix}-mic"`)
    .replace(/url\(#mic\)/g, `url(#${prefix}-mic)`)
    .replace(/<svg[^>]*>/g, '')
    .replace(/<\/svg>/g, '')
    .trim()
}

// Linux icon sizes
const linuxIconSizes = [16, 32, 48, 64, 128, 256, 512]

/**
 * Create a gradient background SVG
 */
const createGradientSvg = (width, height, direction = 'diagonal') => {
  let gradientDef = ''
  if (direction === 'diagonal') {
    gradientDef = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors.darkStart}"/>
      <stop offset="100%" stop-color="${colors.darkEnd}"/>
    </linearGradient>`
  } else if (direction === 'horizontal') {
    gradientDef = `<linearGradient id="bg" x1="0" y1="0.5" x2="1" y2="0.5">
      <stop offset="0%" stop-color="${colors.darkStart}"/>
      <stop offset="100%" stop-color="${colors.darkEnd}"/>
    </linearGradient>`
  } else {
    gradientDef = `<linearGradient id="bg" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="${colors.darkStart}"/>
      <stop offset="100%" stop-color="${colors.darkEnd}"/>
    </linearGradient>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>${gradientDef}</defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
  </svg>`
}

/**
 * Create the installer sidebar SVG (164x314 px)
 * Contains the app icon and name
 */
const createSidebarSvg = (iconSvg) => {
  const width = 164
  const height = 314
  const iconSize = 88
  const iconX = (width - iconSize) / 2
  const iconY = 28

  const iconContent = extractIconContent(iconSvg, 'sb')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${colors.darkStart}"/>
        <stop offset="100%" stop-color="${colors.darkEnd}"/>
      </linearGradient>
      <linearGradient id="gold-v" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="${colors.goldLight}"/>
        <stop offset="100%" stop-color="${colors.goldDark}"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>

    <!-- App icon (actual favicon SVG) -->
    <g transform="translate(${iconX}, ${iconY})">
      <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 512 512">
        ${iconContent}
      </svg>
    </g>

    <!-- App name -->
    <text x="${width / 2}" y="${iconY + iconSize + 24}" text-anchor="middle"
      font-family="Arial, sans-serif" font-size="17" font-weight="bold"
      letter-spacing="3" fill="${colors.goldLight}">DITADO</text>
    <text x="${width / 2}" y="${iconY + iconSize + 40}" text-anchor="middle"
      font-family="Arial, sans-serif" font-size="9" fill="#777777">AI Dictation</text>

    <!-- Decorative separator -->
    <line x1="28" y1="${iconY + iconSize + 56}" x2="${width - 28}" y2="${iconY + iconSize + 56}"
      stroke="${colors.goldDark}" stroke-width="0.5" opacity="0.5"/>
  </svg>`
}

/**
 * Create the installer header SVG (150x57 px)
 * Small banner with app name
 */
const createHeaderSvg = (iconSvg) => {
  const width = 150
  const height = 57
  const iconSize = 30
  const iconX = 12
  const iconY = Math.round((height - iconSize) / 2)

  const iconContent = extractIconContent(iconSvg, 'hdr')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0.5" x2="1" y2="0.5">
        <stop offset="0%" stop-color="${colors.darkStart}"/>
        <stop offset="100%" stop-color="${colors.darkEnd}"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>

    <!-- Bottom gold accent line -->
    <line x1="0" y1="${height - 1}" x2="${width}" y2="${height - 1}"
      stroke="${colors.goldDark}" stroke-width="1" opacity="0.6"/>

    <!-- App icon (actual favicon SVG) -->
    <g transform="translate(${iconX}, ${iconY})">
      <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 512 512">
        ${iconContent}
      </svg>
    </g>

    <!-- App name -->
    <text x="${iconX + iconSize + 10}" y="${Math.round(height / 2) + 5}"
      font-family="Arial, sans-serif" font-size="14" font-weight="bold"
      letter-spacing="1" fill="${colors.goldLight}">Ditado</text>
  </svg>`
}

/**
 * Create the DMG background SVG (540x380 or 1080x760 for retina)
 *
 * The electron-builder places the real icons ON TOP of this background:
 *   - App icon:          center at (160, 190) in display points
 *   - Applications link: center at (380, 190) in display points
 *
 * So the background must NOT render anything at those positions.
 * Instead it provides: branding at top, a clean arrow guide, labels and
 * instruction text below.
 */
const createDmgBackgroundSvg = (width, height) => {
  // Scale factor: 1 for 540×380, 2 for 1080×760 (retina @2x)
  const s = width / 540

  // Icon zone coordinates (display points × scale = pixels in this image)
  const appX = 160 * s
  const appsX = 380 * s
  const iconsY = 190 * s
  const iconHalf = (96 * s) / 2

  // Arrow sits horizontally between the two icon bounding boxes
  const arrowX1 = appX + iconHalf + 10 * s
  const arrowX2 = appsX - iconHalf - 10 * s
  const arrowY = iconsY

  // Typography sizes
  const fsBrand = Math.round(22 * s)
  const fsTagline = Math.round(11 * s)
  const fsLabel = Math.round(11 * s)
  const fsInstruction = Math.round(12 * s)
  const letterSpacing = Math.round(4 * s)

  // Vertical positions
  const brandY = Math.round(40 * s)
  const taglineY = Math.round(58 * s)
  const separatorY = Math.round(73 * s)
  const labelsY = Math.round(iconsY + iconHalf + 22 * s)
  const instructionY = Math.round(height - 28 * s)

  // Arrowhead size
  const ah = Math.round(7 * s)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="#20203a"/>
        <stop offset="100%" stop-color="${colors.darkEnd}"/>
      </linearGradient>
      <radialGradient id="topglow" cx="50%" cy="0%" r="55%">
        <stop offset="0%" stop-color="#2c2c50" stop-opacity="1"/>
        <stop offset="100%" stop-color="${colors.darkEnd}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="arrow-grad" x1="0" y1="0.5" x2="1" y2="0.5">
        <stop offset="0%" stop-color="${colors.goldDark}"/>
        <stop offset="100%" stop-color="${colors.goldLight}"/>
      </linearGradient>
    </defs>

    <!-- Background layers -->
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <rect width="${width}" height="${height}" fill="url(#topglow)"/>

    <!-- Branding: app name -->
    <text x="${width / 2}" y="${brandY}"
      text-anchor="middle" font-family="Arial, sans-serif"
      font-size="${fsBrand}" font-weight="bold" letter-spacing="${letterSpacing}"
      fill="${colors.goldLight}">DITADO</text>

    <!-- Branding: tagline -->
    <text x="${width / 2}" y="${taglineY}"
      text-anchor="middle" font-family="Arial, sans-serif"
      font-size="${fsTagline}" fill="#777777">AI Dictation</text>

    <!-- Separator line below branding -->
    <line x1="${40 * s}" y1="${separatorY}" x2="${width - 40 * s}" y2="${separatorY}"
      stroke="${colors.goldDark}" stroke-width="${0.5 * s}" opacity="0.4"/>

    <!-- Arrow between icon positions (clear of the icon zones) -->
    <line x1="${arrowX1}" y1="${arrowY}" x2="${arrowX2 - ah * 1.5}" y2="${arrowY}"
      stroke="url(#arrow-grad)" stroke-width="${1.5 * s}" stroke-linecap="round"/>
    <polygon
      points="${arrowX2 - ah * 2},${arrowY - ah} ${arrowX2},${arrowY} ${arrowX2 - ah * 2},${arrowY + ah}"
      fill="${colors.goldLight}"/>

    <!-- Labels below icon positions -->
    <text x="${appX}" y="${labelsY}"
      text-anchor="middle" font-family="Arial, sans-serif"
      font-size="${fsLabel}" fill="#666666">Ditado</text>
    <text x="${appsX}" y="${labelsY}"
      text-anchor="middle" font-family="Arial, sans-serif"
      font-size="${fsLabel}" fill="#666666">Applications</text>

    <!-- Install instruction -->
    <text x="${width / 2}" y="${instructionY}"
      text-anchor="middle" font-family="Arial, sans-serif"
      font-size="${fsInstruction}" fill="#555555">
      Drag Ditado to Applications to install
    </text>
  </svg>`
}

/**
 * Convert SVG to BMP buffer (24-bit uncompressed)
 */
const svgToBmp = async (svgContent, width, height) => {
  // First convert SVG to raw PNG, then to BMP
  const pngBuffer = await sharp(Buffer.from(svgContent))
    .resize(width, height)
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Create BMP header
  const rowSize = width * 3
  const paddedRowSize = Math.ceil(rowSize / 4) * 4
  const padding = paddedRowSize - rowSize
  const pixelDataSize = paddedRowSize * height
  const fileSize = 54 + pixelDataSize

  const header = Buffer.alloc(54)
  
  // BMP file header (14 bytes)
  header.write('BM', 0)                    // Signature
  header.writeUInt32LE(fileSize, 2)        // File size
  header.writeUInt32LE(0, 6)               // Reserved
  header.writeUInt32LE(54, 10)             // Pixel data offset

  // DIB header (40 bytes) - BITMAPINFOHEADER
  header.writeUInt32LE(40, 14)             // DIB header size
  header.writeInt32LE(width, 18)           // Width
  header.writeInt32LE(height, 22)          // Height (positive = bottom-up)
  header.writeUInt16LE(1, 26)              // Color planes
  header.writeUInt16LE(24, 28)             // Bits per pixel
  header.writeUInt32LE(0, 30)              // Compression (0 = none)
  header.writeUInt32LE(pixelDataSize, 34)  // Image size
  header.writeInt32LE(2835, 38)            // Horizontal resolution (72 DPI)
  header.writeInt32LE(2835, 42)            // Vertical resolution (72 DPI)
  header.writeUInt32LE(0, 46)              // Colors in palette
  header.writeUInt32LE(0, 50)              // Important colors

  // Convert RGBA to BGR with padding
  const { data, info } = pngBuffer
  const pixelData = Buffer.alloc(pixelDataSize)
  
  for (let y = 0; y < height; y++) {
    const srcRowStart = (height - 1 - y) * info.width * info.channels
    const dstRowStart = y * paddedRowSize
    
    for (let x = 0; x < width; x++) {
      const srcIdx = srcRowStart + x * info.channels
      const dstIdx = dstRowStart + x * 3
      
      // RGBA to BGR
      pixelData[dstIdx] = data[srcIdx + 2]     // B
      pixelData[dstIdx + 1] = data[srcIdx + 1] // G
      pixelData[dstIdx + 2] = data[srcIdx]     // R
    }
  }

  return Buffer.concat([header, pixelData])
}

/**
 * Main function
 */
const main = async () => {
  console.log('Generating installer assets...')

  // Create directories
  await mkdir(buildDir, { recursive: true })
  await mkdir(iconsDir, { recursive: true })

  // Read source SVG
  const sourceSvg = await readFile(sourceSvgPath, 'utf8')

  // Generate Linux icons
  console.log('Generating Linux icons...')
  for (const size of linuxIconSizes) {
    const pngBuffer = await sharp(Buffer.from(sourceSvg))
      .resize(size, size)
      .png()
      .toBuffer()
    
    await writeFile(join(iconsDir, `${size}x${size}.png`), pngBuffer)
    console.log(`  Created ${size}x${size}.png`)
  }

  // Generate icon.png (1024x1024)
  console.log('Generating icon.png (1024x1024)...')
  const icon1024Buffer = await sharp(Buffer.from(sourceSvg))
    .resize(1024, 1024)
    .png()
    .toBuffer()
  await writeFile(join(buildDir, 'icon.png'), icon1024Buffer)

  // Generate Windows NSIS sidebar (164x314 BMP)
  console.log('Generating installerSidebar.bmp...')
  const sidebarSvg = createSidebarSvg(sourceSvg)
  const sidebarBmp = await svgToBmp(sidebarSvg, 164, 314)
  await writeFile(join(buildDir, 'installerSidebar.bmp'), sidebarBmp)

  // Generate Windows NSIS header (150x57 BMP)
  console.log('Generating installerHeader.bmp...')
  const headerSvg = createHeaderSvg(sourceSvg)
  const headerBmp = await svgToBmp(headerSvg, 150, 57)
  await writeFile(join(buildDir, 'installerHeader.bmp'), headerBmp)

  // Generate macOS DMG backgrounds
  console.log('Generating DMG backgrounds...')
  
  // Normal resolution (540x380)
  const bgSvg = createDmgBackgroundSvg(540, 380)
  const bgPng = await sharp(Buffer.from(bgSvg))
    .resize(540, 380)
    .png()
    .toBuffer()
  await writeFile(join(buildDir, 'background.png'), bgPng)
  console.log('  Created background.png (540x380)')

  // Retina resolution (1080x760)
  const bg2xSvg = createDmgBackgroundSvg(1080, 760)
  const bg2xPng = await sharp(Buffer.from(bg2xSvg))
    .resize(1080, 760)
    .png()
    .toBuffer()
  await writeFile(join(buildDir, 'background@2x.png'), bg2xPng)
  console.log('  Created background@2x.png (1080x760)')

  // Copy existing icon.ico to build folder
  console.log('Copying icon.ico...')
  const iconIcoPath = join(rootDir, 'public', 'app-icons', 'icon.ico')
  const iconIcoBuffer = await readFile(iconIcoPath)
  await writeFile(join(buildDir, 'icon.ico'), iconIcoBuffer)

  console.log('\n✅ All installer assets generated successfully!')
  console.log(`   Build directory: ${buildDir}`)
}

main().catch((error) => {
  console.error('Error generating installer assets:', error)
  process.exit(1)
})
