# OPIC 스크립트 암기장 1단계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 만든 `2026 OPIC 2.xlsx`의 주제별 스크립트를 `/opic`에서 폰·PC로 읽고 문항별 암기 상태를 남길 수 있게 한다.

**Architecture:** 엑셀은 1회성 스크립트로 파싱해 Postgres에 넣고, 앱은 DB만 본다. 파싱 로직은 `src/lib/opicParse.ts`에 순수 함수로 두어 스크립트와 vitest가 같은 코드를 쓴다. 화면은 기존 React SPA에 `/opic/*` 라우트를 더하고, 가계부의 비밀번호 게이트를 이름만 바꿔 공유한다.

**Tech Stack:** React 19 · React Router 7(선언형) · Tailwind v4(`@theme`) · Express 5 · Neon Postgres(`pg`) · vitest. 엑셀 읽기는 Node `xlsx`(SheetJS) 패키지를 devDependency로 쓴다.

**Spec:** `docs/superpowers/specs/2026-10-01-opic-script-memorization-design.md`

**화면 시각 기준:** 사용자의 디자인 캔버스 `OPIC 스크립트 암기장 기획`
(`https://claude.ai/artifact/7ANMPPw5HBhDP2phRueCXh`). 아트보드 5종 — `Main`(기획서 본문),
`M_Home`·`M_Topic`·`M_Script`(모바일), `PC_Script`(PC 3단). Task 6~9의 화면을 만들 때 이
아트보드의 간격·크기·색을 기준으로 삼는다. 계획 본문은 구조와 동작만 규정하고 픽셀 값은
아트보드를 따른다.

## Global Constraints

- 암기 상태는 `opic_questions.id`가 아니라 **`answer_hash`** 에 붙인다. 재임포트와 중복 답변(63종 151행) 때문이다.
- B열 질문/제목 경계는 **"한글이 없고 영문자로 시작하는 첫 줄"**. 빈 줄 기준은 358행 중 104행에서 깨지므로 쓰지 않는다.
- 괄호 주석이 **어느 영어 표현에 붙는지 추측하지 않는다.** 그 자리에 칩으로만 렌더한다.
- 눌러도 아무 일이 없는 컨트롤은 그리지 않는다(보기 방식 토글, 복습함, 음성·표시 설정은 이번에 넣지 않는다).
- 음성(TTS) 관련 코드는 이번 단계에 **넣지 않는다.**
- 가계부 화면(`Household*.tsx`, `--color-hh-*`)은 `AccessGate` 이름 변경에 따른 import 수정 외에 **건드리지 않는다.**
- OPIC 색은 `--color-op-*`로 분리한다: bg `#F6F4EF` · ink `#1A1D26` · accent `#3346C8` · eva `#9A3B6E` · border `#E4E0D6` · pattern `#E6E9FB` · marker `#FFE27A` · done `#15803D` · ok `#D69E2E` · weak `#E0662B`.
- 상태 색은 **항상 글자와 함께** 표시한다(색만으로 뜻을 전하지 않는다).
- 커밋 메시지는 한글, 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Review Focus

- **이중 괄호 오타** — 실제 데이터에 `I grab some drinks((술을 조금 마시다) with my friends.`가 있다. 주석 파서가 예외를 던지거나 본문을 먹어치우면 안 되고, 칩 하나로 정상 렌더해야 한다. → Task 1
- **연속 빈 줄** — 답변에 빈 줄이 2개 이상 이어질 때 빈 문장이 렌더되거나 문단 간격이 무한히 벌어지면 안 된다. → Task 8
- **같은 답변을 공유하는 문항의 상태 동기화** — `answer_hash`가 같은 문항이 63종 있다. 한 곳에서 상태를 바꾸면 같은 해시의 다른 문항 목록에도 반영돼야 한다. → Task 4
- **질문이 없는 롤플레이 문항** — `Roleplay` 시트는 `question_en`이 빈 문자열이다. 뷰어가 빈 에바 카드를 그리면 안 된다. → Task 8
- **없는 id로 직접 URL 진입** — `/opic/t/999/q/999`로 들어오면 500이 아니라 주제 홈으로 보내야 한다. → Task 7

---

### Task 1: 엑셀 파서 순수 함수

**Files:**
- Create: `src/lib/opicParse.ts`
- Test: `src/lib/opicParse.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `parseSheetName(sheet: string): { name: string; stars: number }`
  - `normalizeSetLabel(raw: string): string | null`
  - `splitQuestionCell(cell: string): { titles: string[]; questionEn: string } | null`
  - `parseTitleLine(line: string): { level: 'Int' | 'Adv' | null; importance: number; title: string }`
  - `parseAnnotations(line: string): Array<{ type: 'text'; value: string } | { type: 'label'; value: string } | { type: 'chip'; pron: string | null; meaning: string }>`
  - `answerHash(answer: string): string`
  - `findPatterns(answers: Array<{ topic: string; answer: string }>, minTopics?: number): Array<{ text: string; topicCount: number; occurrences: number }>`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/opicParse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  answerHash,
  findPatterns,
  normalizeSetLabel,
  parseAnnotations,
  parseSheetName,
  parseTitleLine,
  splitQuestionCell,
} from './opicParse'

describe('parseSheetName', () => {
  it('시트명 끝의 ★ 개수를 빈출도로, 앞부분을 주제명으로 나눈다', () => {
    expect(parseSheetName('Bar★★★')).toEqual({ name: 'Bar', stars: 3 })
    expect(parseSheetName('Transport★★')).toEqual({ name: 'Transport', stars: 2 })
    expect(parseSheetName('Weather★')).toEqual({ name: 'Weather', stars: 1 })
  })
  it('한글 주제명과 공백이 섞여도 처리한다', () => {
    expect(parseSheetName('신문★★★')).toEqual({ name: '신문', stars: 3 })
    expect(parseSheetName('House 1★★★')).toEqual({ name: 'House 1', stars: 3 })
  })
  it('★이 없으면 0', () => {
    expect(parseSheetName('Roleplay')).toEqual({ name: 'Roleplay', stars: 0 })
  })
})

describe('normalizeSetLabel', () => {
  it('대소문자를 맞춘다', () => {
    expect(normalizeSetLabel('1Set')).toBe('1set')
    expect(normalizeSetLabel('2set')).toBe('2set')
  })
  it('숫자로 저장된 값을 N번으로 바꾼다', () => {
    expect(normalizeSetLabel('7.0')).toBe('7번')
    expect(normalizeSetLabel('8.0')).toBe('8번')
  })
  it('번호 라벨은 그대로 둔다', () => {
    expect(normalizeSetLabel('11번')).toBe('11번')
  })
  it('ROLE PLAY 구분선은 ROLE PLAY로 통일한다', () => {
    expect(normalizeSetLabel('ROLE PLAY ★★★ 기차역')).toBe('ROLE PLAY')
  })
  it('빈 값은 null (앞 세트를 잇는다는 뜻)', () => {
    expect(normalizeSetLabel('')).toBeNull()
    expect(normalizeSetLabel('   ')).toBeNull()
  })
})

describe('splitQuestionCell', () => {
  it('빈 줄로 나뉜 형태를 처리한다', () => {
    const cell = '[Int] 기차역창구에 가서 기차표 사는 방법 문의\n\nI’d like to give you a situation.\nYou need to buy a train ticket.'
    expect(splitQuestionCell(cell)).toEqual({
      titles: ['[Int] 기차역창구에 가서 기차표 사는 방법 문의'],
      questionEn: 'I’d like to give you a situation.\nYou need to buy a train ticket.',
    })
  })

  it('빈 줄 없이 한 줄 바꿈만 있는 형태도 처리한다', () => {
    const cell = '[Int] 가장 좋아하는 영화 장르와 좋아하는 이유 설명 ★★★\nYou indicated in the survey that you like to watch movies.'
    expect(splitQuestionCell(cell)).toEqual({
      titles: ['[Int] 가장 좋아하는 영화 장르와 좋아하는 이유 설명 ★★★'],
      questionEn: 'You indicated in the survey that you like to watch movies.',
    })
  })

  it('한글 제목이 여러 줄이면 모두 titles에 담는다', () => {
    const cell = '[Int] 본인이 즐겨 가는 술집 묘사 ★★★★★\n  [Int] 본인이 자주 가는 맥주집 묘사 ★★★★★\n\nTell me about your favorite bar.'
    const out = splitQuestionCell(cell)
    expect(out?.titles).toEqual([
      '[Int] 본인이 즐겨 가는 술집 묘사 ★★★★★',
      '[Int] 본인이 자주 가는 맥주집 묘사 ★★★★★',
    ])
    expect(out?.questionEn).toBe('Tell me about your favorite bar.')
  })

  it('영문 시작 줄이 없으면 null (검수 대상)', () => {
    expect(splitQuestionCell('영업점메시지시작 (전화)')).toBeNull()
  })
})

describe('parseTitleLine', () => {
  it('[Int]와 끝의 ★를 떼고 제목만 남긴다', () => {
    expect(parseTitleLine('[Int] 본인이 즐겨 가는 술집 묘사 ★★★★★')).toEqual({
      level: 'Int',
      importance: 5,
      title: '본인이 즐겨 가는 술집 묘사',
    })
  })
  it('[Adv]도 처리하고 ★이 없으면 0', () => {
    expect(parseTitleLine('[Adv] 술집에 있었던 에피소드 묘사')).toEqual({
      level: 'Adv',
      importance: 0,
      title: '술집에 있었던 에피소드 묘사',
    })
  })
  it('유형 표기가 없으면 level은 null', () => {
    expect(parseTitleLine('영업점메시지시작')).toEqual({
      level: null,
      importance: 0,
      title: '영업점메시지시작',
    })
  })
})

describe('parseAnnotations', () => {
  it('괄호가 없으면 본문 한 조각', () => {
    expect(parseAnnotations('There are tons of bars in Korea.')).toEqual([
      { type: 'text', value: 'There are tons of bars in Korea.' },
    ])
  })

  it('줄 맨 앞 괄호는 분류 라벨로 뺀다', () => {
    expect(parseAnnotations('(종류) What kinds of phones are available?')).toEqual([
      { type: 'label', value: '종류' },
      { type: 'text', value: 'What kinds of phones are available?' },
    ])
  })

  it('문장 중간·끝의 한글 괄호는 칩으로 뺀다', () => {
    expect(parseAnnotations('I often go to bars for social gatherings. (사교모임)')).toEqual([
      { type: 'text', value: 'I often go to bars for social gatherings.' },
      { type: 'chip', pron: null, meaning: '사교모임' },
    ])
  })

  it('쉼표형은 앞을 발음, 뒤를 뜻으로 가른다', () => {
    const out = parseAnnotations('an ongoing diplomatic(디플로메틱,외교) issue')
    expect(out).toEqual([
      { type: 'text', value: 'an ongoing diplomatic' },
      { type: 'chip', pron: '디플로메틱', meaning: '외교' },
      { type: 'text', value: 'issue' },
    ])
  })

  it('이중 괄호 오타를 예외 없이 칩 하나로 처리한다', () => {
    const out = parseAnnotations('I grab some drinks((술을 조금 마시다) with my friends.')
    expect(out).toEqual([
      { type: 'text', value: 'I grab some drinks' },
      { type: 'chip', pron: null, meaning: '술을 조금 마시다' },
      { type: 'text', value: 'with my friends.' },
    ])
  })

  it('한글이 없는 괄호는 본문으로 남긴다', () => {
    expect(parseAnnotations('It is a pub (a nice one) near my house.')).toEqual([
      { type: 'text', value: 'It is a pub (a nice one) near my house.' },
    ])
  })
})

describe('answerHash', () => {
  it('같은 본문은 같은 해시', () => {
    expect(answerHash('A\nB')).toBe(answerHash('A\nB'))
  })
  it('앞뒤 공백과 줄 끝 공백 차이를 무시한다', () => {
    expect(answerHash('  A \n B  ')).toBe(answerHash('A\nB'))
  })
  it('다른 본문은 다른 해시', () => {
    expect(answerHash('A\nB')).not.toBe(answerHash('A\nC'))
  })
})

describe('findPatterns', () => {
  it('서로 다른 주제 3개 이상에서 반복되는 문장만 뽑는다', () => {
    const answers = [
      { topic: 'Bar', answer: 'They are everywhere these days.\nOnly here.' },
      { topic: 'Movie', answer: 'They are everywhere these days.' },
      { topic: 'Shopping', answer: 'They are everywhere these days.' },
      { topic: 'Bank', answer: 'Two topics only.' },
      { topic: 'Hotel', answer: 'Two topics only.' },
    ]
    const out = findPatterns(answers)
    expect(out).toEqual([{ text: 'They are everywhere these days.', topicCount: 3, occurrences: 3 }])
  })

  it('12자 이하 짧은 줄은 패턴으로 보지 않는다', () => {
    const answers = [
      { topic: 'A', answer: 'Thanks.' },
      { topic: 'B', answer: 'Thanks.' },
      { topic: 'C', answer: 'Thanks.' },
    ]
    expect(findPatterns(answers)).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/opicParse.test.ts`
Expected: FAIL — `Failed to resolve import "./opicParse"`

- [ ] **Step 3: 파서 구현**

`src/lib/opicParse.ts`:

```ts
// 2026 OPIC 2.xlsx를 앱 데이터로 옮기기 위한 순수 파싱 함수들.
// 임포트 스크립트와 단위 테스트가 같은 코드를 쓰도록 브라우저에서도 돌아가는 형태로 둔다
// (node:crypto 같은 런타임 전용 모듈을 쓰지 않는다).

const HANGUL = /[가-힣]/

/** 'Bar★★★' -> { name: 'Bar', stars: 3 } */
export function parseSheetName(sheet: string): { name: string; stars: number } {
  const stars = (sheet.match(/★/g) ?? []).length
  return { name: sheet.replace(/★/g, '').trim(), stars }
}

/** A열 세트 라벨을 통일한다. 빈 값은 "위 세트를 잇는다"는 뜻이라 null. */
export function normalizeSetLabel(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (s === '') return null
  if (/ROLE\s*PLAY/i.test(s)) return 'ROLE PLAY'
  // 엑셀이 "7"을 7.0으로 저장한 경우
  const num = s.match(/^(\d+)(?:\.0+)?$/)
  if (num) return `${num[1]}번`
  return s.toLowerCase().endsWith('set') ? s.toLowerCase() : s
}

/**
 * B열을 한글 제목 줄들과 영어 질문으로 가른다.
 * 경계는 "한글이 없고 영문자(또는 따옴표)로 시작하는 첫 줄". 빈 줄 기준은 데이터의
 * 29%에서 깨지므로 쓰지 않는다.
 */
export function splitQuestionCell(cell: string): { titles: string[]; questionEn: string } | null {
  const lines = (cell ?? '').split('\n')
  const at = lines.findIndex((l) => {
    const t = l.trim()
    return t !== '' && !HANGUL.test(t) && /^["'A-Za-z]/.test(t)
  })
  if (at <= 0) return null

  const titles = lines
    .slice(0, at)
    .map((l) => l.trim())
    .filter((l) => l !== '')
  const questionEn = lines.slice(at).join('\n').trim()
  if (titles.length === 0 || questionEn === '') return null
  return { titles, questionEn }
}

/** '[Int] 본인이 즐겨 가는 술집 묘사 ★★★★★' -> level/importance/title */
export function parseTitleLine(line: string): {
  level: 'Int' | 'Adv' | null
  importance: number
  title: string
} {
  let s = (line ?? '').trim()
  const lv = s.match(/^\[(Int|Adv)\]\s*/i)
  const level = lv ? ((lv[1][0].toUpperCase() + lv[1].slice(1).toLowerCase()) as 'Int' | 'Adv') : null
  if (lv) s = s.slice(lv[0].length)
  const importance = (s.match(/★/g) ?? []).length
  return { level, importance, title: s.replace(/★/g, '').trim() }
}

export type AnnotationPart =
  | { type: 'text'; value: string }
  | { type: 'label'; value: string }
  | { type: 'chip'; pron: string | null; meaning: string }

/**
 * 한 줄에서 한글이 든 괄호를 떼어낸다.
 * 어느 영어 표현에 붙는 주석인지는 엑셀에 없으므로 추측하지 않고 그 자리에 둔다.
 * 줄 맨 앞 괄호만 분류 라벨로 따로 본다.
 */
export function parseAnnotations(line: string): AnnotationPart[] {
  const parts: AnnotationPart[] = []
  const push = (value: string) => {
    const v = value.trim()
    if (v !== '') parts.push({ type: 'text', value: v })
  }

  let rest = line ?? ''
  let first = true
  // 여는 괄호가 연달아 오는 오타(`((술을...)`)까지 받도록 `\(+`로 연다.
  const re = /\(+([^()]*)\)/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(rest)) !== null) {
    const inner = m[1].trim()
    if (!HANGUL.test(inner)) continue // 한글이 없으면 본문의 일부로 둔다
    const before = rest.slice(last, m.index)
    const atLineStart = first && before.trim() === ''
    push(before)
    if (atLineStart) {
      parts.push({ type: 'label', value: inner })
    } else {
      const comma = inner.split(',')
      if (comma.length === 2 && comma[0].trim() !== '' && comma[1].trim() !== '') {
        parts.push({ type: 'chip', pron: comma[0].trim(), meaning: comma[1].trim() })
      } else {
        parts.push({ type: 'chip', pron: null, meaning: inner })
      }
    }
    last = m.index + m[0].length
    first = false
  }
  push(rest.slice(last))
  return parts
}

/** 공백 차이를 무시하는 FNV-1a 해시. 브라우저·Node 양쪽에서 같은 값을 준다. */
export function answerHash(answer: string): string {
  const norm = (answer ?? '')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim()
  let h = 0x811c9dc5
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** 서로 다른 주제 minTopics개 이상에서 반복되는 문장을 만능 패턴으로 본다. */
export function findPatterns(
  answers: Array<{ topic: string; answer: string }>,
  minTopics = 3,
): Array<{ text: string; topicCount: number; occurrences: number }> {
  const topics = new Map<string, Set<string>>()
  const counts = new Map<string, number>()

  for (const { topic, answer } of answers) {
    for (const raw of (answer ?? '').split('\n')) {
      const s = raw.trim()
      if (s.length <= 12) continue
      counts.set(s, (counts.get(s) ?? 0) + 1)
      const set = topics.get(s) ?? new Set<string>()
      set.add(topic)
      topics.set(s, set)
    }
  }

  return [...topics.entries()]
    .filter(([, set]) => set.size >= minTopics)
    .map(([text, set]) => ({ text, topicCount: set.size, occurrences: counts.get(text) ?? 0 }))
    .sort((a, b) => b.topicCount - a.topicCount || b.occurrences - a.occurrences)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/opicParse.test.ts`
Expected: PASS (모든 테스트)

- [ ] **Step 5: 전체 테스트와 타입체크**

Run: `npm test && npx tsc --noEmit -p .`
Expected: 기존 72개 + 신규 테스트 모두 통과, 타입 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/lib/opicParse.ts src/lib/opicParse.test.ts
git commit -m "$(cat <<'EOF'
feat: OPIC 엑셀 파서 순수 함수 추가

시트명 ★ 분리, 세트 라벨 정규화, B열 제목/영어질문 경계 판별,
괄호 주석 분리, 답변 해시, 만능 패턴 탐지를 순수 함수로 두어
임포트 스크립트와 테스트가 같은 코드를 쓰게 한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 임포트 스크립트 — 검수 목록까지

**Files:**
- Create: `scripts/import-opic.mjs`
- Modify: `package.json` (devDependencies에 `xlsx` 추가)

**Interfaces:**
- Consumes: Task 1의 `parseSheetName`, `normalizeSetLabel`, `splitQuestionCell`, `parseTitleLine`, `answerHash`, `findPatterns`
- Produces: `node scripts/import-opic.mjs <xlsx경로>` 는 검수 목록만 출력(DB 미접속). `--apply`를 주면 Task 3에서 DB에 쓴다.

- [ ] **Step 1: xlsx 패키지 설치**

Run: `npm install --save-dev xlsx`
Expected: `package.json`의 devDependencies에 `xlsx` 추가

참고: 이 스크립트는 `.mjs`에서 `../src/lib/opicParse.ts`를 직접 import한다. Node 24는 타입을
벗겨내고 실행하므로 그대로 동작한다. 해석에 실패하면 확장자를 포함한 절대 file URL로 바꾼다
(이 저장소에서 이미 겪은 방식).

- [ ] **Step 2: 스크립트 작성 (검수 출력만)**

`scripts/import-opic.mjs`:

```js
// 2026 OPIC 2.xlsx -> Postgres 1회성 임포트.
//   node scripts/import-opic.mjs <xlsx경로>            검수 목록만 출력
//   node scripts/import-opic.mjs <xlsx경로> --apply    DB에 반영
import { readFileSync } from 'node:fs'
import xlsx from 'xlsx'
import {
  answerHash,
  findPatterns,
  normalizeSetLabel,
  parseSheetName,
  parseTitleLine,
  splitQuestionCell,
} from '../src/lib/opicParse.ts'

const SKIP_SHEETS = new Set(['서베이'])
const ROLEPLAY_SHEETS = new Set(['Roleplay', 'Roleplay1'])

export function buildImport(filePath) {
  const wb = xlsx.read(readFileSync(filePath), { type: 'buffer' })
  const topics = []
  const questions = []
  const issues = []

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) {
      issues.push({ sheet: sheetName, row: 0, why: '빈 시트 — 건너뜀', sample: '' })
      continue
    }
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' })
    const { name, stars } = parseSheetName(sheetName)
    const kind = ROLEPLAY_SHEETS.has(sheetName) ? 'roleplay' : 'topic'
    let curSet = null
    let seq = 0
    const before = questions.length

    // 시트 머리글과 시트명이 다른지 본다(기획서가 지적한 Hotel★★ / Bank ★★ 문제)
    const header = String(rows[0]?.[0] ?? '').trim()
    if (header && !header.includes(name) && /★/.test(header)) {
      issues.push({ sheet: sheetName, row: 1, why: '시트 머리글이 시트명과 다름', sample: header })
    }

    rows.forEach((row, i) => {
      const a = String(row[0] ?? '').trim()
      const b = String(row[1] ?? '')
      const c = String(row[2] ?? '')
      const label = normalizeSetLabel(a)
      if (label) curSet = label
      if (b.trim() === '' || c.trim() === '') return

      if (kind === 'roleplay') {
        seq += 1
        const t = parseTitleLine(b.trim().split('\n')[0])
        questions.push({
          sheetName, setLabel: curSet, seq, level: t.level, titleKo: t.title || b.trim().slice(0, 40),
          altTitles: [], importance: t.importance, questionEn: '', answerEn: c,
          sourceRef: `${sheetName}!C${i + 1}`, answerHash: answerHash(c),
        })
        return
      }

      const split = splitQuestionCell(b)
      if (!split) {
        issues.push({ sheet: sheetName, row: i + 1, why: 'B열에서 영어 질문 경계를 찾지 못함', sample: b.slice(0, 60).replace(/\n/g, '⏎') })
        return
      }
      const parsed = split.titles.map(parseTitleLine)
      seq += 1
      questions.push({
        sheetName, setLabel: curSet, seq,
        level: parsed[0].level,
        titleKo: parsed[0].title,
        altTitles: parsed.slice(1).map((p) => p.title),
        importance: Math.max(...parsed.map((p) => p.importance)),
        questionEn: split.questionEn,
        answerEn: c,
        sourceRef: `${sheetName}!C${i + 1}`,
        answerHash: answerHash(c),
      })
    })

    if (questions.length > before) topics.push({ sheetName, name, stars, kind, displayOrder: topics.length })
  }

  const patterns = findPatterns(
    questions.map((q) => ({ topic: q.sheetName, answer: q.answerEn })),
  )
  return { topics, questions, patterns, issues }
}

function report({ topics, questions, patterns, issues }) {
  const hashes = new Map()
  for (const q of questions) hashes.set(q.answerHash, (hashes.get(q.answerHash) ?? 0) + 1)
  const dupKinds = [...hashes.values()].filter((n) => n > 1)

  console.log('===== 임포트 검수 =====')
  console.log(`주제 ${topics.length}개 · 문항 ${questions.length}개 · 만능 패턴 ${patterns.length}문장`)
  console.log(`답변 본문이 같은 묶음 ${dupKinds.length}종 (총 ${dupKinds.reduce((a, b) => a + b, 0)}행)`)
  console.log('')
  console.log(`-- 확인 필요 ${issues.length}건 --`)
  for (const it of issues) console.log(`  [${it.sheet}] r${it.row} ${it.why}${it.sample ? ' | ' + it.sample : ''}`)
  console.log('')
  console.log('-- 주제 목록 --')
  for (const t of topics) {
    const n = questions.filter((q) => q.sheetName === t.sheetName).length
    console.log(`  ${'★'.repeat(t.stars).padEnd(3)} ${t.name.padEnd(16)} ${t.kind.padEnd(8)} ${n}문항`)
  }
}

const [, , filePath, flag] = process.argv
if (!filePath) {
  console.error('사용법: node scripts/import-opic.mjs <xlsx경로> [--apply]')
  process.exit(1)
}
const data = buildImport(filePath)
report(data)
if (flag === '--apply') {
  const { applyImport } = await import('./import-opic-apply.mjs')
  await applyImport(data)
}
```

- [ ] **Step 3: 검수 목록 실행**

Run:
```bash
node scripts/import-opic.mjs "C:/Users/SDS/.claude/uploads/f8fe15b6-8270-46f8-a56f-8bf9cd9da273/12e0bd94-2026_OPIC_2.xlsx"
```
Expected: 주제 30개 안팎 · 문항 358개 안팎이 나오고, `확인 필요` 목록에 `서베이` 빈 시트와 경계를 못 찾은 행들이 나열된다. `Roleplay` 시트 행은 roleplay로 처리되어 경계 실패 목록에 **나오지 않아야** 한다.

- [ ] **Step 4: 사용자에게 검수 목록 확인받기**

검수 출력을 사용자에게 보여주고, 건너뛴 행과 `Hotel★★`/`Heath` 문제를 그대로 둘지 확인받는다. **확인 전에는 DB에 쓰지 않는다.**

- [ ] **Step 5: 커밋**

```bash
git add scripts/import-opic.mjs package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat: OPIC 엑셀 임포트 스크립트 추가(검수 출력 단계)

DB에 쓰기 전 주제·문항·패턴 건수와 확인이 필요한 행을 먼저 출력한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 테이블 생성과 임포트 실행

**Files:**
- Modify: `server/db.js` (기존 `CREATE TABLE IF NOT EXISTS` 블록 끝에 추가)
- Create: `scripts/import-opic-apply.mjs`

**Interfaces:**
- Consumes: Task 2의 `buildImport` 결과 객체 `{ topics, questions, patterns, issues }`
- Produces: `applyImport(data): Promise<void>`

- [ ] **Step 1: 테이블 정의 추가**

`server/db.js`의 `expense_*` 테이블 정의 다음, 같은 `pool.query` 템플릿 문자열 안에 추가:

```sql
    -- OPIC 스크립트 암기장. 원본은 사용자가 관리하는 엑셀이고 여기는 그 사본이다.
    CREATE TABLE IF NOT EXISTS opic_topics (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      sheet_name TEXT NOT NULL UNIQUE,
      stars INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL CHECK (kind IN ('topic', 'roleplay')),
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opic_questions (
      id SERIAL PRIMARY KEY,
      topic_id INTEGER NOT NULL REFERENCES opic_topics(id) ON DELETE CASCADE,
      set_label TEXT,
      seq INTEGER NOT NULL,
      level TEXT,
      title_ko TEXT NOT NULL,
      alt_titles TEXT[] NOT NULL DEFAULT '{}',
      importance INTEGER NOT NULL DEFAULT 0,
      question_en TEXT NOT NULL DEFAULT '',
      answer_en TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      answer_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    -- 암기 상태는 문항 id가 아니라 답변 본문 해시에 붙인다. 본문이 같은 문항이 63종 있어
    -- 상태를 공유해야 하고, 엑셀을 고쳐 재임포트해도 id와 무관하게 남는다.
    CREATE TABLE IF NOT EXISTS opic_status (
      answer_hash TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK (state IN ('weak', 'ok', 'done')),
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS opic_patterns (
      text TEXT PRIMARY KEY,
      topic_count INTEGER NOT NULL,
      occurrences INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_opic_questions_topic ON opic_questions(topic_id, seq);
    CREATE INDEX IF NOT EXISTS idx_opic_questions_hash ON opic_questions(answer_hash);
```

- [ ] **Step 2: 반영 스크립트 작성**

`scripts/import-opic-apply.mjs`:

```js
// 검수를 통과한 임포트 데이터를 Postgres에 넣는다.
// opic_status는 건드리지 않는다(answer_hash로 다시 붙는다).
import pg from 'pg'

export async function applyImport({ topics, questions, patterns }) {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL이 필요합니다')
  const pool = new pg.Pool({ connectionString })
  const client = await pool.connect()
  const now = Date.now()

  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM opic_questions')
    await client.query('DELETE FROM opic_topics')
    await client.query('DELETE FROM opic_patterns')

    const idBySheet = new Map()
    for (const t of topics) {
      const r = await client.query(
        `INSERT INTO opic_topics (name, sheet_name, stars, kind, display_order, created_at)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [t.name, t.sheetName, t.stars, t.kind, t.displayOrder, now],
      )
      idBySheet.set(t.sheetName, r.rows[0].id)
    }

    for (const q of questions) {
      await client.query(
        `INSERT INTO opic_questions
           (topic_id, set_label, seq, level, title_ko, alt_titles, importance,
            question_en, answer_en, source_ref, answer_hash, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          idBySheet.get(q.sheetName), q.setLabel, q.seq, q.level, q.titleKo, q.altTitles,
          q.importance, q.questionEn, q.answerEn, q.sourceRef, q.answerHash, now,
        ],
      )
    }

    for (const p of patterns) {
      await client.query(
        `INSERT INTO opic_patterns (text, topic_count, occurrences) VALUES ($1,$2,$3)`,
        [p.text, p.topicCount, p.occurrences],
      )
    }

    await client.query('COMMIT')
    console.log(`반영 완료 — 주제 ${topics.length} · 문항 ${questions.length} · 패턴 ${patterns.length}`)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}
```

- [ ] **Step 3: 서버를 한 번 띄워 테이블 생성**

Run:
```bash
DATABASE_URL='<Neon 연결 문자열>' PORT=3000 npm start
```
Expected: 기동 로그에 에러 없음. 확인 후 종료.

- [ ] **Step 4: 임포트 반영**

Run:
```bash
DATABASE_URL='<Neon 연결 문자열>' node scripts/import-opic.mjs "<xlsx경로>" --apply
```
Expected: `반영 완료 — 주제 N · 문항 M · 패턴 K`

- [ ] **Step 5: DB 확인**

Run: 주제별 문항 수와 패턴 상위 5개를 조회해 검수 출력과 같은지 대조한다.
Expected: 검수 단계에서 본 숫자와 일치

- [ ] **Step 6: 커밋**

```bash
git add server/db.js scripts/import-opic-apply.mjs
git commit -m "$(cat <<'EOF'
feat: OPIC 테이블 추가 및 엑셀 데이터 반영 스크립트

암기 상태(opic_status)는 재임포트 때 지우지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: OPIC API

**Files:**
- Modify: `server/routes.js` (파일 끝, `expense` 라우트 다음)
- Create: `src/lib/opic.ts`

**Interfaces:**
- Consumes: Task 3의 테이블
- Produces (`src/lib/opic.ts`):
  - `type OpicState = 'weak' | 'ok' | 'done'`
  - `interface OpicTopic { id: number; name: string; stars: number; kind: 'topic' | 'roleplay'; total: number; done: number; ok: number; weak: number }`
  - `interface OpicQuestionSummary { id: number; setLabel: string | null; seq: number; level: string | null; titleKo: string; altTitles: string[]; importance: number; answerHash: string; state: OpicState | null }`
  - `interface OpicQuestion extends OpicQuestionSummary { topicId: number; questionEn: string; answerEn: string }`
  - `getTopics(): Promise<OpicTopic[]>`
  - `getTopicQuestions(topicId: number): Promise<OpicQuestionSummary[]>`
  - `getQuestion(id: number): Promise<OpicQuestion>`
  - `putStatus(answerHash: string, state: OpicState | null): Promise<{ ok: true }>`
  - `getPatterns(): Promise<string[]>`

- [ ] **Step 1: 서버 라우트 추가**

`server/routes.js` 끝에 추가:

```js
// ===== OPIC 스크립트 암기장 =====

router.get('/opic/topics', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT t.id, t.name, t.stars, t.kind,
           COUNT(q.id)::int AS total,
           COUNT(*) FILTER (WHERE s.state = 'done')::int AS done,
           COUNT(*) FILTER (WHERE s.state = 'ok')::int   AS ok,
           COUNT(*) FILTER (WHERE s.state = 'weak')::int AS weak
    FROM opic_topics t
    LEFT JOIN opic_questions q ON q.topic_id = t.id
    LEFT JOIN opic_status s    ON s.answer_hash = q.answer_hash
    GROUP BY t.id
    ORDER BY t.display_order
  `)
  res.json(rows)
})

router.get('/opic/topics/:id/questions', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT q.id, q.set_label AS "setLabel", q.seq, q.level,
            q.title_ko AS "titleKo", q.alt_titles AS "altTitles",
            q.importance, q.answer_hash AS "answerHash", s.state
     FROM opic_questions q
     LEFT JOIN opic_status s ON s.answer_hash = q.answer_hash
     WHERE q.topic_id = $1
     ORDER BY q.seq`,
    [req.params.id],
  )
  res.json(rows)
})

router.get('/opic/questions/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT q.id, q.topic_id AS "topicId", q.set_label AS "setLabel", q.seq, q.level,
            q.title_ko AS "titleKo", q.alt_titles AS "altTitles", q.importance,
            q.question_en AS "questionEn", q.answer_en AS "answerEn",
            q.answer_hash AS "answerHash", s.state
     FROM opic_questions q
     LEFT JOIN opic_status s ON s.answer_hash = q.answer_hash
     WHERE q.id = $1`,
    [req.params.id],
  )
  if (rows.length === 0) return res.status(404).json({ error: 'not found' })
  res.json(rows[0])
})

// 상태는 답변 해시에 붙으므로, 본문이 같은 다른 문항에도 함께 반영된다.
router.put('/opic/status', async (req, res) => {
  const { answerHash, state } = req.body
  if (state === null) {
    await pool.query('DELETE FROM opic_status WHERE answer_hash = $1', [answerHash])
  } else {
    await pool.query(
      `INSERT INTO opic_status (answer_hash, state, updated_at) VALUES ($1,$2,$3)
       ON CONFLICT (answer_hash) DO UPDATE SET state = $2, updated_at = $3`,
      [answerHash, state, Date.now()],
    )
  }
  res.json({ ok: true })
})

router.get('/opic/patterns', async (_req, res) => {
  const { rows } = await pool.query('SELECT text FROM opic_patterns ORDER BY topic_count DESC')
  res.json(rows.map((r) => r.text))
})
```

- [ ] **Step 2: 클라이언트 래퍼 작성**

`src/lib/opic.ts`:

```ts
// OPIC API(/api/opic/*)를 위한 얇은 REST 클라이언트.

export type OpicState = 'weak' | 'ok' | 'done'

export interface OpicTopic {
  id: number
  name: string
  stars: number
  kind: 'topic' | 'roleplay'
  total: number
  done: number
  ok: number
  weak: number
}

export interface OpicQuestionSummary {
  id: number
  setLabel: string | null
  seq: number
  level: string | null
  titleKo: string
  altTitles: string[]
  importance: number
  answerHash: string
  state: OpicState | null
}

export interface OpicQuestion extends OpicQuestionSummary {
  topicId: number
  questionEn: string
  answerEn: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/opic${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) throw new Error(`API ${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  return res.json()
}

export const getTopics = () => api<OpicTopic[]>('/topics')
export const getTopicQuestions = (topicId: number) =>
  api<OpicQuestionSummary[]>(`/topics/${topicId}/questions`)
export const getQuestion = (id: number) => api<OpicQuestion>(`/questions/${id}`)
export const getPatterns = () => api<string[]>('/patterns')

/** 상태는 답변 해시 단위라 본문이 같은 다른 문항에도 함께 적용된다. */
export const putStatus = (answerHash: string, state: OpicState | null) =>
  api<{ ok: true }>('/status', { method: 'PUT', body: JSON.stringify({ answerHash, state }) })
```

- [ ] **Step 3: 상태 공유 동작을 실제로 확인**

같은 `answer_hash`를 가진 문항 두 개를 찾아 한쪽에 상태를 넣고 다른 쪽 조회에 반영되는지 본다.

Run:
```bash
# 같은 해시를 쓰는 문항 두 개 찾기
curl -s http://localhost:3000/api/opic/topics | head -c 300
# (해시 h를 하나 골라) 상태 저장
curl -s -X PUT http://localhost:3000/api/opic/status \
  -H 'Content-Type: application/json' -d '{"answerHash":"<h>","state":"ok"}'
```
Expected: 같은 해시를 가진 **모든** 문항의 조회 결과에서 `state`가 `ok`로 나온다. 확인 후 `{"answerHash":"<h>","state":null}`로 되돌린다.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit -p .`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add server/routes.js src/lib/opic.ts
git commit -m "$(cat <<'EOF'
feat: OPIC API와 클라이언트 래퍼 추가

암기 상태는 답변 해시에 붙어 본문이 같은 문항끼리 공유된다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 게이트 공유 · 라우트 · 디자인 토큰 · 진입점

**Files:**
- Rename: `src/components/HouseholdGate.tsx` → `src/components/AccessGate.tsx`
- Modify: `src/pages/Household.tsx`, `src/pages/HouseholdStats.tsx`, `src/pages/HouseholdCategories.tsx` (import 및 사용처)
- Modify: `src/index.css` (`@theme`에 `--color-op-*`)
- Modify: `index.html` (Source Serif 4 추가)
- Modify: `src/App.tsx` (라우트 3개)
- Modify: `src/components/AppDrawer.tsx` (OPIC 항목)
- Create: `src/components/OpicNav.tsx`
- Create: `src/pages/OpicHome.tsx`, `src/pages/OpicTopic.tsx`, `src/pages/OpicScript.tsx` (이 태스크에서는 제목만 있는 껍데기)

**Interfaces:**
- Consumes: 없음
- Produces: `AccessGate`(children을 감싸는 컴포넌트), `OpicNav`, 세 페이지 컴포넌트

- [ ] **Step 1: 게이트 이름 변경**

`src/components/HouseholdGate.tsx`를 `src/components/AccessGate.tsx`로 옮기고 컴포넌트명을 `AccessGate`로, 주석을 다음으로 바꾼다:

```ts
/** 비밀번호로 보호되는 화면(가계부·OPIC)을 감싸는 접근 게이트. 두 메뉴가 같은 토큰을 쓴다. */
export function AccessGate({ children }: { children: ReactNode }) {
```

세 가계부 페이지의 import와 사용처를 `AccessGate`로 바꾼다. 호환용 재수출은 두지 않는다.

- [ ] **Step 2: 디자인 토큰과 글꼴 추가**

`src/index.css`의 `@theme` 안, `--color-hh-*` 블록 다음에 추가:

```css
  /* OPIC 전용. 가계부(--color-hh-*)와 섞지 않는다. */
  --color-op-bg: #F6F4EF;
  --color-op-surface: #FBFAF6;
  --color-op-ink: #1A1D26;
  --color-op-ink-muted: #5B606B;
  --color-op-border: #E4E0D6;
  --color-op-accent: #3346C8;
  --color-op-accent-tint: #E6E9FB;
  --color-op-eva: #9A3B6E;
  --color-op-eva-tint: #F8EDF3;
  --color-op-marker: #FFE27A;
  --color-op-done: #15803D;
  --color-op-ok: #D69E2E;
  --color-op-weak: #E0662B;
  --font-op-serif: 'Source Serif 4', Georgia, serif;
```

`index.html`의 Google Fonts 링크에 `Source+Serif+4:opsz,wght@8..60,400;8..60,600`를 추가한다.

- [ ] **Step 3: 라우트와 진입점 추가**

`src/App.tsx`에 import와 라우트 3개를 더한다:

```tsx
        <Route path="/opic" element={<OpicHome />} />
        <Route path="/opic/t/:topicId" element={<OpicTopic />} />
        <Route path="/opic/t/:topicId/q/:questionId" element={<OpicScript />} />
```

`src/components/AppDrawer.tsx`의 `가계부` 항목 다음에 OPIC 항목을 더한다(기존 항목과 같은 구조, `to="/opic"`, 부제 `OPIC 스크립트 암기`). `onHousehold`와 나란히 `const onOpic = pathname.startsWith('/opic')`를 두고 활성 색은 `text-op-accent` / `bg-op-accent-tint`를 쓴다.

- [ ] **Step 4: OpicNav와 페이지 껍데기 작성**

`src/components/OpicNav.tsx` — 넓은 화면(lg 이상)에서만 보이는 232px 검정 사이드바. 브랜드와 두 항목(가계부 → `/household`, OPIC → `/opic`)만 둔다. 좁은 화면에서는 가계부와 같은 방식으로 상단 바만 둔다.

세 페이지는 `AccessGate`로 감싸고 `OpicNav`와 제목만 렌더하는 껍데기로 만든다.

- [ ] **Step 5: 빌드와 화면 확인**

Run: `npx tsc --noEmit -p . && npm run build`
Expected: 에러 없음. 로컬 서버를 띄워 `/opic` 진입 시 **가계부에서 이미 로그인했다면 비밀번호를 묻지 않고** 껍데기 화면이 뜬다. 로그아웃 상태(localStorage에서 `hh_access_until` 삭제)에서는 비밀번호 팝업이 뜬다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: OPIC 라우트·전용 색·진입점 추가, 비밀번호 게이트를 가계부와 공유

HouseholdGate를 AccessGate로 바꿔 두 메뉴가 같은 토큰을 쓴다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 주제 홈

**Files:**
- Modify: `src/pages/OpicHome.tsx`
- Create: `src/components/OpicProgressBar.tsx`

**Interfaces:**
- Consumes: `getTopics()` (Task 4), `OpicNav`·`AccessGate` (Task 5)
- Produces: `OpicProgressBar({ total, done, ok, weak }: { total: number; done: number; ok: number; weak: number })` — 3색 진도 바

- [ ] **Step 1: 진도 바 컴포넌트 작성**

`src/components/OpicProgressBar.tsx`:

```tsx
/** 암기 상태 3색 진도 바. 나머지는 미설정이다. 색만으로 뜻을 전하지 않도록 옆에 수치를 함께 쓴다. */
export function OpicProgressBar({ total, done, ok, weak }: { total: number; done: number; ok: number; weak: number }) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-[#ECE8DF]">
      <div className="bg-op-done" style={{ width: `${pct(done)}%` }} />
      <div className="bg-op-ok" style={{ width: `${pct(ok)}%` }} />
      <div className="bg-op-weak" style={{ width: `${pct(weak)}%` }} />
    </div>
  )
}
```

- [ ] **Step 2: 주제 홈 구현**

`src/pages/OpicHome.tsx` — 전체 진도 요약(문항 합계와 상태별 수), 빈출도 필터(전체/★★★/★★/★), 주제 카드 격자(모바일 1열, lg 3열). 카드에는 주제명 · ★ · `N문항` · `OpicProgressBar` · `완료 N · 그럭저럭 N · 부족 N`을 둔다. `kind === 'roleplay'`인 주제는 아래 별도 구획(`롤플레이`)에 모은다. 카드는 `/opic/t/:id`로 이동한다. 로딩·실패는 가계부와 같은 `Loading`·`LoadError`를 쓴다.

- [ ] **Step 3: 화면 확인**

Run: 로컬 서버에서 `/opic`
Expected: 주제 카드가 모두 나오고 진도 바가 보인다. 빈출도 필터가 동작한다. 콘솔 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/pages/OpicHome.tsx src/components/OpicProgressBar.tsx
git commit -m "$(cat <<'EOF'
feat: OPIC 주제 홈 화면 추가

빈출도 필터와 주제별 3색 진도 바를 보여준다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 주제 상세

**Files:**
- Modify: `src/pages/OpicTopic.tsx`
- Create: `src/components/OpicStatusChip.tsx`

**Interfaces:**
- Consumes: `getTopics()`, `getTopicQuestions()` (Task 4), `OpicProgressBar` (Task 6)
- Produces: `OpicStatusChip({ state }: { state: OpicState | null })` — 상태 칩(글자 포함)

- [ ] **Step 1: 상태 칩 컴포넌트 작성**

`src/components/OpicStatusChip.tsx`:

```tsx
import type { OpicState } from '../lib/opic'

const LABEL: Record<OpicState, string> = { weak: '아직 부족', ok: '그럭저럭', done: '암기완료' }
const STYLE: Record<OpicState, string> = {
  weak: 'text-[#B23A0A] bg-[#FDECE3]',
  ok: 'text-[#8A5A00] bg-[#FDF3D7]',
  done: 'text-op-done bg-[#E3F4E8]',
}

/** 암기 상태 칩. 색만으로 뜻을 전하지 않도록 항상 글자를 함께 보여준다. */
export function OpicStatusChip({ state }: { state: OpicState | null }) {
  if (!state) return <span className="text-[12px] text-op-ink-muted">미설정</span>
  return (
    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${STYLE[state]}`}>
      {LABEL[state]}
    </span>
  )
}
```

- [ ] **Step 2: 주제 상세 구현**

`src/pages/OpicTopic.tsx` — `useParams()`의 `topicId`로 주제와 문항 목록을 받는다. 머리에 주제명 · ★ · 문항 수 · 진도 바를 두고, 문항의 `setLabel`을 모아 세트 탭을 만든다(중복 제거, 원래 순서 유지, `전체` 탭 포함). 문항 카드에는 `Q{seq} · {level} {'★'.repeat(importance)}` · 한글 제목 · `OpicStatusChip`을 둔다. 카드는 `/opic/t/:topicId/q/:id`로 이동한다.

**없는 주제 id로 들어온 경우** 목록이 비어 있으면 "주제를 찾을 수 없어요" 안내와 함께 `/opic`으로 돌아가는 버튼을 보여준다(500이 뜨지 않게 한다).

- [ ] **Step 3: 화면 확인**

Run: 로컬 서버에서 주제 하나를 눌러 들어간다. 그리고 `/opic/t/999`로 직접 들어간다.
Expected: 세트 탭과 문항 카드가 나오고, `/opic/t/999`는 안내 화면이 뜬다(에러 화면이 아님).

- [ ] **Step 4: 커밋**

```bash
git add src/pages/OpicTopic.tsx src/components/OpicStatusChip.tsx
git commit -m "$(cat <<'EOF'
feat: OPIC 주제 상세 화면 추가

세트 탭과 문항 카드, 암기 상태 칩을 보여준다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 스크립트 뷰어

**Files:**
- Modify: `src/pages/OpicScript.tsx`
- Create: `src/components/OpicScriptBody.tsx`
- Create: `src/components/OpicScriptBody.test.tsx` 는 만들지 않는다 — 렌더 로직의 순수 부분은 Task 1의 `parseAnnotations`가 이미 덮는다. 대신 아래 Step 1의 순수 함수를 `opicParse.ts`에 더하고 `opicParse.test.ts`에 테스트를 추가한다.
- Modify: `src/lib/opicParse.ts`, `src/lib/opicParse.test.ts`

**Interfaces:**
- Consumes: `getQuestion()`, `getPatterns()`, `putStatus()` (Task 4), `parseAnnotations` (Task 1)
- Produces: `splitAnswerLines(answer: string): Array<{ kind: 'line'; text: string } | { kind: 'gap' }>`

- [ ] **Step 1: 빈 줄 처리 순수 함수의 실패 테스트 추가**

`src/lib/opicParse.test.ts`에 추가:

```ts
import { splitAnswerLines } from './opicParse'

describe('splitAnswerLines', () => {
  it('줄은 문장으로, 빈 줄은 문단 간격으로 바꾼다', () => {
    expect(splitAnswerLines('A\nB\n\nC')).toEqual([
      { kind: 'line', text: 'A' },
      { kind: 'line', text: 'B' },
      { kind: 'gap' },
      { kind: 'line', text: 'C' },
    ])
  })

  it('빈 줄이 여러 개 이어져도 간격은 하나로 합친다', () => {
    expect(splitAnswerLines('A\n\n\n\nB')).toEqual([
      { kind: 'line', text: 'A' },
      { kind: 'gap' },
      { kind: 'line', text: 'B' },
    ])
  })

  it('앞뒤의 빈 줄은 버린다', () => {
    expect(splitAnswerLines('\n\nA\n\n')).toEqual([{ kind: 'line', text: 'A' }])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/opicParse.test.ts -t splitAnswerLines`
Expected: FAIL — `splitAnswerLines is not a function`

- [ ] **Step 3: 구현**

`src/lib/opicParse.ts`에 추가:

```ts
export type AnswerBlock = { kind: 'line'; text: string } | { kind: 'gap' }

/** 답변 전문을 문장 줄과 문단 간격으로 나눈다. 연속된 빈 줄은 간격 하나로 합친다. */
export function splitAnswerLines(answer: string): AnswerBlock[] {
  const out: AnswerBlock[] = []
  for (const raw of (answer ?? '').split('\n')) {
    const t = raw.trim()
    if (t === '') {
      if (out.length > 0 && out[out.length - 1].kind === 'line') out.push({ kind: 'gap' })
      continue
    }
    out.push({ kind: 'line', text: t })
  }
  while (out.length > 0 && out[out.length - 1].kind === 'gap') out.pop()
  return out
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/opicParse.test.ts`
Expected: PASS

- [ ] **Step 5: 본문 렌더 컴포넌트 작성**

`src/components/OpicScriptBody.tsx` — `answer`와 `patterns: Set<string>`을 받아 `splitAnswerLines`로 나누고, 각 줄에 `parseAnnotations`를 적용해 렌더한다.

- `gap`은 위쪽 여백 한 칸(`h-3`)으로 렌더한다.
- 줄 전체가 `patterns`에 있으면 줄을 만능 패턴으로 표시한다(배경 `bg-op-accent-tint`, 아래 테두리 `border-b-2 border-op-accent`).
- `parseAnnotations`의 결과에서 `text`는 그대로, `label`은 줄 앞 작은 머리표, `chip`은 노란 칩(`bg-op-marker`)으로 렌더한다. `pron`이 있으면 칩을 두 개(발음/뜻)로 나눠 보여준다.
- 글꼴은 `font-op-serif`, 크기는 props로 받은 단계(`sm`/`md`/`lg` → 모바일 18/20/23px, PC 20/22/25px), 줄간격 1.75.

- [ ] **Step 6: 뷰어 화면 구현**

`src/pages/OpicScript.tsx` — `questionId`로 문항을 받아 위에서 아래로 렌더한다.

1. **에바 질문 카드** — `bg-op-eva-tint`, 좌측 `Eva` 원형 배지, 한글 제목과 `altTitles` 칩, 영어 질문(`font-op-serif`). **`questionEn`이 빈 문자열이면(롤플레이) 이 카드를 렌더하지 않는다.**
2. **암기 상태 3칸 토글** — 아직 부족 / 그럭저럭 / 암기완료. 누르면 `putStatus(answerHash, state)`를 부르고, 이미 선택된 칸을 다시 누르면 `null`로 되돌린다. 저장 실패 시 이전 값으로 되돌리고 짧은 안내를 띄운다.
3. **글자 크기 A− / A+** — 3단계, 선택은 `localStorage`의 `opic_font_size`에 남긴다.
4. **답변 본문** — `OpicScriptBody`.
5. **이전/다음 문항** — 같은 주제의 `seq` 순서로 이동한다.

- [ ] **Step 7: 화면 확인**

Run: 로컬 서버에서 문항 하나를 열어본다. 확인할 것:
- 괄호 주석이 칩으로 나오고 본문에는 괄호가 남지 않는다
- 만능 패턴 줄에 파란 밑줄이 있다
- 빈 줄이 연속인 답변에서 간격이 한 칸만 벌어진다
- 롤플레이 문항(`/opic`에서 롤플레이 주제 진입)에는 에바 카드가 없다
- 상태를 바꾸면 주제 상세로 돌아갔을 때 칩이 바뀌어 있다

Expected: 모두 그대로 동작, 콘솔 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add src/pages/OpicScript.tsx src/components/OpicScriptBody.tsx src/lib/opicParse.ts src/lib/opicParse.test.ts
git commit -m "$(cat <<'EOF'
feat: OPIC 스크립트 뷰어 추가

문장 단위 렌더, 만능 패턴 밑줄, 괄호 주석 칩, 문항별 암기 상태 토글,
글자 크기 3단계를 담는다. 질문이 없는 롤플레이 문항은 에바 카드를 그리지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: PC 3단 레이아웃과 배포

**Files:**
- Modify: `src/pages/OpicScript.tsx`, `src/pages/OpicTopic.tsx`, `src/components/OpicNav.tsx`

**Interfaces:**
- Consumes: Task 6~8의 화면
- Produces: 없음(레이아웃 합성)

- [ ] **Step 1: PC 3단 합성**

넓은 화면(lg 이상)에서 `/opic/t/:topicId`와 `/opic/t/:topicId/q/:questionId`가 **같은 3단 레이아웃**을 쓰게 한다: `OpicNav`(232px) · 문항 목록(330px) · 스크립트 본문(나머지). 문항이 선택되지 않았으면 본문 자리에 "문항을 고르세요" 빈 상태를 둔다. 좁은 화면에서는 지금처럼 한 화면씩만 보인다.

구현은 가계부에서 쓴 방식과 같이 루트를 `lg:flex-row`로 두고 각 단을 `lg:` 클래스로 보이고 감춘다.

- [ ] **Step 2: 반응형 확인**

Run: 로컬에서 390px와 1440px로 `/opic`, `/opic/t/:id`, `/opic/t/:id/q/:qid`를 모두 본다.
Expected: 가로 스크롤 없음, 콘솔 에러 없음, 모바일은 한 화면씩 · PC는 3단

- [ ] **Step 3: 전체 테스트와 빌드**

Run: `npm test && npx tsc --noEmit -p . && npm run build`
Expected: 모두 통과

- [ ] **Step 4: 커밋과 배포**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: OPIC PC 3단 레이아웃 적용

넓은 화면에서 주제 메뉴·문항 목록·스크립트를 한 화면에 놓는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

- [ ] **Step 5: 배포 확인**

운영에 새 번들이 올라갔는지 로컬 빌드 해시와 대조한다. 서비스워커 캐시 때문에 첫 접속은 이전 화면이 보일 수 있으므로 새로고침 한 번을 안내한다.
