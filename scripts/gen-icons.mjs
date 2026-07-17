// Generates public/icon-192.png and icon-512.png (volt barbell on near-black)
// with zero dependencies — hand-rolled PNG encoder over node:zlib.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = [250, 247, 242, 255] // warm paper
const INK = [32, 29, 26, 255]
const TERRA = [196, 100, 59, 255]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = (table[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x / size, y / size)
      const off = y * (size * 4 + 1) + 1 + x * 4
      raw[off] = r
      raw[off + 1] = g
      raw[off + 2] = b
      raw[off + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Barbell glyph in normalized [0,1] space
function inRect(u, v, x0, x1, y0, y1) {
  return u >= x0 && u <= x1 && v >= y0 && v <= y1
}
function barbell(u, v) {
  const plateOuterL = inRect(u, v, 0.2, 0.28, 0.28, 0.72)
  const plateOuterR = inRect(u, v, 0.72, 0.8, 0.28, 0.72)
  const plateInnerL = inRect(u, v, 0.31, 0.37, 0.35, 0.65)
  const plateInnerR = inRect(u, v, 0.63, 0.69, 0.35, 0.65)
  if (plateOuterL || plateOuterR || plateInnerL || plateInnerR) return TERRA
  if (inRect(u, v, 0.13, 0.87, 0.465, 0.535)) return INK
  return BG
}

mkdirSync('public', { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(`public/icon-${size}.png`, png(size, barbell))
  console.log(`wrote public/icon-${size}.png`)
}
