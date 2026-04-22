import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = resolve('.')
const sourceSvg = resolve(root, 'resources', 'nitroflow-logo.svg')
const iconPng = resolve(root, 'resources', 'icon.png')
const iconIco = resolve(root, 'resources', 'icon.ico')

async function run() {
  const svg = await readFile(sourceSvg)

  const pngBuffers = await Promise.all(
    [16, 24, 32, 48, 64, 128, 256].map((size) =>
      sharp(svg).resize(size, size).png().toBuffer()
    )
  )

  // Keep a 512x512 PNG for docs/UI usage.
  const highResPng = await sharp(svg).resize(512, 512).png().toBuffer()
  await writeFile(iconPng, highResPng)

  const icoBuffer = await pngToIco(pngBuffers)
  await writeFile(iconIco, icoBuffer)

  console.log('Generated resources/icon.ico and resources/icon.png from resources/nitroflow-logo.svg')
}

run().catch((error) => {
  console.error('Icon generation failed:', error)
  process.exit(1)
})
