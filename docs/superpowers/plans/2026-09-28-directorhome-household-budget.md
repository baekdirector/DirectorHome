# DirectorHome 전환 + 가계부(지출관리) 서비스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `JunsVoca`를 `DirectorHome` 브랜드로 리네이밍하고, 그 첫 하위 서비스인 가계부(월별 지출관리)를
완성한다 — 입력 화면, 카테고리 관리, 통계, 비밀번호 접근 제어, 과거 데이터 이전까지 포함.

**Architecture:** 별도 서비스로 분리하지 않고 기존 저장소(React SPA + Express + Postgres, 단일 Cloud
Run 배포)를 확장한다. 가계부 백엔드(스키마 `expense_categories`/`expense_entries`/`expense_settings`,
API `/api/expense/*`)는 이전 세션에 이미 구현되어 작업트리에 커밋되지 않은 채 존재하므로, 이 계획은
그것을 그대로 사용하고 프런트엔드·접근 제어·통계·리브랜딩·과거 데이터 이전만 새로 만든다.

**Tech Stack:** React 19 + React Router 7 + Tailwind v4 (기존), Express 5 + `pg`(기존), `recharts`
(신규 추가, 통계 차트용), `vite-plugin-pwa`(기존, 매니페스트만 교체), `sharp`(기존, 아이콘 생성용).

**Spec:** [docs/superpowers/specs/2026-09-28-directorhome-household-budget-design.md](../specs/2026-09-28-directorhome-household-budget-design.md)

## Global Constraints

- Cloud Run은 새 서비스를 만들고 기존 서비스를 삭제하는 방식으로 교체한다 — URL 변경을 감수하며,
  커스텀 도메인 연결은 이번 범위에서 제외한다. (spec §2)
- 비밀번호는 `HOUSEHOLD_PASSWORD` 환경변수로만 관리하고 소스코드에 하드코딩하지 않는다. (spec §5)
- 접근 허용 토큰의 유효기간은 약 30일(`30 * 24 * 60 * 60 * 1000` ms)이다. (spec §5)
- 지출 항목은 "카테고리 × 연/월" 합계 하나만 입력하며 `(category_id, year, month)`는 upsert된다 —
  이미 구현된 스키마/API를 그대로 쓴다. (spec §3)
- 카테고리 그룹은 `income`/`fixed`/`card`/`utility`/`variable` 5종으로 고정한다. (spec §3, §8)
- 저장은 항목별 자동저장(입력 필드 blur 시)이며 별도 "저장" 버튼을 두지 않는다. (spec §4)
- 한글 텍스트에는 라틴 세리프를 절대 섞지 않는다 — `Noto Sans KR`만 사용한다(세리프를 섞으면 시스템
  폴백으로 궁서체처럼 보이는 문제가 실제로 확인됨). (spec §8)
- 지출 목록은 카드형 그리드가 아니라 장부형 리스트(왼쪽 3px 색상 바 + 얇은 구분선)로 만든다. (spec §8)
- 골드 포인트 도트(`#B98A3D`)는 화면마다 딱 한 번만 반복되는 강조 모티프로 쓴다. (spec §8)
- 과거 데이터 이전은 1회성 스크립트로만 만들고 상시 기능으로 앱에 노출하지 않는다. (spec §7)
- 과거 재무 수치가 담긴 실제 데이터 파일(연/월/금액)은 git에 커밋하지 않는다 — 로컬 전용 파일로
  두고 `.gitignore`에 등록한다 (개인 재무정보 보호를 위한 추가 안전장치).

## Review Focus

- 지출 금액 입력칸을 빈 값으로 지운 채 포커스를 벗어나는 경우 — 크래시 없이 0으로 저장돼야 한다 (Task 6 테스트).
- 이미 콤마·"원" 단위가 붙은 값 위에 이어서 타이핑하는 경우 — 숫자만 정확히 추출돼야 한다 (Task 6 테스트).
- 가계부 비밀번호를 여러 번 틀리는 경우 — 매번 인라인 에러만 뜨고 잠기거나 크래시하지 않아야 한다 (Task 5 테스트 + Task 7 수동 확인).
- 접근 토큰이 정확히 만료 시각을 지난 경우 — 다시 비밀번호를 요구해야 한다 (Task 7 테스트).
- 해당 연도에 입력된 데이터가 하나도 없는 새 연도로 전환하는 경우 — 통계 화면이 에러 없이 0으로 채워진 빈 차트를 보여줘야 한다 (Task 10, `npm run dev`로 수동 확인).

---

## Task 1: 가계부 색상 토큰 추가

**Files:**
- Modify: `src/index.css:29-31` (기존 `--color-gold-tint` 다음 줄에 추가)

**Interfaces:**
- Produces: Tailwind 유틸리티 `bg-hh-pine`, `text-hh-pine`, `bg-hh-pine-tint`, `bg-hh-clay`,
  `bg-hh-clay-tint`, `bg-hh-gold`, `bg-hh-gold-tint`, `text-hh-neutral`, `bg-hh-neutral`,
  `border-hh-divider` 등 — 이후 모든 가계부 화면이 이 토큰만 사용한다.

- [ ] **Step 1: 토큰 추가**

`src/index.css`의 `--color-gold-tint: #fbf1da;` 줄 바로 다음에 추가:

```css
  --color-hh-pine: #123A34;
  --color-hh-pine-tint: #E3E7E1;
  --color-hh-clay: #A2432E;
  --color-hh-clay-tint: #F3DFD8;
  --color-hh-gold: #B98A3D;
  --color-hh-gold-tint: #F4E9D2;
  --color-hh-neutral: #8a8674;
  --color-hh-divider: #eee7d6;
```

- [ ] **Step 2: 확인**

`npm run dev` 실행 후 아무 페이지나 열어 콘솔에 CSS 에러가 없는지 확인. Tailwind는 `@theme`의
`--color-*` 키로 유틸리티를 자동 생성하므로 별도 빌드 설정 변경은 필요 없다.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: 가계부 모듈용 색상 토큰 추가(pine/clay/gold/neutral)"
```

---

## Task 2: 앱 아이콘을 DirectorHome 아이콘으로 교체

기존 `scripts/gen-icons.mjs`는 사진(`icon-source.jpg`)에서 얼굴을 잘라내는 방식이라 이번에
승인된 벡터 아이콘(파인그린 배경 + 크림 집 실루엣 + 골드 포인트)과 맞지 않는다. 스크립트를
SVG 기반으로 다시 작성한다.

**Files:**
- Modify: `scripts/gen-icons.mjs` (전체 재작성)
- Delete: `scripts/icon-source.jpg` (더 이상 사용하지 않음)
- Create (스크립트 실행 결과): `public/icons/icon-192.png`, `public/icons/icon-512.png`,
  `public/icons/apple-touch-icon.png`, `public/icons/icon-maskable-192.png`,
  `public/icons/icon-maskable-512.png`, `public/favicon.ico`, `public/og-image.png`

- [ ] **Step 1: `scripts/gen-icons.mjs`를 아래 내용으로 전체 교체**

```js
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
```

- [ ] **Step 2: 스크립트 실행**

Run: `node scripts/gen-icons.mjs`
Expected: `generated public/icons/icon-192.png` 등 7개 파일 경로가 순서대로 출력됨, 에러 없음.

- [ ] **Step 3: 결과 눈으로 확인**

`public/icons/icon-512.png`와 `public/og-image.png`를 이미지 뷰어로 열어 파인그린 배경 +
크림색 집 실루엣 + 우측 상단 골드 점이 의도대로 보이는지 확인한다.

- [ ] **Step 4: 옛 소스 이미지 제거 및 커밋**

```bash
git rm scripts/icon-source.jpg
git add scripts/gen-icons.mjs public/icons public/favicon.ico public/og-image.png
git commit -m "feat: DirectorHome 브랜드 아이콘으로 교체(벡터 기반 생성 스크립트)"
```

---

## Task 3: 앱 이름/메타데이터 리브랜딩

**Files:**
- Modify: `package.json:2`
- Modify: `index.html` (title, meta 태그 여러 곳)
- Modify: `vite.config.ts` (PWA manifest)
- Modify: `server/index.js` (시작 로그 메시지)
- Modify: `README.md:1`
- Modify: `render.yaml:3`
- Modify: `.env.example`

**Interfaces:**
- Consumes: 없음 (순수 설정/텍스트 변경)
- Produces: 없음 (런타임 동작 변화 없음, 표시 문구만 변경)

- [ ] **Step 1: `package.json` 이름 변경**

`"name": "junsvoca"` → `"name": "directorhome"`

- [ ] **Step 2: `index.html` 메타데이터 변경**

다음 교체를 적용:
- `<meta name="theme-color" content="#1F6F6B" />` → `<meta name="theme-color" content="#123A34" />`
- `<meta property="og:site_name" content="JunsVoca" />` → `<meta property="og:site_name" content="DirectorHome" />`
- `<meta property="og:title" content="JunsVoca - 초등 영어 단어 테스트" />` →
  `<meta property="og:title" content="DirectorHome - 자녀 학습 · 가계부" />`
- `<meta property="og:description" content="단어장을 만들고, 시험 보고, 틀린 단어는 오답 노트로 복습해요." />` →
  `<meta property="og:description" content="자녀 영단어 학습과 우리 집 가계부를 한 곳에서 관리해요." />`
- `<meta property="og:image" content="https://junsvoca.onrender.com/og-image.png" />` →
  `<meta property="og:image" content="https://directorhome.onrender.com/og-image.png" />`
- `<meta name="apple-mobile-web-app-title" content="JunsVoca" />` →
  `<meta name="apple-mobile-web-app-title" content="DirectorHome" />`
- `<title>JunsVoca</title>` → `<title>DirectorHome</title>`
- `<meta name="description" content="영어 단어와 숙어를 입력해 단어장을 만들고, 스펠링·뜻 쓰기 퀴즈로 학습하는 앱" />` →
  `<meta name="description" content="자녀 영단어 학습과 우리 집 가계부를 한 곳에서 관리하는 가족용 앱" />`

- [ ] **Step 3: `vite.config.ts`의 PWA manifest 변경**

```ts
      manifest: {
        name: 'DirectorHome',
        short_name: 'DirectorHome',
        description: '자녀 영단어 학습과 우리 집 가계부를 한 곳에서 관리하는 가족용 앱',
        theme_color: '#123A34',
        background_color: '#FAF7F0',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
```

(icons 배열 자체는 파일명이 그대로라 변경 없음. `name`/`short_name`/`description`/`theme_color`만 교체.)

- [ ] **Step 4: `server/index.js` 로그 메시지 변경**

`console.log(\`JunsVoca server listening on :${port}\`)` →
`console.log(\`DirectorHome server listening on :${port}\`)`

- [ ] **Step 5: `README.md` 첫 줄 변경**

`# JunsVoca` → `# DirectorHome`

`# DirectorHome` 다음 줄에 한 문단 추가:

```markdown

`DirectorHome`은 가족용 서비스를 담는 우산 프로젝트입니다. 첫 서비스는 자녀 영단어 학습(JunsVoca,
아래 설명)이고, 두 번째로 가계부(월별 지출관리)가 추가되었습니다. 가계부는 홈 화면의 "가계부"
메뉴에서 비밀번호로 접근합니다.
```

- [ ] **Step 6: `render.yaml` 서비스명 변경**

`name: junsvoca` → `name: directorhome`

- [ ] **Step 7: `.env.example`에 비밀번호 변수 추가**

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
PORT=3000
HOUSEHOLD_PASSWORD=change-me
```

- [ ] **Step 8: 빌드 확인**

Run: `npm run build`
Expected: 에러 없이 `dist/` 생성됨 (이름/메타데이터만 바꿨으므로 타입/빌드 오류가 없어야 함).

- [ ] **Step 9: Commit**

```bash
git add package.json index.html vite.config.ts server/index.js README.md render.yaml .env.example
git commit -m "feat: 앱 이름/메타데이터를 DirectorHome으로 리브랜딩"
```

---

## Task 4: Cloud Run 신규 배포 + GitHub 저장소 리네임 런북 (수동 실행)

이 태스크는 `gcloud`/`gh` CLI 권한이 있는 사람(사용자 본인)이 직접 실행해야 한다 — 이 코드 작성
환경에는 두 CLI가 모두 없고, 살아있는 프로덕션 서비스를 삭제하는 되돌리기 어려운 작업이라 자동
실행 대상이 아니다. Task 1~3의 커밋이 먼저 반영된 뒤 실행한다.

**Files:** 없음 (인프라 작업, 코드 변경 없음)

- [ ] **Step 1: 새 Cloud Run 서비스 배포**

```bash
gcloud run deploy directorhome \
  --source . \
  --region asia-northeast1 \
  --project <실제 GCP 프로젝트 ID> \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="<기존 junsvoca 서비스와 동일한 값>",HOUSEHOLD_PASSWORD="admin/017hand!"
```

- [ ] **Step 2: 새 서비스 정상 동작 확인**

```bash
curl https://<새로 발급된 directorhome URL>/healthz
curl https://<새로 발급된 directorhome URL>/api/version
```

Expected: `/healthz`는 `ok`, `/api/version`은 `{"platform":"cloud-run", ...}` 형태 JSON.

- [ ] **Step 3: `index.html`의 `og:image`를 실제 발급된 URL로 필요 시 수정**

Task 3에서 잠정적으로 `https://directorhome.onrender.com/og-image.png`로 넣어뒀는데, Render를
실제로 쓰지 않는다면 이 단계에서 방금 확인한 Cloud Run URL(`https://directorhome-xxxx.../og-image.png`)로
바꾸고 다시 빌드·배포한다.

- [ ] **Step 4: 기존 `junsvoca` Cloud Run 서비스 삭제**

새 서비스가 문제없이 동작하는 것을 확인한 뒤에만 실행:

```bash
gcloud run services delete junsvoca --region asia-northeast1 --project <실제 GCP 프로젝트 ID>
```

- [ ] **Step 5: GitHub 저장소 이름 변경**

```bash
gh repo rename DirectorHome --repo baekdirector/JunsVoca
```

(`gh` CLI가 없다면 GitHub 웹의 저장소 Settings > Rename에서 동일하게 처리 가능.)

- [ ] **Step 6: 로컬 저장소 원격 주소 갱신**

```bash
git remote set-url origin https://github.com/baekdirector/DirectorHome.git
git remote -v
```

Expected: `origin`이 새 저장소 주소를 가리킴.

- [ ] **Step 7: 자녀 기기에 새 PWA 재설치 안내**

기존에 홈 화면에 설치된 JunsVoca 아이콘은 끊어진 URL을 가리키게 된다. 새 URL로 브라우저에서
접속 후 "홈 화면에 추가"를 다시 실행해야 한다는 점을 자녀들에게 안내한다.

---

## Task 5: 비밀번호 검증 API

**Files:**
- Modify: `server/routes.js` (라우트 추가)
- Create: `server/routes.test.js`

**Interfaces:**
- Produces: `POST /api/expense/verify-password` — body `{ password: string }` → `{ ok: boolean }`.
  DB를 전혀 건드리지 않는다(환경변수 비교만). `HOUSEHOLD_PASSWORD`가 설정 안 돼 있으면 500.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `server/routes.test.js`:

```js
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import { router } from './routes.js'

describe('POST /expense/verify-password', () => {
  let server
  let baseUrl

  beforeAll(() => {
    process.env.HOUSEHOLD_PASSWORD = 'admin/017hand!'
    const app = express()
    app.use(express.json())
    app.use('/api', router)
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  it('올바른 비밀번호면 ok: true', async () => {
    const res = await fetch(`${baseUrl}/expense/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'admin/017hand!' }),
    })
    expect(await res.json()).toEqual({ ok: true })
  })

  it('틀린 비밀번호면 ok: false (에러 아님)', async () => {
    const res = await fetch(`${baseUrl}/expense/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run server/routes.test.js`
Expected: FAIL (`/expense/verify-password` 라우트가 없어 404).

- [ ] **Step 3: 라우트 구현**

`server/routes.js`의 가계부 라우트 블록(`// ---- household expense tracker ----` 아래) 맨 앞에 추가:

```js
// 로그인 시스템이 아니라 '가계부' 메뉴 진입용 비밀번호 확인만 한다. DB는 쓰지 않는다.
router.post('/expense/verify-password', (req, res) => {
  const { password } = req.body
  const expected = process.env.HOUSEHOLD_PASSWORD
  if (!expected) {
    return res.status(500).json({ error: 'HOUSEHOLD_PASSWORD is not configured' })
  }
  res.json({ ok: password === expected })
})
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run server/routes.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/routes.js server/routes.test.js
git commit -m "feat: 가계부 비밀번호 검증 API 추가"
```

---

## Task 6: 가계부 클라이언트 API 모듈 + 금액 포맷 유틸

**Files:**
- Create: `src/lib/household.ts`
- Create: `src/lib/household.test.ts`

**Interfaces:**
- Consumes: `/api/expense/*` (Task 5 포함, 이미 구현된 백엔드)
- Produces: `ExpenseCategory`, `ExpenseEntry`, `ExpenseSettings`, `ExpenseSummary`, `ExpenseGroup` 타입;
  `getCategories`, `createCategory`, `updateCategory`, `getEntries`, `putEntry`, `getSettings`,
  `putSettings`, `getSummary`, `verifyPassword`, `formatWon`, `parseWonInput`, `isAccessTokenValid`,
  `findMonthSummary` 함수 — Task 7~10이 이 이름/시그니처를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `src/lib/household.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatWon, isAccessTokenValid, parseWonInput, findMonthSummary } from './household'

describe('formatWon', () => {
  it('천단위 콤마를 붙인다', () => {
    expect(formatWon(1234567)).toBe('1,234,567')
  })
  it('0은 그대로 0', () => {
    expect(formatWon(0)).toBe('0')
  })
})

describe('parseWonInput', () => {
  it('콤마·원 단위가 섞인 문자열에서 숫자만 뽑는다', () => {
    expect(parseWonInput('1,234,567원')).toBe(1234567)
  })
  it('숫자가 없으면 0을 반환한다(빈 문자열 포함)', () => {
    expect(parseWonInput('')).toBe(0)
    expect(parseWonInput('원')).toBe(0)
  })
})

describe('isAccessTokenValid', () => {
  it('저장된 값이 없으면 false', () => {
    expect(isAccessTokenValid(null, Date.now())).toBe(false)
  })
  it('만료 전이면 true', () => {
    expect(isAccessTokenValid(String(Date.now() + 1000), Date.now())).toBe(true)
  })
  it('만료 시각을 정확히 지났으면 false', () => {
    const now = Date.now()
    expect(isAccessTokenValid(String(now - 1), now)).toBe(false)
  })
})

describe('findMonthSummary', () => {
  it('해당 연도에 데이터가 하나도 없으면 undefined를 반환한다(에러 아님)', () => {
    expect(findMonthSummary({ months: [], openingBalance: 0 }, 9)).toBeUndefined()
  })
  it('월이 일치하는 항목을 찾는다', () => {
    const summary = {
      months: [{ year: 2026, month: 9, income: 0, cardTotal: 0, fixedTotal: 0, utilityTotal: 0, variableTotal: 0, expenseTotal: 0, net: 0, balance: 1000 }],
      openingBalance: 0,
    }
    expect(findMonthSummary(summary, 9)?.balance).toBe(1000)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/household.test.ts`
Expected: FAIL (`./household` 모듈이 아직 없음)

- [ ] **Step 3: `src/lib/household.ts` 구현**

```ts
// 가계부 API(server/routes.js, /api/expense/*)를 위한 얇은 REST 클라이언트 + 순수 유틸.

export type ExpenseGroup = 'income' | 'fixed' | 'card' | 'utility' | 'variable'

export interface ExpenseCategory {
  id: number
  name: string
  groupType: ExpenseGroup
  displayOrder: number
  createdAt: number
  archivedAt: number | null
}

export interface ExpenseEntry {
  id: number
  categoryId: number
  year: number
  month: number
  amount: number
  memo: string | null
  updatedAt: number
}

export interface ExpenseSettings {
  openingYear: number
  openingMonth: number
  openingBalance: number
}

export interface ExpenseMonthSummary {
  year: number
  month: number
  income: number
  cardTotal: number
  fixedTotal: number
  utilityTotal: number
  variableTotal: number
  expenseTotal: number
  net: number
  balance: number
}

export interface ExpenseSummary {
  months: ExpenseMonthSummary[]
  openingBalance: number
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/expense${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  return res.json()
}

export const getCategories = () => api<ExpenseCategory[]>('/categories')

export const createCategory = (input: { name: string; groupType: ExpenseGroup; displayOrder?: number }) =>
  api<{ id: number }>('/categories', { method: 'POST', body: JSON.stringify(input) })

export const updateCategory = (
  id: number,
  input: Partial<{ name: string; groupType: ExpenseGroup; displayOrder: number; archived: boolean }>,
) => api<{ ok: true }>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) })

export const getEntries = (year: number) => api<ExpenseEntry[]>(`/entries?year=${year}`)

export const putEntry = (input: { categoryId: number; year: number; month: number; amount: number; memo?: string }) =>
  api<{ id: number }>('/entries', { method: 'PUT', body: JSON.stringify(input) })

export const getSettings = () => api<ExpenseSettings | null>('/settings')

export const putSettings = (input: ExpenseSettings) =>
  api<{ ok: true }>('/settings', { method: 'PUT', body: JSON.stringify(input) })

export const getSummary = (year: number) => api<ExpenseSummary>(`/summary?year=${year}`)

export const verifyPassword = (password: string) =>
  api<{ ok: boolean }>('/verify-password', { method: 'POST', body: JSON.stringify({ password }) })

/** "1234567" -> "1,234,567". 가계부 금액은 항상 0 이상 정수로 다룬다. */
export function formatWon(amount: number): string {
  return Math.round(amount).toLocaleString('ko-KR')
}

/** 콤마/"원" 단위가 섞인 입력 문자열에서 숫자만 뽑아 정수로 되돌린다. 숫자가 없으면 0. */
export function parseWonInput(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, '')
  return digits === '' ? 0 : parseInt(digits, 10)
}

/** localStorage에 저장된 만료 시각 문자열이 아직 유효한지 확인한다. */
export function isAccessTokenValid(storedUntil: string | null, now: number): boolean {
  if (!storedUntil) return false
  const until = Number(storedUntil)
  return Number.isFinite(until) && until > now
}

/** summary.months에서 해당 월을 찾는다. 데이터가 없는 연도로 전환해도 undefined만 반환하고 던지지 않는다. */
export function findMonthSummary(summary: ExpenseSummary, month: number): ExpenseMonthSummary | undefined {
  return summary.months.find((m) => m.month === month)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/household.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/household.ts src/lib/household.test.ts
git commit -m "feat: 가계부 API 클라이언트 및 금액 포맷 유틸 추가"
```

---

## Task 7: 접근 게이트 컴포넌트 (비밀번호 팝업)

**Files:**
- Create: `src/components/PasswordGateDialog.tsx`
- Create: `src/components/HouseholdGate.tsx`

**Interfaces:**
- Consumes: `verifyPassword`, `isAccessTokenValid` (Task 6)
- Produces: `<HouseholdGate>{children}</HouseholdGate>` — Task 8~10의 각 가계부 페이지가 이
  컴포넌트로 감싸서 접근을 제어한다.

- [ ] **Step 1: `src/components/PasswordGateDialog.tsx` 작성**

기존 `ConfirmDialog.tsx`(브라우저 기본 `confirm()` 대신 쓰는 커스텀 팝업)와 같은 바텀시트 패턴을
따르되, 비밀번호 입력 필드와 에러 상태를 추가한다:

```tsx
import { useState } from 'react'

/** 브라우저 기본 prompt() 대신 쓰는, 가계부 진입용 비밀번호 팝업. */
export function PasswordGateDialog({
  verify,
  onSuccess,
  onCancel,
}: {
  verify: (password: string) => Promise<{ ok: boolean }>
  onSuccess: () => void
  onCancel: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function submit() {
    if (checking || password === '') return
    setChecking(true)
    setError(null)
    try {
      const { ok } = await verify(password)
      if (ok) onSuccess()
      else setError('비밀번호가 올바르지 않아요.')
    } catch {
      setError('확인 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div
      role="presentation"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-5 pb-8 sm:items-center sm:pb-0"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="가계부 비밀번호"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[360px] rounded-[22px] border-t-4 border-hh-gold bg-surface p-5 shadow-lg"
      >
        <h3 className="m-0 text-[16.5px] font-bold">가계부 비밀번호</h3>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-muted">가족만 볼 수 있는 공간이에요.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="비밀번호"
          className="mt-4 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-[15px]"
        />
        {error && <p className="m-0 mt-2 text-[13px] text-error">{error}</p>}
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-border bg-surface p-3 text-[14px] font-semibold text-ink"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={checking || password === ''}
            className="flex-1 rounded-2xl bg-hh-pine p-3 text-[14px] font-bold text-white disabled:opacity-50"
          >
            {checking ? '확인 중...' : '입장하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `src/components/HouseholdGate.tsx` 작성**

```tsx
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PasswordGateDialog } from './PasswordGateDialog'
import { isAccessTokenValid, verifyPassword } from '../lib/household'

const TOKEN_KEY = 'hh_access_until'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function hasValidAccess(): boolean {
  return isAccessTokenValid(localStorage.getItem(TOKEN_KEY), Date.now())
}

/** 가계부 화면을 감싸는 접근 게이트. 유효한 토큰이 없으면 비밀번호 팝업을 띄운다. */
export function HouseholdGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(hasValidAccess)
  const navigate = useNavigate()

  if (unlocked) return <>{children}</>

  return (
    <PasswordGateDialog
      verify={verifyPassword}
      onSuccess={() => {
        localStorage.setItem(TOKEN_KEY, String(Date.now() + THIRTY_DAYS_MS))
        setUnlocked(true)
      }}
      onCancel={() => navigate('/')}
    />
  )
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc -b --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/components/PasswordGateDialog.tsx src/components/HouseholdGate.tsx
git commit -m "feat: 가계부 비밀번호 접근 게이트 컴포넌트 추가"
```

---

## Task 8: 가계부 입력 화면

**Files:**
- Create: `src/pages/Household.tsx`
- Create: `src/components/HouseholdNav.tsx`

**Interfaces:**
- Consumes: `HouseholdGate` (Task 7), `getCategories/getEntries/getSummary/putEntry/formatWon/parseWonInput/findMonthSummary` (Task 6)
- Produces: `<Household />` 페이지 컴포넌트, `<HouseholdNav />` (Task 9·10도 재사용)

- [ ] **Step 1: `src/components/HouseholdNav.tsx` 작성**

```tsx
import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/household', label: '입력' },
  { to: '/household/stats', label: '통계' },
  { to: '/household/categories', label: '관리' },
]

export function HouseholdNav() {
  const { pathname } = useLocation()
  return (
    <div className="flex items-center gap-3 border-b border-hh-divider bg-surface px-[22px] pt-4">
      <Link to="/" className="mr-1 pb-3 text-[13px] font-semibold text-ink-muted">
        ← 홈
      </Link>
      {TABS.map((tab) => {
        const active = pathname === tab.to
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`border-b-2 px-1 pb-3 text-[14px] font-semibold ${
              active ? 'border-hh-pine text-hh-pine' : 'border-transparent text-ink-muted'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: `src/pages/Household.tsx` 작성**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { HouseholdGate } from '../components/HouseholdGate'
import { HouseholdNav } from '../components/HouseholdNav'
import {
  formatWon,
  findMonthSummary,
  getCategories,
  getEntries,
  getSummary,
  parseWonInput,
  putEntry,
  type ExpenseCategory,
  type ExpenseEntry,
  type ExpenseGroup,
  type ExpenseSummary,
} from '../lib/household'

const GROUP_ORDER: ExpenseGroup[] = ['income', 'fixed', 'card', 'utility', 'variable']
const GROUP_LABEL: Record<ExpenseGroup, string> = {
  income: '수입',
  fixed: '고정비',
  card: '카드',
  utility: '통신·공과',
  variable: '기타변동',
}
const GROUP_BAR_CLASS: Record<ExpenseGroup, string> = {
  income: 'bg-hh-gold',
  fixed: 'bg-hh-pine',
  card: 'bg-hh-clay',
  utility: 'bg-primary',
  variable: 'bg-hh-neutral',
}

export function Household() {
  return (
    <HouseholdGate>
      <HouseholdContent />
    </HouseholdGate>
  )
}

function HouseholdContent() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null)
  const [entries, setEntries] = useState<ExpenseEntry[] | null>(null)
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [inputs, setInputs] = useState<Record<number, string>>({})

  useEffect(() => {
    getCategories().then(setCategories)
  }, [])

  useEffect(() => {
    getEntries(year).then(setEntries)
    getSummary(year).then(setSummary)
  }, [year])

  useEffect(() => {
    if (!entries) return
    const byCategory: Record<number, string> = {}
    for (const e of entries) {
      if (e.month === month) byCategory[e.categoryId] = formatWon(e.amount)
    }
    setInputs(byCategory)
  }, [entries, month])

  const activeByGroup = useMemo(() => {
    const groups: Record<ExpenseGroup, ExpenseCategory[]> = { income: [], fixed: [], card: [], utility: [], variable: [] }
    for (const c of categories ?? []) {
      if (c.archivedAt) continue
      groups[c.groupType].push(c)
    }
    for (const g of GROUP_ORDER) groups[g].sort((a, b) => a.displayOrder - b.displayOrder)
    return groups
  }, [categories])

  const monthSummary = summary ? findMonthSummary(summary, month) : undefined

  async function saveEntry(categoryId: number, raw: string) {
    const amount = parseWonInput(raw)
    setInputs((prev) => ({ ...prev, [categoryId]: formatWon(amount) }))
    await putEntry({ categoryId, year, month, amount })
    getSummary(year).then(setSummary)
  }

  if (!categories || !entries) {
    return (
      <div className="flex min-h-svh flex-col bg-bg">
        <HouseholdNav />
        <div className="flex flex-1 items-center justify-center text-ink-muted">불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <HouseholdNav />
      <div className="flex-1 px-[22px] pb-8">
        <div className="flex items-center gap-2 pt-5">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-border bg-surface px-2 py-1 text-[14px] font-semibold"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
                onClick={() => setMonth(m)}
                className={`flex-none rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                  m === month ? 'bg-hh-pine text-white' : 'bg-surface text-ink-muted'
                }`}
              >
                {m}월
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-[18px] border-t-4 border-hh-gold bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
            {year}년 {month}월
            <span className="h-1.5 w-1.5 rounded-full bg-hh-gold" />
          </div>
          <div className="mt-2 text-[38px] font-extrabold tracking-tight text-hh-pine">
            {formatWon(monthSummary?.balance ?? 0)}
            <span className="ml-1 text-[20px] font-semibold text-ink-muted">원</span>
          </div>
          <div className="mt-1 text-[14px] font-medium text-ink-muted">이번 달 남은 돈</div>
        </div>

        {GROUP_ORDER.map((group) => (
          <div key={group} className="mt-5">
            <div className="mb-1 text-[13px] font-semibold text-ink-muted">{GROUP_LABEL[group]}</div>
            {activeByGroup[group].length === 0 && (
              <p className="m-0 py-2 text-[13px] text-ink-muted">등록된 항목이 없어요.</p>
            )}
            {activeByGroup[group].map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 border-b border-hh-divider py-3.5">
                <div className={`h-8 w-[3px] flex-none rounded-full ${GROUP_BAR_CLASS[group]}`} />
                <div className="flex-1 text-[15px] font-medium">{cat.name}</div>
                <input
                  inputMode="numeric"
                  value={inputs[cat.id] ?? ''}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => saveEntry(cat.id, e.target.value)}
                  placeholder="0"
                  className="w-[120px] bg-transparent text-right text-[16px] font-semibold tabular-nums outline-none"
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc -b --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Household.tsx src/components/HouseholdNav.tsx
git commit -m "feat: 가계부 입력 화면 추가"
```

---

## Task 9: 카테고리 관리 화면

**Files:**
- Create: `src/pages/HouseholdCategories.tsx`

**Interfaces:**
- Consumes: `HouseholdGate`, `HouseholdNav`, `getCategories/createCategory/updateCategory` (Task 6~8)

- [ ] **Step 1: `src/pages/HouseholdCategories.tsx` 작성**

```tsx
import { useEffect, useState } from 'react'
import { HouseholdGate } from '../components/HouseholdGate'
import { HouseholdNav } from '../components/HouseholdNav'
import { createCategory, getCategories, updateCategory, type ExpenseCategory, type ExpenseGroup } from '../lib/household'

const GROUP_OPTIONS: { value: ExpenseGroup; label: string }[] = [
  { value: 'income', label: '수입' },
  { value: 'fixed', label: '고정비' },
  { value: 'card', label: '카드' },
  { value: 'utility', label: '통신·공과' },
  { value: 'variable', label: '기타변동' },
]

export function HouseholdCategories() {
  return (
    <HouseholdGate>
      <CategoriesContent />
    </HouseholdGate>
  )
}

function CategoriesContent() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [name, setName] = useState('')
  const [groupType, setGroupType] = useState<ExpenseGroup>('variable')

  const reload = () => getCategories().then(setCategories)
  useEffect(() => {
    reload()
  }, [])

  async function add() {
    if (!name.trim()) return
    await createCategory({ name: name.trim(), groupType })
    setName('')
    reload()
  }

  async function toggleArchive(cat: ExpenseCategory) {
    await updateCategory(cat.id, { archived: !cat.archivedAt })
    reload()
  }

  async function move(cat: ExpenseCategory, direction: -1 | 1) {
    const siblings = categories
      .filter((c) => c.groupType === cat.groupType && !c.archivedAt)
      .sort((a, b) => a.displayOrder - b.displayOrder)
    const index = siblings.findIndex((c) => c.id === cat.id)
    const target = siblings[index + direction]
    if (!target) return
    await Promise.all([
      updateCategory(cat.id, { displayOrder: target.displayOrder }),
      updateCategory(target.id, { displayOrder: cat.displayOrder }),
    ])
    reload()
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <HouseholdNav />
      <div className="flex-1 px-[22px] pb-8">
        <h1 className="pt-5 text-[20px] font-extrabold">카테고리 관리</h1>

        <div className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 항목 이름"
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-[14px]"
          />
          <select
            value={groupType}
            onChange={(e) => setGroupType(e.target.value as ExpenseGroup)}
            className="rounded-xl border border-border bg-surface px-2 py-2 text-[14px]"
          >
            {GROUP_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <button onClick={add} className="rounded-xl bg-hh-pine px-4 py-2 text-[14px] font-bold text-white">
            추가
          </button>
        </div>

        {GROUP_OPTIONS.map(({ value, label }) => (
          <div key={value} className="mt-5">
            <div className="mb-1 text-[13px] font-semibold text-ink-muted">{label}</div>
            {categories
              .filter((c) => c.groupType === value)
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 border-b border-hh-divider py-3">
                  <span className={`flex-1 text-[15px] ${cat.archivedAt ? 'text-ink-muted line-through' : ''}`}>
                    {cat.name}
                  </span>
                  <button onClick={() => move(cat, -1)} className="px-1 text-ink-muted" aria-label="위로">
                    ▲
                  </button>
                  <button onClick={() => move(cat, 1)} className="px-1 text-ink-muted" aria-label="아래로">
                    ▼
                  </button>
                  <button
                    onClick={() => toggleArchive(cat)}
                    className="rounded-lg border border-border px-2.5 py-1 text-[12.5px] font-semibold"
                  >
                    {cat.archivedAt ? '복원' : '숨기기'}
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc -b --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add src/pages/HouseholdCategories.tsx
git commit -m "feat: 가계부 카테고리 관리 화면 추가"
```

---

## Task 10: 통계 화면 (라인/도넛/막대 차트)

**Files:**
- Modify: `package.json` (`recharts` 의존성 추가)
- Create: `src/pages/HouseholdStats.tsx`

**Interfaces:**
- Consumes: `HouseholdGate`, `HouseholdNav`, `getSummary` (Task 6~8)

- [ ] **Step 1: `recharts` 설치**

Run: `npm install recharts@^2.15.0`
Expected: `package.json`의 `dependencies`에 `"recharts": "^2.15.0"`(또는 설치된 버전)이 추가됨.

- [ ] **Step 2: `src/pages/HouseholdStats.tsx` 작성**

```tsx
import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { HouseholdGate } from '../components/HouseholdGate'
import { HouseholdNav } from '../components/HouseholdNav'
import { getSummary, type ExpenseSummary } from '../lib/household'

const COLOR = { income: '#B98A3D', fixed: '#123A34', card: '#A2432E', utility: '#1f6f6b', variable: '#8a8674' }

export function HouseholdStats() {
  return (
    <HouseholdGate>
      <StatsContent />
    </HouseholdGate>
  )
}

function StatsContent() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)

  useEffect(() => {
    getSummary(year).then(setSummary)
  }, [year])

  const trendData = useMemo(
    () =>
      (summary?.months ?? []).map((m) => ({
        month: `${m.month}월`,
        고정비: m.fixedTotal,
        카드: m.cardTotal,
        '통신·공과': m.utilityTotal,
        기타변동: m.variableTotal,
      })),
    [summary],
  )

  const latestMonth = summary?.months[summary.months.length - 1]
  const shareData = latestMonth
    ? [
        { name: '고정비', value: latestMonth.fixedTotal, color: COLOR.fixed },
        { name: '카드', value: latestMonth.cardTotal, color: COLOR.card },
        { name: '통신·공과', value: latestMonth.utilityTotal, color: COLOR.utility },
        { name: '기타변동', value: latestMonth.variableTotal, color: COLOR.variable },
      ].filter((d) => d.value > 0)
    : []

  const flowData = (summary?.months ?? []).map((m) => ({ month: `${m.month}월`, 수입: m.income, 지출: m.expenseTotal }))

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <HouseholdNav />
      <div className="flex-1 px-[22px] pb-8">
        <div className="flex items-center gap-2 pt-5">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-border bg-surface px-2 py-1 text-[14px] font-semibold"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </div>

        <section className="mt-5 rounded-[18px] bg-surface p-4">
          <h2 className="m-0 mb-2 text-[15px] font-bold">월별 추이</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid stroke="#eee7d6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={48} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="고정비" stroke={COLOR.fixed} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="카드" stroke={COLOR.card} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="통신·공과" stroke={COLOR.utility} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="기타변동" stroke={COLOR.variable} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section className="rounded-[18px] bg-surface p-4">
            <h2 className="m-0 mb-2 text-[15px] font-bold">이번 달 비중</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={shareData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {shareData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </section>

          <section className="rounded-[18px] bg-surface p-4">
            <h2 className="m-0 mb-2 text-[15px] font-bold">수입 vs 지출</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={flowData}>
                <CartesianGrid stroke="#eee7d6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={48} />
                <Tooltip />
                <Legend />
                <Bar dataKey="수입" fill={COLOR.income} radius={[4, 4, 0, 0]} />
                <Bar dataKey="지출" fill={COLOR.card} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 수동 확인 (Review Focus 5번 항목)**

Run: `npm run dev`, 브라우저에서 `/household/stats`로 이동해 데이터가 전혀 없는 미래 연도(예:
내년)로 전환해본다.
Expected: 에러 화면 없이 빈 라인차트/빈 도넛차트/0으로 채워진 막대차트가 표시됨.

- [ ] **Step 4: 타입 체크 및 빌드**

Run: `npx tsc -b --noEmit && npm run build`
Expected: 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/pages/HouseholdStats.tsx
git commit -m "feat: 가계부 통계 화면 추가(월별 추이/비중/수입-지출 비교)"
```

---

## Task 11: 라우팅 연결 + 홈 화면 진입점

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/components/icons.tsx`

**Interfaces:**
- Consumes: `Household`, `HouseholdCategories`, `HouseholdStats` (Task 8~10)

- [ ] **Step 1: `src/components/icons.tsx`에 지갑 아이콘 추가**

기존 아이콘들과 같은 `base()` 패턴으로 파일 끝에 추가:

```tsx
export function WalletIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v2" />
      <path d="M4 7v10a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2Z" />
      <circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}
```

- [ ] **Step 2: `src/App.tsx`에 라우트 추가**

`import` 목록에 추가:

```ts
import { Household } from './pages/Household'
import { HouseholdCategories } from './pages/HouseholdCategories'
import { HouseholdStats } from './pages/HouseholdStats'
```

`<Route path="/parent/session/:groupId" ... />` 다음 줄에 추가:

```tsx
        <Route path="/household" element={<Household />} />
        <Route path="/household/stats" element={<HouseholdStats />} />
        <Route path="/household/categories" element={<HouseholdCategories />} />
```

- [ ] **Step 3: `src/pages/Home.tsx`에 "가계부" 타일 추가**

import 줄의 아이콘 목록에 `WalletIcon` 추가:

```ts
import { BookIcon, ChartIcon, ChevronRightIcon, CheckCircleIcon, PencilIcon, StarIcon, WalletIcon, XCircleIcon } from '../components/icons'
```

"내 단어장 보기" `<Link>` 블록과 "새 단어장 만들기" `<Link>` 사이에 추가:

```tsx
          <Link to="/household" className="flex items-center gap-3.5 rounded-[20px] border border-border bg-surface p-4.5">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-hh-pine-tint">
              <WalletIcon width={20} height={20} className="text-hh-pine" strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <div className="text-[16px] font-bold">가계부</div>
              <div className="mt-0.5 text-[12.5px] text-ink-muted">우리 집 지출 관리</div>
            </div>
            <ChevronRightIcon width={18} height={18} className="text-ink-muted" />
          </Link>
```

- [ ] **Step 4: 전체 테스트 + 빌드 확인**

Run: `npm test && npx tsc -b --noEmit && npm run build`
Expected: 모든 테스트 통과, 타입/빌드 에러 없음.

- [ ] **Step 5: 수동 확인**

Run: `npm run dev`, 홈 화면에서 "가계부" 타일 클릭 → 비밀번호 팝업 → `admin/017hand!` 입력 →
입력 화면 진입 → 상단 탭으로 통계/관리 화면 이동까지 눈으로 확인.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/pages/Home.tsx src/components/icons.tsx
git commit -m "feat: 가계부 라우트 연결 및 홈 화면 진입 타일 추가"
```

---

## Task 12: 과거 데이터 이전 스크립트 (2021~2026)

이 태스크의 실제 데이터 파일(연/월/금액)은 가족의 재무 정보이므로 **절대 git에 커밋하지 않는다**.
스크립트(로직)만 커밋하고, 실제 수치가 담긴 JSON은 로컬에만 둔다.

**Files:**
- Create: `scripts/migrate-household-history.mjs`
- Create: `scripts/migrate-household-history.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `normalizeMigrationData(data)` — 순수 함수, DB를 건드리지 않음. `main()`은 이 함수의
  결과로 `expense_categories`/`expense_entries`/`expense_settings`에 upsert한다.

- [ ] **Step 1: `.gitignore`에 로컬 데이터 파일 추가**

`.gitignore`에 추가:

```
scripts/household-history.local.json
```

- [ ] **Step 2: 실패하는 테스트 작성**

Create `scripts/migrate-household-history.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { normalizeMigrationData } from './migrate-household-history.mjs'

describe('normalizeMigrationData', () => {
  it('정의되지 않은 카테고리를 참조하는 entry는 걸러내고 unknown에 담는다', () => {
    const result = normalizeMigrationData({
      categories: [{ name: '삼성카드', groupType: 'card' }],
      entries: [
        { category: '삼성카드', year: 2026, month: 1, amount: 100 },
        { category: '없는카드', year: 2026, month: 1, amount: 50 },
      ],
    })
    expect(result.entries).toHaveLength(1)
    expect(result.unknown).toHaveLength(1)
    expect(result.unknown[0].category).toBe('없는카드')
  })

  it('categories/entries가 배열이 아니면 에러를 던진다', () => {
    expect(() => normalizeMigrationData({})).toThrow()
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run scripts/migrate-household-history.test.mjs`
Expected: FAIL (`./migrate-household-history.mjs` 모듈이 아직 없음)

- [ ] **Step 4: `scripts/migrate-household-history.mjs` 작성**

```js
// 구글시트(2021~2026년 매출이력)에서 뽑아낸 과거 가계부 데이터를 DB에 채워 넣는 1회성 스크립트.
// 실제 수치가 담긴 데이터 파일은 개인 재무정보라 git에 커밋하지 않는다(.gitignore 참고).
//
//   node scripts/migrate-household-history.mjs scripts/household-history.local.json
//
// 기대하는 데이터 파일 형식:
// {
//   "categories": [{ "name": "삼성카드", "groupType": "card", "displayOrder": 0 }, ...],
//   "entries": [{ "category": "삼성카드", "year": 2026, "month": 9, "amount": 3120251 }, ...],
//   "openingYear": 2021, "openingMonth": 1, "openingBalance": 0
// }
import { readFileSync } from 'node:fs'
import pg from 'pg'

/** 알 수 없는 카테고리를 참조하는 entry를 걸러낸다. DB를 건드리지 않는 순수 함수. */
export function normalizeMigrationData(data) {
  if (!Array.isArray(data.categories) || !Array.isArray(data.entries)) {
    throw new Error('데이터 파일에 categories/entries 배열이 필요합니다')
  }
  const names = new Set(data.categories.map((c) => c.name))
  const entries = data.entries.filter((e) => names.has(e.category))
  const unknown = data.entries.filter((e) => !names.has(e.category))
  return { categories: data.categories, entries, unknown }
}

async function main() {
  const [, , dataPath] = process.argv
  if (!dataPath) {
    console.error('사용법: node scripts/migrate-household-history.mjs <data.json>')
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync(dataPath, 'utf8'))
  const { categories, entries, unknown } = normalizeMigrationData(raw)
  if (unknown.length > 0) {
    console.warn(`알 수 없는 카테고리를 참조하는 entry ${unknown.length}건을 건너뜁니다:`, unknown)
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '') ? false : { rejectUnauthorized: false },
  })

  const categoryIds = new Map()
  for (const cat of categories) {
    const {
      rows: [row],
    } = await pool.query(
      `INSERT INTO expense_categories (name, group_type, display_order, created_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [cat.name, cat.groupType, cat.displayOrder ?? 0, Date.now()],
    )
    categoryIds.set(cat.name, row.id)
  }

  for (const entry of entries) {
    await pool.query(
      `INSERT INTO expense_entries (category_id, year, month, amount, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (category_id, year, month) DO UPDATE SET amount = EXCLUDED.amount, updated_at = EXCLUDED.updated_at`,
      [categoryIds.get(entry.category), entry.year, entry.month, entry.amount, Date.now()],
    )
  }

  await pool.query(
    `INSERT INTO expense_settings (id, opening_year, opening_month, opening_balance, updated_at)
     VALUES (1, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       opening_year = EXCLUDED.opening_year, opening_month = EXCLUDED.opening_month,
       opening_balance = EXCLUDED.opening_balance, updated_at = EXCLUDED.updated_at`,
    [raw.openingYear, raw.openingMonth, raw.openingBalance ?? 0, Date.now()],
  )

  console.log(`카테고리 ${categoryIds.size}개, 엔트리 ${entries.length}개 반영 완료`)
  await pool.end()
}

// 테스트에서 import할 때는 실행하지 않고, 직접 실행했을 때만 main()을 돈다.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run scripts/migrate-household-history.test.mjs`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit (스크립트/로직만, 데이터 파일 제외)**

```bash
git add scripts/migrate-household-history.mjs scripts/migrate-household-history.test.mjs .gitignore
git commit -m "feat: 과거 가계부 데이터 이전 스크립트 추가(1회성)"
```

- [ ] **Step 7: 실제 이전 실행 (데이터 준비 후, 별도 세션에서)**

이 단계는 구글시트(`매출이력`, 2021~2026년 탭)의 실제 값을 옮겨 적어 `scripts/household-history.local.json`을
만든 다음, DB 접근 권한이 있는 환경에서 실행한다:

```bash
node scripts/migrate-household-history.mjs scripts/household-history.local.json
```

실행 후 `/household/stats`에서 과거 연도를 눌러 시트의 "총 합계" 행과 화면의 "이번 달 남은 돈"이
일치하는지 확인한다. 시트 항목 구성이 연도마다 조금씩 달랐던 점(스펙 §7)을 감안해, 일치하지
않으면 `household-history.local.json`의 카테고리 매핑을 조정한다.

---

## 실행 후 다시 확인할 것

- Task 1~11(코드)은 순서대로 진행하면 매 태스크마다 빌드 가능한 상태를 유지한다.
- Task 4(Cloud Run/GitHub 리네임)는 사용자가 직접, Task 12의 Step 7(실제 데이터 이전)은 DB
  접근 권한이 있는 세션에서 별도로 실행한다.
