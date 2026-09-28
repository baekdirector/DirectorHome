// DirectorHome 앱 아이콘(파인그린 배경 + 크림 집 실루엣 + 골드 포인트)을 SVG로 그려
// 필요한 모든 크기의 PNG/ICO로 내보낸다. 사진이 아니라 벡터라 소스 이미지 파일이 필요 없다.
//   node scripts/gen-icons.mjs
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'

const PINE = '#123A34'
const PINE_RGB = { r: 0x12, g: 0x3a, b: 0x34 }
const CREAM = '#F4EFE6'
const GOLD = '#B98A3D'

mkdirSync('public/icons', { recursive: true })

/** 100x100 좌표계의 집 실루엣 + 포인트 도트. */
function houseGroup() {
  return `<path d="M50 25 L77 47 V75 H60 V57 H40 V75 H23 V47 Z" fill="${CREAM}"/><circle cx="72" cy="30" r="4.2" fill="${GOLD}"/>`
}

/**
 * @param {number} size
 * @param {{ rounded?: boolean, maskableSafe?: boolean }} [opts]
 *   maskableSafe: true면 안드로이드가 원/둥근사각형으로 밖을 잘라내도 집이 안 잘리도록
 *   중앙 66% 안전영역 안에 넣는다.
 */
function iconSvg(size, { rounded = true, maskableSafe = false } = {}) {
  const r = rounded ? Math.round(size * 0.22) : 0
  const inner = maskableSafe
    ? `<svg x="17%" y="17%" width="66%" height="66%" viewBox="0 0 100 100">${houseGroup()}</svg>`
    : `<svg x="0" y="0" width="100%" height="100%" viewBox="0 0 100 100">${houseGroup()}</svg>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${PINE}"/>${inner}</svg>`
}

async function png(size, opts) {
  return sharp(Buffer.from(iconSvg(size, opts))).png().toBuffer()
}

/** PNG 이미지들을 담은 .ico 파일을 만든다. */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = 6 + entries.length * 16
  const dirs = entries.map(({ size, data }) => {
    const dir = Buffer.alloc(16)
    dir.writeUInt8(size >= 256 ? 0 : size, 0)
    dir.writeUInt8(size >= 256 ? 0 : size, 1)
    dir.writeUInt16LE(1, 4)
    dir.writeUInt16LE(32, 6)
    dir.writeUInt32LE(data.length, 8)
    dir.writeUInt32LE(offset, 12)
    offset += data.length
    return dir
  })
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.data)])
}

const write = (path, data) => {
  writeFileSync(path, data)
  console.log('generated', path)
}

write('public/icons/icon-192.png', await png(192))
write('public/icons/icon-512.png', await png(512))
write('public/icons/apple-touch-icon.png', await png(180, { rounded: false })) // iOS가 알아서 둥글게 처리
write('public/icons/icon-maskable-192.png', await png(192, { maskableSafe: true }))
write('public/icons/icon-maskable-512.png', await png(512, { maskableSafe: true }))

// 파비콘: 작은 크기에서도 잘 보이도록 모서리를 둥글리지 않고 꽉 채운다.
const favSizes = [16, 32, 48]
const favs = await Promise.all(favSizes.map(async (size) => ({ size, data: await png(size, { rounded: false }) })))
write('public/favicon.ico', buildIco(favs))

// 링크 공유(카카오톡 등) 미리보기 이미지 1200x630
const OG_W = 1200
const OG_H = 630
const houseArt = await png(320)
const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
  <style>
    .t { font-family: 'Malgun Gothic', 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif; fill: ${CREAM}; }
  </style>
  <text class="t" x="460" y="330" font-size="88" font-weight="800">DirectorHome</text>
  <text class="t" x="464" y="392" font-size="34" font-weight="700" opacity="0.85">자녀 학습 · 가계부, 한 곳에서</text>
</svg>`)
await sharp({ create: { width: OG_W, height: OG_H, channels: 3, background: PINE_RGB } })
  .composite([
    { input: houseArt, left: 80, top: 155 },
    { input: text, left: 0, top: 0 },
  ])
  .png()
  .toFile('public/og-image.png')
console.log('generated public/og-image.png')
