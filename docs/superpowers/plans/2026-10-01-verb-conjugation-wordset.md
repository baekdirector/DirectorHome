# 동사 3단변화 단어장 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 뜻을 보여주고 현재형·과거형·과거분사형 세 칸을 입력받아 채점하는 단어장을 추가하고, 불규칙동사 92개를 변화 유형별 5개 단어장으로 넣는다.

**Architecture:** 새 테이블을 만들지 않는다. `words`에 `past`/`participle`을, `word_sets`에 `kind`를 더해 오답노트·통계가 쓰는 `word_id` 배관을 그대로 쓴다. 파싱·채점·유형 분류는 `src/lib/verbs.ts`에 순수 함수로 모아 임포트 스크립트와 화면과 테스트가 같은 코드를 쓴다.

**Tech Stack:** React 19 · React Router 7 · Tailwind v4 · Express 5 · Neon Postgres(`pg`) · vitest

**Spec:** `docs/superpowers/specs/2026-10-01-verb-conjugation-wordset-design.md`

## Global Constraints

- **타입체크는 `npm run build`로 한다.** `tsconfig.json`이 `"files": []`인 솔루션 구성이라 `tsc --noEmit -p .`는 아무것도 검사하지 않는다.
- 기존 `checkAnswer(question, userAnswer)`와 `'spelling' | 'meaning'` 채점 경로는 **건드리지 않는다.**
- 세 칸을 모두 맞혀야 그 문항이 정답이다(`correct`). 칸별 부분 점수는 두지 않는다.
- 대체형(`was/were`, `got/gotten`)은 **원문 그대로 저장**하고 채점은 **슬래시로 나눈 것 중 하나만 맞아도 정답**.
- `quiz_answers`의 세 형태 구분자는 ` | `(파이프). 대체형이 `/`를 쓰므로 `/`를 쓰면 충돌한다.
- `quiz_answers` 스키마는 바꾸지 않는다.
- 한 시험은 한 종류만 다룬다. 일반 단어와 동사 문제를 한 시험에 섞지 않는다.
- 커밋 메시지는 한글, 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Review Focus

- **기존 단어장 회귀** — 컬럼을 더한 뒤에도 일반 단어장의 스펠링·뜻 시험이 그대로 동작해야 한다. `past`/`participle`이 NULL이고 `kind`가 `'vocab'`인 경로. → Task 2
- **`get`이 두 번 있는 데이터** — A-B-B에 `get-got-got`, A-B-C에 `get-got-got/gotten`. 서로 다른 단어장이므로 **둘 다 들어가야** 하고, 임포터가 전역 중복으로 보고 하나를 버리면 안 된다. → Task 3
- **대체형이 든 칸의 채점** — `got/gotten`에 `got`만 쳐도, `gotten`만 쳐도 정답. `got/gotten`을 통째로 쳐도 정답. → Task 1
- **빈 칸 제출** — 세 칸 중 일부만 채우고 넘기면 빈 칸은 오답으로 기록되고 화면이 깨지지 않아야 한다. → Task 4
- **반복 라운드의 동사 문항** — 1라운드에서 틀린 동사 문항이 2라운드에 다시 나오고, 그때도 세 칸 입력과 칸별 표시가 정상이어야 한다. → Task 4

이 중 대체형 채점과 빈 칸은 Task 1의 단위 테스트로 고정한다. 나머지 셋(기존 단어장 회귀,
`get` 중복, 반복 라운드)은 **화면·DB를 직접 확인하는 단계**로 해당 태스크에 넣었다 —
이 저장소에 컴포넌트 테스트 설비(@testing-library)가 없어 React 흐름을 단위 테스트로
재현할 수 없기 때문이다. 설비를 들이면 가장 먼저 덮을 자리다.

---

### Task 1: 파싱·채점·유형 분류 순수 함수

**Files:**
- Create: `src/lib/verbs.ts`
- Test: `src/lib/verbs.test.ts`

**Interfaces:**
- Consumes: `normalizeAnswer` 같은 기존 함수는 쓰지 않는다(이 파일 안에서 자급한다).
- Produces:
  - `interface ParsedVerb { term: string; past: string; participle: string; meaning: string }`
  - `interface VerbParseResult { verbs: ParsedVerb[]; skipped: string[] }`
  - `parseVerbLine(line: string): ParsedVerb | null`
  - `parseVerbsDetailed(rawText: string): VerbParseResult`
  - `type VerbPattern = 'A-B-B' | 'A-B-C' | 'A-A-A' | 'A-B-A' | 'A-A-B'`
  - `verbPattern(v: { term: string; past: string; participle: string }): VerbPattern`
  - `interface VerbAnswer { present: string; past: string; participle: string }`
  - `interface VerbResult { present: boolean; past: boolean; participle: boolean; all: boolean }`
  - `checkVerbAnswer(v: { term: string; past: string; participle: string }, answer: VerbAnswer): VerbResult`
  - `joinVerbForms(v: { term: string; past: string; participle: string }): string` — `"come | came | come"`
  - `joinVerbAnswer(a: VerbAnswer): string` — 입력한 세 칸을 같은 방식으로 이음

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/verbs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  checkVerbAnswer,
  joinVerbAnswer,
  joinVerbForms,
  parseVerbLine,
  parseVerbsDetailed,
  verbPattern,
} from './verbs'

describe('parseVerbLine', () => {
  it('번호 현재 과거 과거분사 뜻 을 읽는다', () => {
    expect(parseVerbLine('90 come came come 오다')).toEqual({
      term: 'come',
      past: 'came',
      participle: 'come',
      meaning: '오다',
    })
  })

  it('번호가 없어도 읽는다', () => {
    expect(parseVerbLine('come came come 오다')).toEqual({
      term: 'come',
      past: 'came',
      participle: 'come',
      meaning: '오다',
    })
  })

  it('뜻에 띄어쓰기와 쉼표가 있어도 끝까지 뜻으로 본다', () => {
    expect(parseVerbLine('16 lay laid laid 눕히다, 놓다')).toEqual({
      term: 'lay',
      past: 'laid',
      participle: 'laid',
      meaning: '눕히다, 놓다',
    })
    expect(parseVerbLine('80 cost cost cost 비용이 들다')?.meaning).toBe('비용이 들다')
  })

  it('대체형은 슬래시가 붙은 한 토큰으로 읽는다', () => {
    expect(parseVerbLine('41 be was/were been 이다, 있다')).toEqual({
      term: 'be',
      past: 'was/were',
      participle: 'been',
      meaning: '이다, 있다',
    })
  })

  it('탭으로 나뉜 줄도 읽는다', () => {
    expect(parseVerbLine('1\tbleed\tbled\tbled\t피를 흘리다')).toEqual({
      term: 'bleed',
      past: 'bled',
      participle: 'bled',
      meaning: '피를 흘리다',
    })
  })

  it('토큰이 모자라면 null', () => {
    expect(parseVerbLine('come came')).toBeNull()
    expect(parseVerbLine('come came come')).toBeNull() // 뜻이 없다
    expect(parseVerbLine('')).toBeNull()
  })
})

describe('parseVerbsDetailed', () => {
  it('읽은 줄과 못 읽은 줄을 나눈다', () => {
    const out = parseVerbsDetailed('1 come came come 오다\n이건 못 읽는 줄\n2 go went gone 가다')
    expect(out.verbs.map((v) => v.term)).toEqual(['come', 'go'])
    expect(out.skipped).toEqual(['이건 못 읽는 줄'])
  })

  it('같은 현재형이 두 번 나오면 뒤엣것을 버린다', () => {
    const out = parseVerbsDetailed('get got got 얻다\nget got got/gotten 얻다')
    expect(out.verbs).toHaveLength(1)
    expect(out.skipped).toHaveLength(1)
  })
})

describe('verbPattern', () => {
  it('세 형태의 같고 다름으로 유형을 가른다', () => {
    expect(verbPattern({ term: 'bring', past: 'brought', participle: 'brought' })).toBe('A-B-B')
    expect(verbPattern({ term: 'go', past: 'went', participle: 'gone' })).toBe('A-B-C')
    expect(verbPattern({ term: 'cut', past: 'cut', participle: 'cut' })).toBe('A-A-A')
    expect(verbPattern({ term: 'come', past: 'came', participle: 'come' })).toBe('A-B-A')
    expect(verbPattern({ term: 'beat', past: 'beat', participle: 'beaten' })).toBe('A-A-B')
  })

  it('대체형이 있으면 원형과 다른 것으로 본다', () => {
    // get-got-got 은 A-B-B, get-got-got/gotten 은 과거분사가 달라 A-B-C
    expect(verbPattern({ term: 'get', past: 'got', participle: 'got' })).toBe('A-B-B')
    expect(verbPattern({ term: 'get', past: 'got', participle: 'got/gotten' })).toBe('A-B-C')
  })

  it('대소문자 차이는 무시한다', () => {
    expect(verbPattern({ term: 'Cut', past: 'cut', participle: 'CUT' })).toBe('A-A-A')
  })
})

describe('checkVerbAnswer', () => {
  const come = { term: 'come', past: 'came', participle: 'come' }

  it('세 칸이 모두 맞으면 all', () => {
    expect(checkVerbAnswer(come, { present: 'come', past: 'came', participle: 'come' })).toEqual({
      present: true,
      past: true,
      participle: true,
      all: true,
    })
  })

  it('한 칸만 틀리면 그 칸만 false이고 all은 false', () => {
    expect(checkVerbAnswer(come, { present: 'come', past: 'come', participle: 'come' })).toEqual({
      present: true,
      past: false,
      participle: true,
      all: false,
    })
  })

  it('대소문자와 앞뒤 공백은 무시한다', () => {
    expect(
      checkVerbAnswer(come, { present: '  COME ', past: 'Came', participle: 'come' }).all,
    ).toBe(true)
  })

  it('빈 칸은 오답', () => {
    const r = checkVerbAnswer(come, { present: 'come', past: '', participle: 'come' })
    expect(r.past).toBe(false)
    expect(r.all).toBe(false)
  })

  it('대체형은 둘 중 하나만 맞아도 정답', () => {
    const get = { term: 'get', past: 'got', participle: 'got/gotten' }
    expect(checkVerbAnswer(get, { present: 'get', past: 'got', participle: 'got' }).all).toBe(true)
    expect(checkVerbAnswer(get, { present: 'get', past: 'got', participle: 'gotten' }).all).toBe(true)
    expect(
      checkVerbAnswer(get, { present: 'get', past: 'got', participle: 'got/gotten' }).all,
    ).toBe(true)
    expect(checkVerbAnswer(get, { present: 'get', past: 'got', participle: 'getted' }).all).toBe(false)
  })

  it('be의 과거 was/were도 둘 다 받는다', () => {
    const be = { term: 'be', past: 'was/were', participle: 'been' }
    expect(checkVerbAnswer(be, { present: 'be', past: 'was', participle: 'been' }).all).toBe(true)
    expect(checkVerbAnswer(be, { present: 'be', past: 'were', participle: 'been' }).all).toBe(true)
  })
})

describe('joinVerbForms / joinVerbAnswer', () => {
  it('파이프로 잇는다 (대체형의 슬래시와 충돌하지 않게)', () => {
    expect(joinVerbForms({ term: 'come', past: 'came', participle: 'come' })).toBe('come | came | come')
    expect(joinVerbForms({ term: 'get', past: 'got', participle: 'got/gotten' })).toBe(
      'get | got | got/gotten',
    )
  })

  it('입력한 세 칸도 같은 방식으로 잇는다', () => {
    expect(joinVerbAnswer({ present: 'come', past: '', participle: 'comed' })).toBe('come |  | comed')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/verbs.test.ts`
Expected: FAIL — `Failed to resolve import "./verbs"`

- [ ] **Step 3: 구현**

`src/lib/verbs.ts`:

```ts
// 동사 3단변화 단어장을 위한 순수 함수들.
// 임포트 스크립트·시험 화면·테스트가 같은 코드를 쓰도록 브라우저에서도 돌아가는 형태로 둔다.

export interface ParsedVerb {
  term: string
  past: string
  participle: string
  meaning: string
}

export interface VerbParseResult {
  verbs: ParsedVerb[]
  /** 읽지 못했거나 중복이라 제외된 줄 */
  skipped: string[]
}

/** 앞의 번호를 떼어낸다. "1.", "1)", "1 ", "1," 모두 번호로 본다. */
function stripNumbering(line: string): string {
  return line.replace(/^\s*\d{1,3}(?:\s*[.).:\]]\s*|[\s,\t]+)/, '').trim()
}

/**
 * "번호 현재 과거 과거분사 뜻" 한 줄을 읽는다.
 * 앞의 세 토큰이 변화형이고 그 뒤 전부가 뜻이다. 그래서 뜻에 띄어쓰기나 쉼표가 있어도 된다.
 * 대체형(was/were)은 공백이 없어 토큰 하나로 읽힌다.
 */
export function parseVerbLine(line: string): ParsedVerb | null {
  const body = stripNumbering((line ?? '').trim())
  if (body === '') return null

  const parts = body.split(/[\s\t,]+/).filter(Boolean)
  if (parts.length < 4) return null

  const [term, past, participle] = parts
  // 뜻은 세 번째 토큰이 끝나는 자리부터 줄 끝까지. 원문의 공백·쉼표를 살리기 위해
  // 토큰을 다시 잇지 않고 원문에서 잘라낸다.
  const threeTokens = new RegExp(
    `^\\s*${escapeRe(term)}[\\s\\t,]+${escapeRe(past)}[\\s\\t,]+${escapeRe(participle)}[\\s\\t,]+`,
  )
  const meaning = body.replace(threeTokens, '').trim()
  if (meaning === '') return null

  return { term, past, participle, meaning }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseVerbsDetailed(rawText: string): VerbParseResult {
  const verbs: ParsedVerb[] = []
  const skipped: string[] = []
  const seen = new Set<string>()

  for (const raw of (rawText ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const parsed = parseVerbLine(line)
    if (!parsed || seen.has(parsed.term.toLowerCase())) {
      skipped.push(line)
      continue
    }
    seen.add(parsed.term.toLowerCase())
    verbs.push(parsed)
  }

  return { verbs, skipped }
}

export type VerbPattern = 'A-B-B' | 'A-B-C' | 'A-A-A' | 'A-B-A' | 'A-A-B'

const key = (s: string) => (s ?? '').trim().toLowerCase()

/** 세 형태가 서로 같은지로 변화 유형을 가른다. 대체형은 원문 그대로 비교한다. */
export function verbPattern(v: { term: string; past: string; participle: string }): VerbPattern {
  const a = key(v.term)
  const b = key(v.past)
  const c = key(v.participle)
  if (a === b && b === c) return 'A-A-A'
  if (a === b) return 'A-A-B'
  if (b === c) return 'A-B-B'
  if (a === c) return 'A-B-A'
  return 'A-B-C'
}

export interface VerbAnswer {
  present: string
  past: string
  participle: string
}

export interface VerbResult {
  present: boolean
  past: boolean
  participle: boolean
  /** 세 칸이 모두 맞을 때만 참. 문항 단위 정답 여부다. */
  all: boolean
}

/** 대체형(got/gotten)은 슬래시로 나눈 것 중 하나만 맞아도, 통째로 맞아도 정답. */
function matches(expected: string, typed: string): boolean {
  const user = key(typed)
  if (user === '') return false
  const whole = key(expected)
  if (user === whole) return true
  return whole.split('/').some((alt) => alt.trim() !== '' && alt.trim() === user)
}

export function checkVerbAnswer(
  v: { term: string; past: string; participle: string },
  answer: VerbAnswer,
): VerbResult {
  const present = matches(v.term, answer.present)
  const past = matches(v.past, answer.past)
  const participle = matches(v.participle, answer.participle)
  return { present, past, participle, all: present && past && participle }
}

/** 기록에 남길 문자열. 대체형이 슬래시를 쓰므로 파이프로 잇는다. */
export function joinVerbForms(v: { term: string; past: string; participle: string }): string {
  return `${v.term} | ${v.past} | ${v.participle}`
}

export function joinVerbAnswer(a: VerbAnswer): string {
  return `${a.present} | ${a.past} | ${a.participle}`
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/verbs.test.ts`
Expected: PASS (모든 테스트)

- [ ] **Step 5: 전체 테스트와 빌드**

Run: `npm test && npm run build`
Expected: 기존 테스트 전부 통과, 빌드 성공

- [ ] **Step 6: 커밋**

```bash
git add src/lib/verbs.ts src/lib/verbs.test.ts
git commit -m "$(cat <<'EOF'
feat: 동사 3단변화 파싱·채점·유형 분류 순수 함수 추가

대체형(was/were, got/gotten)은 슬래시로 나눈 것 중 하나만 맞아도 정답으로 본다.
기록용 구분자는 파이프를 쓴다(대체형의 슬래시와 충돌하지 않게).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 스키마 확장과 API 반영

**Files:**
- Modify: `server/db.js` (기존 `pool.query` 템플릿 안, `words` 테이블 정의 다음)
- Modify: `server/routes.js` (`GET /wordsets`, `GET /wordsets/:id/words`, `POST /wordsets`)
- Modify: `src/lib/db.ts` (`WordRecord`, `WordSetRecord`, `createWordSet`)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `WordRecord`에 `past?: string | null`, `participle?: string | null` 추가
  - `WordSetRecord`에 `kind: 'vocab' | 'verb'` 추가
  - `createWordSet(title, words, kind?)` — `kind` 생략 시 `'vocab'`

- [ ] **Step 1: 테이블 컬럼 추가**

`server/db.js`의 `words` 테이블 정의 아래, 같은 템플릿 문자열 안에 추가:

```sql
    -- 동사 3단변화 단어장. 새 테이블을 만들면 wrong_notes·통계가 쓰는 word_id 배관이
    -- 두 갈래로 갈라지므로 기존 테이블에 칸을 더한다. 일반 단어장은 NULL로 남는다.
    ALTER TABLE word_sets ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'vocab';
    ALTER TABLE words ADD COLUMN IF NOT EXISTS past TEXT;
    ALTER TABLE words ADD COLUMN IF NOT EXISTS participle TEXT;
```

- [ ] **Step 2: API가 새 칸을 싣게 수정**

`server/routes.js`에서 세 곳을 고친다.

`GET /wordsets/:id/words`의 SELECT에 두 칸을 더한다:

```js
    `SELECT id, word_set_id AS "wordSetId", term, meaning, is_idiom AS "isIdiom",
            part_of_speech AS "partOfSpeech", past, participle
     FROM words WHERE word_set_id = $1 ORDER BY id`,
```

`GET /wordsets` 목록 질의를 찾아(`grep -n "router.get('/wordsets'" -A8 server/routes.js`)
SELECT 목록에 `kind`를 더한다. 이 질의는 `word_sets`를 별칭으로 조인하고 있으므로 그 별칭을
붙인다(예: 별칭이 `s`면 `s.kind`). 별칭 없이 `kind`로 내려가면 클라이언트가 그대로 읽는다.

`POST /wordsets`는 `kind`를 받고 단어마다 두 칸을 더 넣는다:

```js
  const { title, words, kind } = req.body
  if (!title || !Array.isArray(words)) return res.status(400).json({ error: 'title and words[] required' })
  const setKind = kind === 'verb' ? 'verb' : 'vocab'
```

```js
    } = await client.query(
      `INSERT INTO word_sets (title, kind, created_at) VALUES ($1, $2, $3) RETURNING id`,
      [title, setKind, Date.now()],
    )
    for (const w of words) {
      await client.query(
        `INSERT INTO words (word_set_id, term, meaning, is_idiom, part_of_speech, past, participle)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [wordSet.id, w.term, w.meaning, !!w.isIdiom, w.partOfSpeech ?? null, w.past ?? null, w.participle ?? null],
      )
    }
```

- [ ] **Step 3: 클라이언트 타입 수정**

`src/lib/db.ts`:

```ts
export interface WordSetRecord {
  id: number
  title: string
  createdAt: number
  kind: 'vocab' | 'verb'
}

export interface WordRecord {
  id: number
  wordSetId: number
  term: string
  meaning: string
  isIdiom: boolean
  partOfSpeech?: string
  /** 동사 단어장에서만 채워진다. */
  past?: string | null
  participle?: string | null
}
```

`createWordSet`에 `kind`를 더한다:

```ts
export async function createWordSet(
  title: string,
  words: Array<Pick<WordRecord, 'term' | 'meaning' | 'isIdiom' | 'partOfSpeech' | 'past' | 'participle'>>,
  kind: 'vocab' | 'verb' = 'vocab',
): Promise<number> {
  const { id } = await api<{ id: number }>('/wordsets', {
    method: 'POST',
    body: JSON.stringify({ title, words, kind }),
  })
  return id
}
```

- [ ] **Step 4: 빌드와 기존 단어장 회귀 확인**

Run: `npm run build`
Expected: 타입 오류 없음

서버를 띄우고 **기존 일반 단어장이 그대로 동작하는지** 확인한다:

```bash
DATABASE_URL='<Neon 연결 문자열>' PORT=3000 npm start
curl -s http://localhost:3000/api/wordsets | head -c 300
```
Expected: 기존 단어장들이 `"kind":"vocab"`으로 내려오고, 아무 단어장의 `/words`가 `past: null`, `participle: null`과 함께 정상 응답한다. 브라우저에서 기존 단어장으로 시험을 한 문제 풀어 채점이 되는지 본다.

- [ ] **Step 5: 커밋**

```bash
git add server/db.js server/routes.js src/lib/db.ts
git commit -m "$(cat <<'EOF'
feat: 단어장에 종류(kind)와 동사 변화형 칸 추가

새 테이블 대신 기존 words/word_sets에 칸을 더해 오답노트·통계가 쓰는
word_id 배관을 그대로 쓴다. 일반 단어장은 kind='vocab', 변화형은 NULL이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 92개를 유형별 5개 단어장으로 넣기

**Files:**
- Create: `scripts/verbs.txt`
- Create: `scripts/import-verbs.mjs`

**Interfaces:**
- Consumes: Task 1의 `parseVerbsDetailed`, `verbPattern`
- Produces: `node scripts/import-verbs.mjs` 는 검수 출력만, `--apply`면 DB에 반영

- [ ] **Step 1: 원본 데이터 파일 작성**

`scripts/verbs.txt`에 사용자가 준 92줄을 `번호 현재 과거 과거분사 뜻` 형식 한 줄씩 적는다.
표의 유형 구분(1~5번 묶음 제목)은 적지 않는다 — 유형은 `verbPattern`이 계산한다.
`get`은 **두 줄 모두** 적는다(`9 get got got 얻다`, `57 get got got/gotten 얻다`).
`run`의 뜻은 표에 `달 리다 (달리다)`로 적혀 있으나 `달리다`로 정리해 적는다.

- [ ] **Step 2: 임포트 스크립트 작성**

`scripts/import-verbs.mjs`:

```js
// 불규칙동사 92개를 변화 유형별 단어장으로 넣는 1회성 스크립트.
//   node scripts/import-verbs.mjs            검수 출력만
//   node scripts/import-verbs.mjs --apply    DB에 반영
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'
import { parseVerbLine, verbPattern } from '../src/lib/verbs.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SET_TITLE = {
  'A-B-B': '동사 3단변화 · A-B-B',
  'A-B-C': '동사 3단변화 · A-B-C',
  'A-A-A': '동사 3단변화 · A-A-A',
  'A-B-A': '동사 3단변화 · A-B-A',
  'A-A-B': '동사 3단변화 · A-A-B',
}

export function build() {
  const text = readFileSync(join(here, 'verbs.txt'), 'utf8')
  const groups = new Map()
  const skipped = []

  // 전역 중복 제거를 하지 않는다. get 은 A-B-B 와 A-B-C 에 각각 들어가야 한다.
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const v = parseVerbLine(line)
    if (!v) {
      skipped.push(line)
      continue
    }
    const pattern = verbPattern(v)
    if (!groups.has(pattern)) groups.set(pattern, [])
    groups.get(pattern).push(v)
  }
  return { groups, skipped }
}

function report({ groups, skipped }) {
  const total = [...groups.values()].reduce((s, g) => s + g.length, 0)
  console.log('===== 임포트 검수 =====')
  console.log(`읽은 동사 ${total}개 · 유형 ${groups.size}종`)
  for (const [pattern, list] of groups) console.log(`  ${pattern.padEnd(6)} ${list.length}개`)
  console.log('')
  console.log(`-- 읽지 못한 줄 ${skipped.length}개 --`)
  for (const s of skipped) console.log('  ' + s)

  const terms = new Map()
  for (const list of groups.values()) {
    for (const v of list) terms.set(v.term, (terms.get(v.term) ?? 0) + 1)
  }
  const dup = [...terms.entries()].filter(([, n]) => n > 1)
  console.log('')
  console.log(`-- 유형이 갈린 동사 ${dup.length}개 (교재마다 분류가 다른 경우) --`)
  for (const [t] of dup) console.log('  ' + t)
}

async function apply({ groups }) {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL이 필요합니다')
  const pool = new pg.Pool({ connectionString })
  const client = await pool.connect()
  const now = Date.now()
  try {
    await client.query('BEGIN')
    for (const [pattern, list] of groups) {
      const title = SET_TITLE[pattern]
      const {
        rows: [set],
      } = await client.query(
        `INSERT INTO word_sets (title, kind, created_at) VALUES ($1, 'verb', $2) RETURNING id`,
        [title, now],
      )
      for (const v of list) {
        await client.query(
          `INSERT INTO words (word_set_id, term, meaning, is_idiom, past, participle)
           VALUES ($1, $2, $3, false, $4, $5)`,
          [set.id, v.term, v.meaning, v.past, v.participle],
        )
      }
      console.log(`${title} — ${list.length}개`)
    }
    await client.query('COMMIT')
    console.log('반영 완료')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

const data = build()
report(data)
if (process.argv[2] === '--apply') await apply(data)
```

- [ ] **Step 3: 검수 출력 확인**

Run: `node scripts/import-verbs.mjs`
Expected: `읽은 동사 92개 · 유형 5종`이 나오고 유형별 개수가 **A-B-B 40 · A-B-C 39 · A-A-A 9 · A-B-A 3 · A-A-B 1**과 맞는다. "읽지 못한 줄 0개". "유형이 갈린 동사"에 `get`이 나온다.

숫자가 맞지 않으면 `scripts/verbs.txt`의 해당 줄을 고치고 다시 돌린다.

- [ ] **Step 4: DB에 반영**

Run:
```bash
DATABASE_URL='<Neon 연결 문자열>' PORT=3000 npm start   # 컬럼 생성을 위해 한 번 띄웠다 끈다
DATABASE_URL='<Neon 연결 문자열>' node scripts/import-verbs.mjs --apply
```
Expected: 다섯 단어장이 만들어지고 `반영 완료`

- [ ] **Step 5: 확인**

Run: `curl -s http://localhost:3000/api/wordsets | head -c 500`
Expected: `동사 3단변화 · A-B-B` 등 다섯 개가 `"kind":"verb"`로 보이고 개수가 40/39/9/3/1이다.

- [ ] **Step 6: 커밋**

```bash
git add scripts/verbs.txt scripts/import-verbs.mjs
git commit -m "$(cat <<'EOF'
feat: 불규칙동사 92개를 변화 유형별 5개 단어장으로 넣는 스크립트

전역 중복 제거를 하지 않는다. get 은 교재마다 분류가 갈려
A-B-B와 A-B-C 양쪽에 들어간다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 시험 화면의 동사 문제와 칸별 오답 표시

**Files:**
- Create: `src/components/VerbAnswerFields.tsx`
- Modify: `src/pages/Quiz.tsx` (`buildAnswer` 70-80행, `submit` 255-264행, 문제 렌더 영역 430-445행 부근)
- Modify: `src/lib/quiz.ts` (`QuestionType`에 `'verb'` 추가)

**Interfaces:**
- Consumes: Task 1의 `checkVerbAnswer`, `joinVerbForms`, `joinVerbAnswer`, `VerbAnswer`, `VerbResult`; Task 2의 `WordRecord.past`/`participle`
- Produces: `VerbAnswerFields` 컴포넌트

- [ ] **Step 1: 문제 유형에 'verb' 추가**

`src/lib/quiz.ts`:

```ts
export type QuestionType = 'spelling' | 'meaning' | 'verb'
```

`generateQuestions`는 `mode`로 유형을 정하므로, 동사 단어장은 호출부에서 `mode: 'verb'`를 넘긴다. `QuizMode`는 `QuestionType | 'mixed'`라 자동으로 `'verb'`를 받는다.

- [ ] **Step 2: 세 칸 입력 컴포넌트 작성**

`src/components/VerbAnswerFields.tsx`:

```tsx
import { useRef } from 'react'
import type { VerbAnswer, VerbResult } from '../lib/verbs'

const LABELS: Array<{ key: keyof VerbAnswer; label: string }> = [
  { key: 'present', label: '현재형' },
  { key: 'past', label: '과거형' },
  { key: 'participle', label: '과거분사형' },
]

/**
 * 동사 3단변화 입력. 좁은 화면이 주 사용 환경이라 세 칸을 세로로 쌓는다.
 * 엔터로 다음 칸으로 가고, 마지막 칸에서 엔터를 누르면 제출된다.
 * 채점 뒤에는 틀린 칸만 빨갛게 표시하고 그 아래에 정답을 보여준다.
 */
export function VerbAnswerFields({
  value,
  onChange,
  onSubmit,
  result,
  correct,
  disabled,
}: {
  value: VerbAnswer
  onChange: (next: VerbAnswer) => void
  onSubmit: () => void
  /** 채점 전에는 null. */
  result: VerbResult | null
  /** 정답 세 형태. 채점 뒤 틀린 칸 아래에 보여준다. */
  correct: { term: string; past: string; participle: string }
  disabled: boolean
}) {
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]

  const answerOf = (key: keyof VerbAnswer) =>
    key === 'present' ? correct.term : key === 'past' ? correct.past : correct.participle

  return (
    <div className="flex flex-col gap-3">
      {LABELS.map(({ key, label }, i) => {
        const wrong = result ? !result[key] : false
        return (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`verb-${key}`} className="text-[13px] font-semibold text-ink-muted">
              {label}
            </label>
            <input
              id={`verb-${key}`}
              ref={refs[i]}
              value={value[key]}
              disabled={disabled}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (i < 2) refs[i + 1].current?.focus()
                else onSubmit()
              }}
              className={`rounded-xl border px-3 py-2.5 text-[17px] outline-none disabled:bg-surface ${
                wrong ? 'border-2 border-danger' : 'border-border focus:border-primary'
              }`}
            />
            {wrong && (
              <span className="text-[13px] font-semibold text-danger">정답: {answerOf(key)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

`border-danger`/`text-danger` 토큰이 `src/index.css`의 `@theme`에 없으면 그 파일에서 기존 오답 표시에 쓰는 색 토큰 이름으로 바꾼다(`grep -n "danger\|wrong\|incorrect" src/index.css`로 확인).

- [ ] **Step 3: Quiz.tsx가 동사 문제를 다루게 수정**

`buildAnswer`를 동사 유형까지 다루게 바꾼다(70-80행):

```tsx
function buildAnswer(q: Question, userAnswer: string, correct: boolean): AnswerLog {
  return {
    wordId: q.word.id,
    questionType: q.type,
    term: q.word.term,
    meaning: q.word.meaning,
    correctAnswer:
      q.type === 'spelling'
        ? q.word.term
        : q.type === 'verb'
          ? joinVerbForms({
              term: q.word.term,
              past: q.word.past ?? '',
              participle: q.word.participle ?? '',
            })
          : q.word.meaning,
    userAnswer,
    correct,
  }
}
```

동사 입력 상태를 더한다(`answerInput` 옆):

```tsx
const EMPTY_VERB: VerbAnswer = { present: '', past: '', participle: '' }
const [verbInput, setVerbInput] = useState<VerbAnswer>(EMPTY_VERB)
```

`submit`이 동사 유형을 가르게 한다(255-264행):

```tsx
  function submit(skip = false) {
    if (!currentQuestion) return
    if (currentQuestion.type === 'verb') {
      const w = currentQuestion.word
      const forms = { term: w.term, past: w.past ?? '', participle: w.participle ?? '' }
      const result = skip ? null : checkVerbAnswer(forms, verbInput)
      const record = buildAnswer(
        currentQuestion,
        skip ? '' : joinVerbAnswer(verbInput),
        result?.all ?? false,
      )
      setAnswers((prev) => {
        const next = [...prev]
        next[qIndex] = record
        return next
      })
      return
    }
    const correct = !skip && checkAnswer(currentQuestion, answerInput)
    const record = buildAnswer(currentQuestion, skip ? '' : answerInput, correct)
    setAnswers((prev) => {
      const next = [...prev]
      next[qIndex] = record
      return next
    })
  }
```

`goTo`가 문제를 옮길 때 동사 입력도 복원하게 한다(250-253행). 저장된 `userAnswer`를 ` | `로 갈라 되돌린다:

```tsx
    setAnswerInput(answers[clamped]?.userAnswer ?? '')
    const saved = answers[clamped]?.userAnswer ?? ''
    const parts = saved.split(' | ')
    setVerbInput(
      questions[clamped]?.type === 'verb' && parts.length === 3
        ? { present: parts[0], past: parts[1], participle: parts[2] }
        : EMPTY_VERB,
    )
```

채점 결과를 렌더 중에 계산해 둔다(컴포넌트 본문, `submit` 정의 위):

```tsx
const verbResult =
  currentQuestion?.type === 'verb' && answers[qIndex]
    ? checkVerbAnswer(
        {
          term: currentQuestion.word.term,
          past: currentQuestion.word.past ?? '',
          participle: currentQuestion.word.participle ?? '',
        },
        verbInput,
      )
    : null
```

문제 렌더 영역에서 기존 한 줄 `<input>`(435행 부근)을 감싸, 동사 문제면 대신
`VerbAnswerFields`를 그린다. 지문은 기존 "뜻 → 스펠링" 문제가 쓰던 자리를 그대로 쓰고
`currentQuestion.word.meaning`을 보여준다:

```tsx
{currentQuestion.type === 'verb' ? (
  <VerbAnswerFields
    value={verbInput}
    onChange={setVerbInput}
    onSubmit={() => submit()}
    result={verbResult}
    correct={{
      term: currentQuestion.word.term,
      past: currentQuestion.word.past ?? '',
      participle: currentQuestion.word.participle ?? '',
    }}
    disabled={!!answers[qIndex]}
  />
) : (
  /* 기존 <input> 그대로 */
)}
```

동사 단어장이면 `generateQuestions`에 `mode: 'verb'`를 넘긴다. 단어장 정보를 받아오는 자리에서
`kind === 'verb'`인지 보고 정한다(`grep -n "generateQuestions" src/pages/Quiz.tsx`로 호출부를 찾는다).

- [ ] **Step 4: 빌드**

Run: `npm run build`
Expected: 타입 오류 없음

- [ ] **Step 5: 화면에서 확인**

서버를 띄우고 `동사 3단변화 · A-B-A` 단어장으로 시험을 본다. 확인할 것:

- 뜻이 보이고 현재형·과거형·과거분사형 세 칸이 세로로 있다
- 엔터로 다음 칸으로 가고 마지막 칸에서 엔터를 누르면 채점된다
- 세 칸을 다 맞히면 정답 처리된다
- **한 칸만 틀리면 그 칸만 빨갛게 되고 아래에 정답이 보인다**
- **세 칸 중 일부만 채우고 넘기면** 빈 칸이 오답으로 기록되고 화면이 깨지지 않는다
- **1라운드에서 틀린 동사 문항이 2라운드에 다시 나오고** 그때도 세 칸 입력이 정상이다
- 이전/다음 문제로 오가면 입력했던 세 칸이 그대로 복원된다
- 390px와 1440px 모두에서 가로 스크롤이 없다

- [ ] **Step 6: 커밋**

```bash
git add src/components/VerbAnswerFields.tsx src/pages/Quiz.tsx src/lib/quiz.ts
git commit -m "$(cat <<'EOF'
feat: 시험 화면에 동사 3단변화 문제와 칸별 오답 표시 추가

뜻을 보여주고 세 칸을 받는다. 세 칸을 모두 맞혀야 정답이고,
틀린 칸만 빨갛게 표시하며 그 아래에 정답을 보여준다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 단어장 목록 배지와 입력 화면의 동사 형식

**Files:**
- Modify: `src/pages/WordSets.tsx`
- Modify: `src/pages/TextInput.tsx`

**Interfaces:**
- Consumes: Task 1의 `parseVerbsDetailed`; Task 2의 `WordSetRecord.kind`, `createWordSet(title, words, kind)`
- Produces: 없음

- [ ] **Step 1: 목록에 배지 추가**

`src/pages/WordSets.tsx`에서 단어장 카드를 그릴 때 `set.kind === 'verb'`면 제목 옆에 작은 배지를 둔다:

```tsx
{set.kind === 'verb' && (
  <span className="rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-bold text-accent-dark">
    3단변화
  </span>
)}
```

- [ ] **Step 2: 입력 화면에 형식 전환 추가**

`src/pages/TextInput.tsx`에 형식 상태를 더한다:

```tsx
const [kind, setKind] = useState<'vocab' | 'verb'>('vocab')
```

제목 입력 아래에 두 칸짜리 전환을 둔다:

```tsx
<div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
  {(['vocab', 'verb'] as const).map((k) => (
    <button
      key={k}
      type="button"
      onClick={() => setKind(k)}
      aria-pressed={kind === k}
      className={`h-10 rounded-lg text-[14px] font-semibold ${
        kind === k ? 'bg-white text-primary shadow-sm' : 'text-ink-muted'
      }`}
    >
      {k === 'vocab' ? '일반 단어' : '동사 3단변화'}
    </button>
  ))}
</div>
```

안내 문구와 미리보기, 저장이 `kind`를 따르게 한다. 동사일 때 안내는 다음과 같이 쓴다:

> 한 줄에 하나씩 `번호 현재형 과거형 과거분사형 뜻` 순서로 입력하세요. 번호는 생략해도 됩니다.
> 예) `90 come came come 오다`

미리보기는 `parseVerbsDetailed(rawText)`를 쓰고, 읽은 줄은 `현재 · 과거 · 과거분사 — 뜻`으로,
읽지 못한 줄은 기존과 같이 따로 보여준다. 저장은 다음과 같다:

```tsx
const { verbs, skipped } = parseVerbsDetailed(rawText)
await createWordSet(
  title,
  verbs.map((v) => ({
    term: v.term,
    meaning: v.meaning,
    isIdiom: false,
    past: v.past,
    participle: v.participle,
  })),
  'verb',
)
```

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: 타입 오류 없음

- [ ] **Step 4: 화면에서 확인**

- 단어장 목록에서 동사 단어장 다섯 개에만 `3단변화` 배지가 보인다
- 입력 화면에서 `동사 3단변화`로 바꾸고 아래를 붙여넣으면 2개로 읽히고 1줄이 "읽지 못한 줄"로 나온다:
  ```
  1 come came come 오다
  이건 못 읽는 줄
  2 go went gone 가다
  ```
- 저장하면 목록에 배지와 함께 나타나고, 그 단어장으로 시험을 보면 세 칸 문제가 나온다

- [ ] **Step 5: 커밋**

```bash
git add src/pages/WordSets.tsx src/pages/TextInput.tsx
git commit -m "$(cat <<'EOF'
feat: 단어장 목록에 3단변화 배지, 입력 화면에 동사 형식 추가

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 오답노트 표시 보완과 배포

**Files:**
- Modify: `src/pages/WrongNotes.tsx`
- Modify: `src/pages/ParentSessionDetail.tsx`

**Interfaces:**
- Consumes: Task 2의 `WordRecord.past`/`participle`
- Produces: 없음

- [ ] **Step 1: 오답노트가 동사를 세 형태로 보여주게 수정**

`src/pages/WrongNotes.tsx`에서 단어를 보여주는 자리에, `past`가 있으면 세 형태를 함께 보여준다:

```tsx
{w.past ? `${w.term} · ${w.past} · ${w.participle}` : w.term}
```

오답노트 API가 `past`/`participle`을 내려주지 않으면 `server/routes.js`의 `GET /wrong-notes` 질의 SELECT에 두 칸을 더한다(`grep -n "wrong-notes" -A8 server/routes.js`로 확인).

- [ ] **Step 2: 시험 상세에서 동사 답안을 칸별로 보여주기**

`src/pages/ParentSessionDetail.tsx`에서 답안을 보여주는 자리에 작은 도우미를 두고,
`questionType === 'verb'`이고 세 조각으로 갈라질 때만 칸별로 보여준다. 갈라지지 않으면
(옛 기록 등) 지금처럼 문자열 그대로 보여준다:

```tsx
const LABELS = ['현재', '과거', '과거분사']

function AnswerCells({ value }: { value: string }) {
  const parts = value.split(' | ')
  if (parts.length !== 3) return <>{value}</>
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      {parts.map((p, i) => (
        <span key={i}>
          <span className="text-[11px] text-ink-muted">{LABELS[i]} </span>
          {p.trim() === '' ? '—' : p}
        </span>
      ))}
    </span>
  )
}
```

정답과 내가 쓴 답을 보여주는 두 자리에서 `a.questionType === 'verb'`면
`<AnswerCells value={a.correctAnswer} />` / `<AnswerCells value={a.userAnswer} />`를 쓴다.

- [ ] **Step 3: 빌드와 전체 테스트**

Run: `npm test && npm run build`
Expected: 모두 통과

- [ ] **Step 4: 화면에서 확인**

동사 단어장으로 시험을 보고 몇 개를 일부러 틀린 뒤:
- 오답노트에 그 동사가 세 형태로 보인다
- 부모 화면의 시험 상세에서 내가 쓴 답과 정답이 칸별로 대조된다
- 기존 일반 단어장의 오답노트·시험 상세가 그대로 보인다

- [ ] **Step 5: 커밋과 배포**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: 오답노트와 시험 상세에서 동사 3단변화를 세 형태로 보여줌

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

- [ ] **Step 6: 배포 확인**

운영에 새 번들이 올라갔는지 로컬 빌드 해시와 대조한다. 서비스워커 캐시 때문에 첫 접속은
이전 화면이 보일 수 있으므로 새로고침 한 번을 안내한다.
