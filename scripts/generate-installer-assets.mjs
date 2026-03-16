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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${colors.darkStart}"/>
        <stop offset="100%" stop-color="${colors.darkEnd}"/>
      </linearGradient>
      <linearGradient id="gold" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="${colors.goldLight}"/>
        <stop offset="100%" stop-color="${colors.goldDark}"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    
    <!-- App icon scaled and positioned -->
    <g transform="translate(${(width - 80) / 2}, 60)">
      <svg viewBox="0 0 512 512" width="80" height="80">
        <rect x="216" y="120" width="80" height="130" rx="40" fill="url(#gold)"/>
        <path d="M168 245c0 55 39 100 88 100s88-45 88-100" fill="none" stroke="url(#gold)" stroke-width="24" stroke-linecap="round"/>
        <line x1="256" y1="345" x2="256" y2="392" stroke="url(#gold)" stroke-width="24" stroke-linecap="round"/>
        <line x1="208" y1="392" x2="304" y2="392" stroke="url(#gold)" stroke-width="24" stroke-linecap="round"/>
      </svg>
    </g>
    
    <!-- App name -->
    <text x="${width / 2}" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="${colors.goldLight}">DITADO</text>
    <text x="${width / 2}" y="200" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#888888">AI Dictation</text>
    
    <!-- Decorative line -->
    <line x1="30" y1="220" x2="${width - 30}" y2="220" stroke="${colors.goldDark}" stroke-width="1" opacity="0.5"/>
  </svg>`
}

/**
 * Create the installer header SVG (150x57 px)
 * Small banner with app name
 */
const createHeaderSvg = () => {
  const width = 150
  const height = 57

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0.5" x2="1" y2="0.5">
        <stop offset="0%" stop-color="${colors.darkStart}"/>
        <stop offset="100%" stop-color="${colors.darkEnd}"/>
      </linearGradient>
      <linearGradient id="gold" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="${colors.goldLight}"/>
        <stop offset="100%" stop-color="${colors.goldDark}"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    
    <!-- Small microphone icon -->
    <g transform="translate(12, ${(height - 24) / 2})">
      <svg viewBox="0 0 512 512" width="24" height="24">
        <rect x="216" y="120" width="80" height="130" rx="40" fill="url(#gold)"/>
        <path d="M168 245c0 55 39 100 88 100s88-45 88-100" fill="none" stroke="url(#gold)" stroke-width="24" stroke-linecap="round"/>
        <line x1="256" y1="345" x2="256" y2="392" stroke="url(#gold)" stroke-width="24" stroke-linecap="round"/>
        <line x1="208" y1="392" x2="304" y2="392" stroke="url(#gold)" stroke-width="24" stroke-linecap="round"/>
      </svg>
    </g>
    
    <!-- App name -->
    <text x="45" y="${height / 2 + 5}" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${colors.goldLight}">DITADO</text>
  </svg>`
}

/**
 * Create the DMG background SVG
 * Shows app icon and Applications folder with drag instruction
 */
const createDmgBackgroundSvg = (width, height, isRetina = false) => {
  const scale = isRetina ? 2 : 1
  const iconSize = 96 * scale
  const fontSize = 14 * scale
  const smallFontSize = 12 * scale

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${colors.darkStart}"/>
        <stop offset="100%" stop-color="${colors.darkEnd}"/>
      </linearGradient>
      <linearGradient id="gold" x1="0.5" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stop-color="${colors.goldLight}"/>
        <stop offset="100%" stop-color="${colors.goldDark}"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    
    <!-- App icon (left side) -->
    <g transform="translate(${160 * scale - iconSize / 2}, ${190 * scale - iconSize / 2})">
      <svg viewBox="0 0 512 512" width="${iconSize}" height="${iconSize}">
        <rect width="512" height="512" rx="112" fill="url(#bg)"/>
        <rect x="216" y="120" width="80" height="130" rx="40" fill="url(#gold)"/>
        <path d="M168 245c0 55 39 100 88 100s88-45 88-100" fill="none" stroke="url(#gold)" stroke-width="24" stroke-linecap="round"/>
        <line x1="256" y1="345" x2="256" y2="392" stroke="url(#gold)" stroke-width="24" stroke-linecap="round"/>
        <line x1="208" y1="392" x2="304" y2="392" stroke="url(#gold)" stroke-width="24" stroke-linecap="round"/>
      </svg>
    </g>
    
    <!-- Applications folder icon (right side) - simplified representation -->
    <g transform="translate(${380 * scale - iconSize / 2}, ${190 * scale - iconSize / 2})">
      <rect width="${iconSize}" height="${iconSize}" rx="${12 * scale}" fill="#4a5568"/>
      <rect x="${8 * scale}" y="${8 * scale}" width="${iconSize - 16 * scale}" height="${iconSize - 16 * scale}" rx="${8 * scale}" fill="#2d3748"/>
      <text x="${iconSize / 2}" y="${iconSize / 2 + 6 * scale}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${smallFontSize}" fill="#a0aec0">Apps</text>
    </g>
    
    <!-- Arrow between icons -->
    <g transform="translate(${240 * scale}, ${190 * scale - 10 * scale})">
      <svg width="${80 * scale}" height="${20 * scale}" viewBox="0 0 80 20">
        <line x1="0" y1="10" x2="60" y2="10" stroke="${colors.goldLight}" stroke-width="2" stroke-dasharray="4,2"/>
        <polygon points="60,5 70,10 60,15" fill="${colors.goldLight}"/>
      </svg>
    </g>
    
    <!-- Instruction text -->
    <text x="${width / 2}" y="${320 * scale}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#a0aec0">
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
  const headerSvg = createHeaderSvg()
  const headerBmp = await svgToBmp(headerSvg, 150, 57)
  await writeFile(join(buildDir, 'installerHeader.bmp'), headerBmp)

  // Generate macOS DMG backgrounds
  console.log('Generating DMG backgrounds...')
  
  // Normal resolution (540x380)
  const bgSvg = createDmgBackgroundSvg(540, 380, false)
  const bgPng = await sharp(Buffer.from(bgSvg))
    .resize(540, 380)
    .png()
    .toBuffer()
  await writeFile(join(buildDir, 'background.png'), bgPng)
  console.log('  Created background.png (540x380)')

  // Retina resolution (1080x760)
  const bg2xSvg = createDmgBackgroundSvg(1080, 760, true)
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
