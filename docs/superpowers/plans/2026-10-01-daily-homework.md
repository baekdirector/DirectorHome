# 매일 숙제 (Daily Homework) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부모가 `/admin`에서 단어장·기간·문제 수를 정해 숙제를 배정하면, 아이 홈 화면에 오늘 숙제와 밀린 숙제가 뜨고, 숙제를 눌러 다 맞히면 완료로 기록된다.

**Architecture:** 숙제는 날짜마다 한 행(`homework` 테이블)이고 기간 배정은 서버가 날짜별로 펼쳐 넣는다. 완료는 그 행에 직접 기록한다 — 기존 시험 기록에서 추론하면 밀린 숙제 여러 개가 한 번에 완료되기 때문이다. "오늘"이 며칠인지는 서버(UTC)가 아니라 아이 기기가 `YYYY-MM-DD`로 알려준다.

**Tech Stack:** React 19, Vite, Tailwind v4, React Router v7(declarative), Express 5, `pg` + Neon Postgres, vitest, Playwright(수동 검증 스크립트)

**Spec:** `docs/superpowers/specs/2026-10-01-daily-homework-design.md`

## Global Constraints

- **타입체크는 `npm run build`로만 한다.** `tsconfig.json`이 solution-style(`"files": []` + references)이라 `npx tsc --noEmit -p .`는 아무것도 검사하지 않는다.
- 전체 테스트는 `npm test` (vitest). 현재 142개가 통과한다.
- `@testing-library`가 없다. React 흐름은 Playwright 스크립트로 검증한다. Playwright는 스크래치패드의 `node_modules`에 있다.
- 날짜는 **시간대 없는 달력 날짜 문자열 `YYYY-MM-DD`** 로만 주고받는다. `Date`에 하루를 더하는 계산은 서머타임이 있는 지역에서 하루가 겹치거나 빠지므로, 날짜 산술은 **UTC 기준으로만** 한다.
- `question_count`는 `0`이 "전체"를 뜻한다.
- 화면은 390px(모바일)과 1440px(PC) 모두에서 가로 스크롤이 없어야 한다.
- 설명·버튼·오류 문구는 모두 한국어다. 기존 화면의 말투(존댓말, "~해요")를 따른다.
- 서버 라우트는 `server/routes.js`에 더하고, 테이블은 `server/db.js`의 `migrate()` 안에 `CREATE TABLE IF NOT EXISTS`로 더한다(멱등해야 한다).
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`를 넣는다.
- **배포(`git push origin main`)는 이 계획의 태스크에 포함되지 않는다.** 최종 리뷰와 수정 패스가 끝난 뒤 브랜치 마무리 단계에서 한다.

## Review Focus

- **자정 경계** — 밤 11시 59분에 보던 홈을 자정 넘어 다시 열면, 어제 숙제가 "오늘의 숙제"가 아니라 "밀린 숙제"로 바뀌어야 한다. 기기 지역 날짜를 쓰므로 `toISOString()`을 쓰면 한국 시간 오전 9시 이전에 날짜가 하루 밀린다. → Task 1
- **같은 날짜에 숙제 두 개** — 홈에 카드가 두 개 뜨고, 하나를 끝내도 다른 하나는 남아야 한다. → Task 2(서버), Task 5(홈)
- **완료 멱등** — 같은 숙제를 두 번 다 맞혀도 처음 완료 시각과 groupId가 유지되어야 한다. → Task 2
- **단어가 0개인 숙제** — 단어장의 단어를 모두 지우면 숙제 카드가 눌리지 않고 "단어가 없어요"로 보여야 한다. 아이가 눌렀는데 빈 시험이 뜨면 안 된다. → Task 5
- **숙제 불러오기 실패** — 숙제 API가 죽어도 홈의 통계·오답노트·단어장은 그대로 보여야 한다. 홈 전체가 막히면 안 된다. → Task 5

---

### Task 1: 날짜와 상태를 다루는 순수 함수

**Files:**
- Create: `src/lib/homework.ts`
- Test: `src/lib/homework.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `localDateString(d?: Date): string`, `shiftDate(date: string, days: number): string`, `nextDate(date: string): string`, `expandDateRange(from: string, to: string): string[]`, `dayCount(from: string, to: string): number`, `formatDueDate(date: string): string`, `homeworkState(hw: { dueDate: string; completedAt: number | null }, today: string): HomeworkState`, `type HomeworkState = 'today' | 'today-done' | 'overdue' | 'done' | 'upcoming'`

**설계 문서와 다른 점:** 설계 12절은 `src/lib/quizProgress.ts`를 고칠 파일로 적었지만, 그 모듈은 이미 임의의 열쇠 문자열을 받는다(`loadQuizProgress(idsKey: string)`). 숙제는 `hw-12`를 넘기기만 하면 되므로 **그 파일은 고치지 않는다.**

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/homework.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  dayCount,
  expandDateRange,
  formatDueDate,
  homeworkState,
  localDateString,
  nextDate,
  shiftDate,
} from './homework'

describe('localDateString', () => {
  it('그 기기의 지역 날짜를 YYYY-MM-DD로 준다', () => {
    expect(localDateString(new Date(2026, 9, 2, 14, 30))).toBe('2026-10-02')
  })

  it('월과 일을 두 자리로 채운다', () => {
    expect(localDateString(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05')
  })

  // toISOString()을 쓰면 한국 시간 오전 9시 이전이 전날 UTC로 바뀌어 하루가 밀린다.
  it('새벽에도 그날 날짜를 준다', () => {
    expect(localDateString(new Date(2026, 9, 2, 0, 30))).toBe('2026-10-02')
  })

  it('밤 늦게도 그날 날짜를 준다', () => {
    expect(localDateString(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02')
  })
})

describe('shiftDate', () => {
  it('날짜를 앞뒤로 옮긴다', () => {
    expect(shiftDate('2026-10-02', 7)).toBe('2026-10-09')
    expect(shiftDate('2026-10-02', -7)).toBe('2026-09-25')
    expect(shiftDate('2026-10-02', 0)).toBe('2026-10-02')
  })

  it('월과 연을 거꾸로도 넘긴다', () => {
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('nextDate', () => {
  it('하루를 더한다', () => {
    expect(nextDate('2026-10-02')).toBe('2026-10-03')
  })

  it('월말을 넘긴다', () => {
    expect(nextDate('2026-10-31')).toBe('2026-11-01')
  })

  it('연말을 넘긴다', () => {
    expect(nextDate('2026-12-31')).toBe('2027-01-01')
  })

  it('윤년 2월을 넘긴다', () => {
    expect(nextDate('2028-02-28')).toBe('2028-02-29')
  })
})

describe('expandDateRange', () => {
  it('하루짜리는 그 하루만 준다', () => {
    expect(expandDateRange('2026-10-02', '2026-10-02')).toEqual(['2026-10-02'])
  })

  it('기간을 하루씩 모두 펼친다', () => {
    expect(expandDateRange('2026-10-02', '2026-10-05')).toEqual([
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ])
  })

  it('월을 넘겨도 날짜가 빠지지 않는다', () => {
    expect(expandDateRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
  })

  it('거꾸로 주면 빈 목록을 준다', () => {
    expect(expandDateRange('2026-10-05', '2026-10-02')).toEqual([])
  })

  it('날짜 형식이 아니면 빈 목록을 준다', () => {
    expect(expandDateRange('', '2026-10-02')).toEqual([])
  })
})

describe('dayCount', () => {
  it('배정 버튼에 쓸 날짜 수를 센다', () => {
    expect(dayCount('2026-10-02', '2026-10-08')).toBe(7)
    expect(dayCount('2026-10-02', '2026-10-02')).toBe(1)
    expect(dayCount('2026-10-08', '2026-10-02')).toBe(0)
  })
})

describe('formatDueDate', () => {
  it('"10월 2일 (금)"으로 보여준다', () => {
    expect(formatDueDate('2026-10-02')).toBe('10월 2일 (금)')
  })
})

describe('homeworkState', () => {
  const today = '2026-10-02'

  it('오늘 날짜이고 안 끝냈으면 today', () => {
    expect(homeworkState({ dueDate: today, completedAt: null }, today)).toBe('today')
  })

  it('오늘 날짜이고 끝냈으면 today-done', () => {
    expect(homeworkState({ dueDate: today, completedAt: 1 }, today)).toBe('today-done')
  })

  it('지난 날짜이고 안 끝냈으면 overdue', () => {
    expect(homeworkState({ dueDate: '2026-09-30', completedAt: null }, today)).toBe('overdue')
  })

  it('지난 날짜이고 끝냈으면 done', () => {
    expect(homeworkState({ dueDate: '2026-09-30', completedAt: 1 }, today)).toBe('done')
  })

  it('앞으로 올 날짜면 upcoming', () => {
    expect(homeworkState({ dueDate: '2026-10-03', completedAt: null }, today)).toBe('upcoming')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/homework.test.ts`
Expected: FAIL — `Failed to resolve import "./homework"`

- [ ] **Step 3: 구현**

`src/lib/homework.ts`:

```ts
const DAY_MS = 24 * 60 * 60 * 1000
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 그 기기의 지역 날짜를 "2026-10-02"로.
 * toISOString()을 쓰면 UTC로 바뀌어 한국 시간 오전 9시 이전이 전날이 된다.
 */
export function localDateString(d: Date = new Date()): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

// 날짜 산술은 UTC로만 한다. 지역 시간으로 하루를 더하면 서머타임이 있는 지역에서
// 같은 날이 두 번 나오거나 하루가 통째로 빠진다.
function toUtcMs(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return NaN
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function fromUtcMs(ms: number): string {
  const d = new Date(ms)
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${month}-${day}`
}

/** 날짜를 days만큼 앞뒤로 옮긴다. 음수면 과거로. */
export function shiftDate(date: string, days: number): string {
  const ms = toUtcMs(date)
  if (Number.isNaN(ms)) return date
  return fromUtcMs(ms + days * DAY_MS)
}

export function nextDate(date: string): string {
  return shiftDate(date, 1)
}

/** 시작일~종료일을 하루씩 펼친다. 거꾸로 주거나 형식이 틀리면 빈 목록. */
export function expandDateRange(from: string, to: string): string[] {
  const start = toUtcMs(from)
  const end = toUtcMs(to)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return []
  const out: string[] = []
  for (let t = start; t <= end; t += DAY_MS) out.push(fromUtcMs(t))
  return out
}

export function dayCount(from: string, to: string): number {
  return expandDateRange(from, to).length
}

/** "10월 2일 (금)" */
export function formatDueDate(date: string): string {
  const ms = toUtcMs(date)
  if (Number.isNaN(ms)) return date
  const d = new Date(ms)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${DAY_LABELS[d.getUTCDay()]})`
}

export type HomeworkState = 'today' | 'today-done' | 'overdue' | 'done' | 'upcoming'

/** 홈 카드의 색과 문구를 정하는 상태. 날짜 문자열은 사전순 비교가 곧 날짜순 비교다. */
export function homeworkState(
  hw: { dueDate: string; completedAt: number | null },
  today: string,
): HomeworkState {
  if (hw.completedAt !== null) return hw.dueDate === today ? 'today-done' : 'done'
  if (hw.dueDate === today) return 'today'
  return hw.dueDate < today ? 'overdue' : 'upcoming'
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/homework.test.ts`
Expected: PASS, 22개 통과

- [ ] **Step 5: 커밋**

```bash
git add src/lib/homework.ts src/lib/homework.test.ts
git commit -m "$(cat <<'EOF'
feat: 숙제 날짜·상태 순수 함수 추가

날짜 산술은 UTC로만 해서 서머타임에 하루가 겹치거나 빠지지 않게 하고,
"오늘"은 기기 지역 날짜로 읽는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: homework 테이블과 서버 API

**Files:**
- Modify: `server/db.js` (`migrate()` 안, `CREATE INDEX idx_opic_questions_hash` 줄 뒤)
- Modify: `server/routes.js` (`// ---- quiz rounds ----` 블록 앞에 `// ---- homework ----` 블록을 넣는다)
- Modify: `src/lib/db.ts` (숙제 타입과 호출 함수)

**Interfaces:**
- Consumes: Task 1의 `expandDateRange` — **쓰지 않는다.** 서버는 `server/`에서 돌고 `src/lib`을 import 하지 않는 구조다(기존 라우트도 그렇다). 서버는 Postgres의 `generate_series`로 날짜를 펼친다.
- Produces: `HomeworkRecord`, `HomeworkWordSet`, `PendingHomework` 타입과 `getHomework`, `getPendingHomework`, `getHomeworkById`, `createHomework`, `completeHomework`, `deleteHomework` 함수

- [ ] **Step 1: 테이블 추가**

`server/db.js`의 `migrate()` 안, `CREATE INDEX IF NOT EXISTS idx_opic_questions_hash ON opic_questions(answer_hash);` 바로 뒤에 넣는다:

```sql
    -- ---- 매일 숙제 ----
    -- 숙제는 날짜마다 한 행이다. 기간 배정은 서버가 날짜별로 펼쳐 넣는다.
    -- due_date를 시간대 없는 DATE로 두는 이유: 서버는 UTC로 도는데 "오늘"은 아이가 있는
    -- 곳의 달력 날짜다. 클라이언트가 자기 지역 날짜를 문자열로 보내 비교만 한다.
    CREATE TABLE IF NOT EXISTS homework (
      id SERIAL PRIMARY KEY,
      due_date DATE NOT NULL,
      word_set_ids INTEGER[] NOT NULL,
      -- 0이면 고른 단어장의 단어를 전부 낸다.
      question_count INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      -- NULL이면 아직 안 끝낸 숙제다.
      completed_at BIGINT,
      completed_group_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_homework_due_date ON homework(due_date);
```

같은 날짜에 숙제를 여러 개 낼 수 있어야 하므로 UNIQUE 제약을 두지 않는다.

- [ ] **Step 2: 서버 라우트 추가**

`server/routes.js`에서 `// ---- quiz rounds ----` 주석 바로 앞에 넣는다:

```js
// ---- 매일 숙제 ----

// due_date는 DATE라 pg가 Date 객체로 돌려준다. 그대로 JSON에 넣으면 UTC 시각 문자열이
// 되어 시간대가 섞이므로, 달력 날짜 문자열로 되돌린다.
function toDateString(value) {
  if (typeof value === 'string') return value.slice(0, 10)
  const d = new Date(value)
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${month}-${day}`
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 92

/**
 * 숙제 행들에 단어장 제목과 현재 단어 수를 붙인다.
 * 지워진 단어장 id는 조인에서 빠지므로 조용히 사라진다(설계 3.5).
 */
async function withWordSets(rows) {
  if (rows.length === 0) return []
  const ids = [...new Set(rows.flatMap((r) => r.wordSetIds))]
  const { rows: sets } = await pool.query(
    `SELECT ws.id, ws.title, COUNT(w.id)::int AS count
     FROM word_sets ws LEFT JOIN words w ON w.word_set_id = ws.id
     WHERE ws.id = ANY($1::int[])
     GROUP BY ws.id, ws.title`,
    [ids],
  )
  const byId = new Map(sets.map((s) => [s.id, s]))
  return rows.map((r) => ({
    ...r,
    dueDate: toDateString(r.dueDate),
    wordSets: r.wordSetIds.map((id) => byId.get(id)).filter(Boolean),
  }))
}

const HOMEWORK_COLUMNS = `id, due_date AS "dueDate", word_set_ids AS "wordSetIds",
         question_count AS "questionCount", created_at AS "createdAt",
         completed_at AS "completedAt", completed_group_id AS "completedGroupId"`

router.get('/homework', async (req, res) => {
  const { from, to } = req.query
  if (!DATE_RE.test(from ?? '') || !DATE_RE.test(to ?? '')) {
    return res.status(400).json({ error: 'from, to (YYYY-MM-DD) required' })
  }
  const { rows } = await pool.query(
    `SELECT ${HOMEWORK_COLUMNS} FROM homework WHERE due_date BETWEEN $1 AND $2 ORDER BY due_date, id`,
    [from, to],
  )
  res.json(await withWordSets(rows))
})

// 아이 홈 화면용. 오늘 숙제는 끝냈어도 돌려준다("오늘 숙제 다 했어요"를 보여주려고).
// 밀린 숙제는 안 끝낸 것만, 오래된 것부터.
router.get('/homework/pending', async (req, res) => {
  const today = req.query.today
  if (!DATE_RE.test(today ?? '')) {
    return res.status(400).json({ error: 'today (YYYY-MM-DD) required' })
  }
  const { rows } = await pool.query(
    `SELECT ${HOMEWORK_COLUMNS} FROM homework
     WHERE due_date = $1 OR (due_date < $1 AND completed_at IS NULL)
     ORDER BY due_date, id`,
    [today],
  )
  const all = await withWordSets(rows)
  res.json({
    today: all.filter((h) => h.dueDate === today),
    overdue: all.filter((h) => h.dueDate < today),
  })
})

router.get('/homework/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${HOMEWORK_COLUMNS} FROM homework WHERE id = $1`, [
    req.params.id,
  ])
  if (!rows[0]) return res.status(404).json({ error: 'not found' })
  const [row] = await withWordSets(rows)
  res.json(row)
})

router.post('/homework', async (req, res) => {
  const { fromDate, toDate, wordSetIds, questionCount } = req.body ?? {}
  if (!DATE_RE.test(fromDate ?? '') || !DATE_RE.test(toDate ?? '')) {
    return res.status(400).json({ error: 'fromDate, toDate (YYYY-MM-DD) required' })
  }
  if (!Array.isArray(wordSetIds) || wordSetIds.length === 0) {
    return res.status(400).json({ error: 'wordSetIds required' })
  }
  if (toDate < fromDate) return res.status(400).json({ error: 'toDate must not precede fromDate' })
  const count = Number.isInteger(questionCount) && questionCount >= 0 ? questionCount : 0

  // 날짜를 Postgres가 펼친다. 실수로 몇 년치를 넣는 것을 막는다.
  const { rows } = await pool.query(
    `INSERT INTO homework (due_date, word_set_ids, question_count, created_at)
     SELECT d::date, $3::int[], $4, $5
     FROM generate_series($1::date, $2::date, interval '1 day') AS d
     WHERE $2::date - $1::date < $6
     RETURNING ${HOMEWORK_COLUMNS}`,
    [fromDate, toDate, wordSetIds, count, Date.now(), MAX_RANGE_DAYS],
  )
  if (rows.length === 0) {
    return res.status(400).json({ error: `range must be at most ${MAX_RANGE_DAYS} days` })
  }
  res.json(await withWordSets(rows))
})

// 이미 끝낸 숙제는 그대로 둔다. 아이가 같은 숙제를 또 다 맞혀도 처음 기록이 남는다.
router.post('/homework/:id/complete', async (req, res) => {
  const groupId = req.body?.groupId
  if (typeof groupId !== 'string' || groupId === '') {
    return res.status(400).json({ error: 'groupId required' })
  }
  await pool.query(
    `UPDATE homework SET completed_at = $1, completed_group_id = $2
     WHERE id = $3 AND completed_at IS NULL`,
    [Date.now(), groupId, req.params.id],
  )
  res.json({ ok: true })
})

router.delete('/homework/:id', async (req, res) => {
  await pool.query(`DELETE FROM homework WHERE id = $1`, [req.params.id])
  res.json({ ok: true })
})
```

**주의:** `router.get('/homework/pending')`은 `router.get('/homework/:id')`보다 **먼저** 와야 한다. 순서가 바뀌면 `pending`이 `:id`로 잡혀 숫자가 아닌 id로 질의하다 500이 난다. 위 코드는 그 순서를 지키고 있다.

- [ ] **Step 3: 클라이언트 호출 함수 추가**

`src/lib/db.ts` 끝에 더한다:

```ts
export interface HomeworkWordSet {
  id: number
  title: string
  count: number
}

export interface HomeworkRecord {
  id: number
  /** "2026-10-02" — 시간대 없는 달력 날짜 */
  dueDate: string
  wordSetIds: number[]
  /** 실제로 남아 있는 단어장만. 지워진 단어장은 빠진다. */
  wordSets: HomeworkWordSet[]
  /** 0이면 전체 */
  questionCount: number
  createdAt: number
  completedAt: number | null
  completedGroupId: string | null
}

export interface PendingHomework {
  today: HomeworkRecord[]
  /** 오래된 것부터 */
  overdue: HomeworkRecord[]
}

export function getHomework(from: string, to: string): Promise<HomeworkRecord[]> {
  return api(`/homework?from=${from}&to=${to}`)
}

export function getPendingHomework(today: string): Promise<PendingHomework> {
  return api(`/homework/pending?today=${today}`)
}

export function getHomeworkById(id: number): Promise<HomeworkRecord> {
  return api(`/homework/${id}`)
}

export function createHomework(input: {
  fromDate: string
  toDate: string
  wordSetIds: number[]
  questionCount: number
}): Promise<HomeworkRecord[]> {
  return api('/homework', { method: 'POST', body: JSON.stringify(input) })
}

export function completeHomework(id: number, groupId: string): Promise<void> {
  return api(`/homework/${id}/complete`, { method: 'POST', body: JSON.stringify({ groupId }) })
}

export function deleteHomework(id: number): Promise<void> {
  return api(`/homework/${id}`, { method: 'DELETE' })
}
```

- [ ] **Step 4: 빌드**

Run: `npm run build`
Expected: 타입 오류 없음

- [ ] **Step 5: 서버를 띄우고 API를 직접 확인한다**

서버 실행(`DATABASE_URL`은 Neon 주소):

```bash
DATABASE_URL="<neon url>" PORT=3000 node server/index.js
```

확인 스크립트를 스크래치패드에 만들어 실행한다. 이 스크립트는 **Review Focus의 "같은 날짜에 숙제 두 개"와 "완료 멱등"을 검사한다.**

```js
// check-homework-api.mjs
const BASE = 'http://localhost:3000/api'
const j = async (path, init) => {
  const r = await fetch(BASE + path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : r.json()
}
let fail = 0
const ck = (n, ok, x = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`)
  if (!ok) fail++
}

const sets = await j('/wordsets')
const a = sets[0].id
const b = sets[1].id

// 2026-12-01 ~ 2026-12-07 (실제 날짜와 겹치지 않는 미래로 잡아 기존 데이터와 섞이지 않게 한다)
const made = await j('/homework', {
  method: 'POST',
  body: JSON.stringify({ fromDate: '2026-12-01', toDate: '2026-12-07', wordSetIds: [a], questionCount: 20 }),
})
ck('기간 7일이 7행으로 펼쳐진다', made.length === 7, `${made.length}행`)
ck('날짜가 달력 날짜 문자열이다', made[0].dueDate === '2026-12-01', made[0].dueDate)
ck('단어장 제목이 붙어 온다', made[0].wordSets[0]?.title !== undefined)

// 같은 날짜에 두 번째 숙제
const second = await j('/homework', {
  method: 'POST',
  body: JSON.stringify({ fromDate: '2026-12-01', toDate: '2026-12-01', wordSetIds: [b], questionCount: 10 }),
})
const onDec1 = (await j('/homework?from=2026-12-01&to=2026-12-01')).length
ck('같은 날짜에 숙제 두 개가 공존한다', onDec1 === 2, `${onDec1}개`)

// 완료는 멱등
await j(`/homework/${made[0].id}/complete`, { method: 'POST', body: JSON.stringify({ groupId: 'g-first' }) })
const afterFirst = await j(`/homework/${made[0].id}`)
await j(`/homework/${made[0].id}/complete`, { method: 'POST', body: JSON.stringify({ groupId: 'g-second' }) })
const afterSecond = await j(`/homework/${made[0].id}`)
ck('완료가 멱등이다 (처음 기록 유지)',
  afterSecond.completedAt === afterFirst.completedAt && afterSecond.completedGroupId === 'g-first',
  afterSecond.completedGroupId)

// pending: 끝낸 오늘 숙제는 today에, 안 끝낸 지난 숙제는 overdue에
const pending = await j('/homework/pending?today=2026-12-03')
ck('오늘 숙제만 today에 들어간다', pending.today.every((h) => h.dueDate === '2026-12-03'))
ck('밀린 숙제는 안 끝낸 것만', pending.overdue.every((h) => h.completedAt === null))
ck('밀린 숙제는 오래된 것부터',
  pending.overdue.every((h, i, arr) => i === 0 || arr[i - 1].dueDate <= h.dueDate))
ck('끝낸 12/1은 밀린 목록에 없다', !pending.overdue.some((h) => h.id === made[0].id))

// 검증 실패
const bad = await fetch(BASE + '/homework', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fromDate: '2026-12-05', toDate: '2026-12-01', wordSetIds: [a], questionCount: 0 }),
})
ck('기간을 거꾸로 주면 400', bad.status === 400, String(bad.status))

const tooLong = await fetch(BASE + '/homework', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fromDate: '2026-12-01', toDate: '2027-12-01', wordSetIds: [a], questionCount: 0 }),
})
ck('92일을 넘기면 400', tooLong.status === 400, String(tooLong.status))

const noSets = await fetch(BASE + '/homework', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fromDate: '2026-12-01', toDate: '2026-12-01', wordSetIds: [], questionCount: 0 }),
})
ck('단어장을 안 고르면 400', noSets.status === 400, String(noSets.status))

// 뒷정리
for (const h of [...made, ...second]) await j(`/homework/${h.id}`, { method: 'DELETE' })
const left = await j('/homework?from=2026-12-01&to=2026-12-31')
ck('뒷정리로 모두 지워졌다', left.length === 0, `${left.length}개 남음`)

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`)
process.exit(fail === 0 ? 0 : 1)
```

Run: `node check-homework-api.mjs`
Expected: ALL PASS (13개 항목)

- [ ] **Step 6: 커밋**

```bash
git add server/db.js server/routes.js src/lib/db.ts
git commit -m "$(cat <<'EOF'
feat: 숙제 테이블과 API 추가

기간 배정은 generate_series로 날짜별 행을 만들고, 완료는 이미 끝난
숙제를 건드리지 않아 멱등하다. due_date는 시간대 없는 DATE로 두고
"오늘"은 클라이언트가 보낸 달력 날짜와 비교한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 단어장 고르기 목록을 공용 컴포넌트로

**Files:**
- Create: `src/components/WordSetPicker.tsx`
- Modify: `src/pages/TestSelect.tsx` (목록을 그리는 부분을 교체)

**Interfaces:**
- Consumes: `WordSetItem`(`src/lib/wordSetsCache.ts`)
- Produces: `WordSetPicker` 컴포넌트

`TestSelect`의 목록에는 날짜·테스트 횟수·"이어서 풀 수 있어요" 배지가 붙고, `/admin`의 목록에는 그런 게 없다. 선택 동작(체크박스 모양, 눌러서 토글, 선택 색)만 공유하고 **그 아래 한 줄은 호출하는 쪽이 그린다**(`renderMeta`).

- [ ] **Step 1: 컴포넌트 작성**

`src/components/WordSetPicker.tsx`:

```tsx
import type { ReactNode } from 'react'
import { CheckIcon } from './icons'
import type { WordSetItem } from '../lib/wordSetsCache'

/**
 * 단어장을 여러 개 고르는 목록. 테스트 시작 화면과 숙제 관리 화면이 같이 쓴다.
 * 체크 동작과 생김새만 공유하고, 제목 아래 설명 줄은 쓰는 쪽이 정한다 —
 * 테스트 화면은 날짜·응시 횟수·이어풀기를 보여주고 숙제 화면은 단어 수만 보여준다.
 */
export function WordSetPicker({
  sets,
  selected,
  onToggle,
  renderMeta,
}: {
  sets: WordSetItem[]
  selected: Set<number>
  onToggle: (id: number) => void
  renderMeta: (set: WordSetItem) => ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {sets.map((s) => {
        const checked = selected.has(s.id)
        return (
          <button
            key={s.id}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onToggle(s.id)}
            className={`m-0 flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left ${
              checked ? 'border-primary bg-primary-tint/40' : 'border-border bg-surface'
            }`}
          >
            <div
              className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg border-2 ${
                checked ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-transparent'
              }`}
            >
              <CheckIcon width={16} height={16} strokeWidth={3} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-bold">{s.title}</div>
              {renderMeta(s)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: TestSelect가 쓰게 바꾼다**

`src/pages/TestSelect.tsx`에서 `<div className="flex flex-col gap-2.5">{sortedSets.map((s) => { ... })}</div>` 전체(목록을 그리는 블록)를 아래로 바꾼다:

```tsx
          <WordSetPicker
            sets={sortedSets}
            selected={selected}
            onToggle={toggle}
            renderMeta={(s) => {
              const progress = peekQuizProgress(String(s.id))
              const attempts = attemptCounts.get(s.id) ?? 0
              return (
                <>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] font-normal text-ink-muted">
                    <span>단어 {s.count}개</span>
                    <span>· {formatDate(s.createdAt)}</span>
                    {attempts > 0 && <span>· 테스트 {attempts}회 완료</span>}
                  </div>
                  {progress && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-[11.5px] font-bold text-accent-dark">
                      이어서 풀 수 있어요 · {progress.answered}/{progress.total}
                    </div>
                  )}
                </>
              )
            }}
          />
```

import 두 줄을 더하고 쓰지 않게 된 것을 지운다:

```tsx
import { WordSetPicker } from '../components/WordSetPicker'
```

`CheckIcon`은 `WordSetPicker`로 옮겨갔으므로 `TestSelect.tsx`에서 더 쓰는 곳이 없으면 import에서 뺀다(`grep -n "CheckIcon" src/pages/TestSelect.tsx`로 확인).

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: 타입 오류 없음. 쓰지 않는 import가 남아 있으면 여기서 잡힌다.

- [ ] **Step 4: 기존 화면이 그대로인지 확인한다 (회귀)**

서버를 띄운 상태에서 Playwright로:

```js
// check-testselect-regression.mjs
import { chromium } from 'playwright'
const BASE = 'http://localhost:3000'
let fail = 0
const ck = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); if (!ok) fail++ }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => { console.log('PAGE ERROR:', e.message); fail++ })

await page.goto(`${BASE}/test`)
await page.getByText('테스트할 단어장 고르기').waitFor()
await page.waitForTimeout(1500)

const boxes = page.getByRole('checkbox')
ck('단어장 목록이 보인다', (await boxes.count()) > 0, `${await boxes.count()}개`)
const body = await page.locator('body').innerText()
ck('단어 수가 보인다', /단어 \d+개/.test(body))
ck('만든 날짜가 보인다', /\d+월 \d+일/.test(body))

await boxes.first().click()
await boxes.nth(1).click()
await page.waitForTimeout(300)
ck('두 개를 고르면 버튼 문구가 바뀐다',
  /2개 단어장 \(단어 \d+개\) 테스트 설정하기/.test(await page.locator('body').innerText()))

await page.getByRole('button', { name: /테스트 설정하기/ }).click()
await page.waitForTimeout(1500)
ck('테스트 설정 화면으로 넘어간다', await page.getByText('테스트 설정').isVisible())
ck('가로 스크롤 없음', await page.evaluate(
  () => document.documentElement.scrollWidth <= document.documentElement.clientWidth))

await browser.close()
console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURE(S)`)
process.exit(fail === 0 ? 0 : 1)
```

Run: `node check-testselect-regression.mjs`
Expected: ALL PASS (6개 항목)

- [ ] **Step 5: 커밋**

```bash
git add src/components/WordSetPicker.tsx src/pages/TestSelect.tsx
git commit -m "$(cat <<'EOF'
refactor: 단어장 고르기 목록을 공용 컴포넌트로 분리

숙제 관리 화면이 같은 목록을 쓴다. 제목 아래 설명 줄은 쓰는 쪽이
그리게 해서 테스트 화면의 날짜·응시 횟수·이어풀기 표시를 그대로 둔다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 부모 숙제 관리 화면 `/admin`

**Files:**
- Create: `src/pages/Admin.tsx`
- Modify: `src/App.tsx` (경로 추가)

**Interfaces:**
- Consumes: Task 1의 `localDateString`, `nextDate`, `dayCount`, `formatDueDate`; Task 2의 `getHomework`, `createHomework`, `deleteHomework`, `HomeworkRecord`; Task 3의 `WordSetPicker`
- Produces: 없음

- [ ] **Step 1: 화면 작성**

`src/pages/Admin.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccessGate } from '../components/AccessGate'
import { ArrowLeftIcon, CheckCircleIcon, TrashIcon } from '../components/icons'
import { Loading } from '../components/Loading'
import { WordSetPicker } from '../components/WordSetPicker'
import {
  createHomework,
  deleteHomework,
  getHomework,
  getWordSets,
  type HomeworkRecord,
} from '../lib/db'
import { dayCount, formatDueDate, localDateString, nextDate, shiftDate } from '../lib/homework'
import type { WordSetItem } from '../lib/wordSetsCache'

const COUNT_OPTIONS = [5, 10, 20, 0] as const

/** 목록에 보여줄 범위: 지난 2주 ~ 앞으로 4주. 전부 불러오면 시간이 갈수록 느려진다. */
const PAST_DAYS = 14
const FUTURE_DAYS = 28

export function Admin() {
  return (
    <AccessGate>
      <AdminBody />
    </AccessGate>
  )
}

function AdminBody() {
  const navigate = useNavigate()
  const today = useMemo(() => localDateString(), [])

  const [sets, setSets] = useState<WordSetItem[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [questionCount, setQuestionCount] = useState<number>(20)

  const [list, setList] = useState<HomeworkRecord[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      const rows = await getHomework(shiftDate(today, -PAST_DAYS), shiftDate(today, FUTURE_DAYS))
      setList(rows)
    } catch {
      setError('숙제 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
      setList([])
    }
  }, [today])

  useEffect(() => {
    getWordSets()
      .then(setSets)
      .catch(() => setSets([]))
    void reload()
  }, [reload])

  const days = dayCount(fromDate, toDate)
  const canAssign = selected.size > 0 && days > 0 && days <= 92 && !saving

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function assign() {
    if (!canAssign) return
    setSaving(true)
    setError('')
    try {
      await createHomework({
        fromDate,
        toDate,
        wordSetIds: [...selected],
        questionCount,
      })
      // 날마다 다른 단어장을 내는 것이 주된 사용법이라, 배정하고 나면 다음 날로 넘어가고
      // 선택을 풀어 둔다. 체크 → 배정만 반복하면 일주일치를 다르게 낼 수 있다.
      const after = nextDate(toDate)
      setFromDate(after)
      setToDate(after)
      setSelected(new Set())
      await reload()
    } catch {
      setError('숙제를 내지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    setList((prev) => prev?.filter((h) => h.id !== id) ?? null)
    try {
      await deleteHomework(id)
    } catch {
      setError('숙제를 지우지 못했어요. 목록을 새로 불러옵니다.')
      await reload()
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <div className="flex flex-none items-center gap-3 px-[18px] pt-[18px]">
        <button
          type="button"
          aria-label="홈으로"
          onClick={() => navigate('/')}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-ink"
        >
          <ArrowLeftIcon />
        </button>
        <h2 className="m-0 text-[17px] font-bold">숙제 관리</h2>
      </div>

      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-5 overflow-y-auto px-[22px] py-5">
        <section>
          <h3 className="m-0 text-[15px] font-extrabold">숙제 내기</h3>

          <p className="m-0 mt-3 text-[13px] font-bold text-ink-muted">단어장 고르기</p>
          <div className="mt-1.5">
            {sets === null ? (
              <Loading />
            ) : sets.length === 0 ? (
              <p className="m-0 py-4 text-center text-[13.5px] text-ink-muted">
                아직 단어장이 없어요. 먼저 단어장을 만들어주세요.
              </p>
            ) : (
              <WordSetPicker
                sets={sets}
                selected={selected}
                onToggle={toggle}
                renderMeta={(s) => (
                  <div className="mt-0.5 text-[12.5px] font-normal text-ink-muted">
                    단어 {s.count}개
                  </div>
                )}
              />
            )}
          </div>

          <p className="m-0 mt-4 text-[13px] font-bold text-ink-muted">기간</p>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="date"
              aria-label="시작일"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value)
                if (e.target.value > toDate) setToDate(e.target.value)
              }}
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-primary"
            />
            <span className="flex-none text-ink-muted">~</span>
            <input
              type="date"
              aria-label="종료일"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-primary"
            />
          </div>

          <p className="m-0 mt-4 text-[13px] font-bold text-ink-muted">문제 수</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setQuestionCount(n)}
                aria-pressed={questionCount === n}
                className={`h-10 rounded-xl text-[14px] font-semibold ${
                  questionCount === n
                    ? 'bg-primary text-white'
                    : 'border border-border bg-surface text-ink-muted'
                }`}
              >
                {n === 0 ? '전체' : n}
              </button>
            ))}
          </div>

          {days === 0 && (
            <p className="m-0 mt-2 text-[12.5px] font-semibold text-error">
              종료일이 시작일보다 빨라요.
            </p>
          )}
          {days > 92 && (
            <p className="m-0 mt-2 text-[12.5px] font-semibold text-error">
              기간은 92일까지만 낼 수 있어요.
            </p>
          )}

          <button
            type="button"
            disabled={!canAssign}
            onClick={assign}
            className="mt-4 w-full rounded-2xl bg-primary p-[15px] text-[15.5px] font-bold text-white disabled:opacity-40"
          >
            {saving ? '내는 중...' : selected.size === 0 ? '단어장을 골라주세요' : `${days}일치 숙제 내기`}
          </button>
          {error && <p className="m-0 mt-2 text-[12.5px] font-semibold text-error">{error}</p>}
        </section>

        <section>
          <h3 className="m-0 text-[15px] font-extrabold">배정된 숙제</h3>
          <p className="m-0 mt-1 text-[12.5px] text-ink-muted">지난 2주와 앞으로 4주를 보여줘요</p>
          <div className="mt-2.5 flex flex-col gap-2">
            {list === null ? (
              <Loading />
            ) : list.length === 0 ? (
              <p className="m-0 py-6 text-center text-[13.5px] text-ink-muted">
                아직 배정한 숙제가 없어요.
              </p>
            ) : (
              list.map((hw) => (
                <div
                  key={hw.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[14px] font-bold">{formatDueDate(hw.dueDate)}</span>
                      {hw.completedAt !== null ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-[11.5px] font-bold text-success">
                          <CheckCircleIcon width={12} height={12} />
                          완료
                        </span>
                      ) : (
                        <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11.5px] font-bold text-ink-muted">
                          안 함
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 break-words text-[12.5px] text-ink-muted">
                      {hw.wordSets.length === 0
                        ? '단어장이 없어요'
                        : hw.wordSets.map((w) => w.title).join(' + ')}
                      {' · '}
                      {hw.questionCount === 0 ? '전체' : `${hw.questionCount}문제`}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`${formatDueDate(hw.dueDate)} 숙제 삭제`}
                    onClick={() => remove(hw.id)}
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-surface-alt text-error"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 경로 추가**

`src/App.tsx`의 `<Route path="/parent/session/:groupId" ... />` 줄 뒤에 더한다:

```tsx
        <Route path="/admin" element={<Admin />} />
```

import도 더한다:

```tsx
import { Admin } from './pages/Admin'
```

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: 타입 오류 없음

- [ ] **Step 4: 화면에서 확인한다**

서버를 띄우고 Playwright로. 비밀번호는 가계부와 같은 것을 쓴다(기존 세션에서 쓰던 값, 모르면 `src/lib/household.ts`의 `verifyPassword` 구현을 보고 확인한다).

확인할 것:

- `/admin`에 들어가면 비밀번호를 묻는다
- 비밀번호를 넣으면 "숙제 관리"가 보인다
- 단어장 하나를 고르고 기간을 오늘~오늘로 두면 버튼이 "1일치 숙제 내기"
- 종료일을 6일 뒤로 바꾸면 버튼이 "7일치 숙제 내기"
- 배정하면 아래 목록에 7줄이 생기고 모두 "안 함"
- **배정 후 시작일·종료일이 다음 날로 넘어가고 단어장 선택이 풀린다**
- 다른 단어장을 골라 다시 배정하면 그 다음 날짜에 생긴다
- 삭제 버튼을 누르면 그 줄이 사라진다
- 390px와 1440px 모두에서 가로 스크롤이 없다

확인이 끝나면 **만든 숙제를 모두 지운다**(목록의 삭제 버튼 또는 API).

- [ ] **Step 5: 커밋**

```bash
git add src/pages/Admin.tsx src/App.tsx
git commit -m "$(cat <<'EOF'
feat: 부모용 숙제 관리 화면 추가

가계부와 같은 비밀번호로 들어가 단어장·기간·문제 수를 정해 배정한다.
배정하면 날짜가 다음 날로 넘어가고 선택이 풀려, 날마다 다른 단어장을
내는 반복이 체크와 배정 두 동작으로 끝난다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 아이 홈 화면의 숙제 카드

**Files:**
- Create: `src/components/HomeworkCard.tsx`
- Modify: `src/pages/Home.tsx`

**Interfaces:**
- Consumes: Task 1의 `localDateString`, `formatDueDate`, `homeworkState`; Task 2의 `getPendingHomework`, `HomeworkRecord`
- Produces: `HomeworkCard` 컴포넌트

- [ ] **Step 1: 카드 컴포넌트 작성**

`src/components/HomeworkCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { CheckCircleIcon, ChevronRightIcon, ClockIcon } from './icons'
import type { HomeworkRecord } from '../lib/db'
import { formatDueDate, homeworkState } from '../lib/homework'

/** 숙제에 실제로 낼 수 있는 단어가 있는지. 단어장이 지워졌거나 비면 풀 수 없다. */
export function homeworkWordCount(hw: HomeworkRecord): number {
  return hw.wordSets.reduce((sum, w) => sum + w.count, 0)
}

export function HomeworkCard({ homework, today }: { homework: HomeworkRecord; today: string }) {
  const state = homeworkState(homework, today)
  const words = homeworkWordCount(homework)
  const titles = homework.wordSets.map((w) => w.title).join(' + ')
  const count = homework.questionCount === 0 ? words : Math.min(homework.questionCount, words)

  // 풀 단어가 없으면 들어가 봐야 빈 시험이 뜬다. 눌리지 않게 막고 이유를 보여준다.
  if (words === 0) {
    return (
      <div className="flex items-center gap-3.5 rounded-[20px] border border-border bg-surface p-4.5 opacity-60">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-surface-alt">
          <ClockIcon width={20} height={20} className="text-ink-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold">{formatDueDate(homework.dueDate)} 숙제</div>
          <div className="mt-0.5 text-[12.5px] text-ink-muted">단어가 없어요</div>
        </div>
      </div>
    )
  }

  if (state === 'today-done') {
    return (
      <Link
        to={`/quiz/homework/${homework.id}`}
        className="flex items-center gap-3.5 rounded-[20px] border border-success/40 bg-success-tint p-4.5"
      >
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/70">
          <CheckCircleIcon width={20} height={20} className="text-success" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold text-primary-dark">오늘 숙제 다 했어요!</div>
          <div className="mt-0.5 truncate text-[12.5px] text-primary-dark/80">{titles}</div>
        </div>
        <ChevronRightIcon width={18} height={18} className="text-primary-dark" />
      </Link>
    )
  }

  if (state === 'overdue') {
    return (
      <Link
        to={`/quiz/homework/${homework.id}`}
        className="flex items-center gap-3.5 rounded-[20px] border border-accent/40 bg-accent-tint p-4.5"
      >
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/70">
          <ClockIcon width={20} height={20} className="text-accent-dark" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold text-accent-dark">
            밀린 숙제 · {formatDueDate(homework.dueDate)}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-accent-dark/80">
            {titles} · {count}문제
          </div>
        </div>
        <ChevronRightIcon width={18} height={18} className="text-accent-dark" />
      </Link>
    )
  }

  return (
    <Link
      to={`/quiz/homework/${homework.id}`}
      className="flex items-center gap-3.5 rounded-[20px] bg-primary p-4.5 shadow-[0_8px_20px_-10px_rgba(20,79,76,0.55)]"
    >
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/20">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white">
          <path d="M8 5l11 7-11 7Z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-bold text-white">오늘의 숙제</div>
        <div className="mt-0.5 truncate text-[12.5px] text-white/85">
          {titles} · {count}문제
        </div>
      </div>
      <ChevronRightIcon width={18} height={18} className="text-white" />
    </Link>
  )
}
```

`ClockIcon`이 `src/components/icons`에 없으면 그 파일에 더한다(다른 아이콘과 같은 모양으로):

```tsx
export function ClockIcon({ width = 24, height = 24, className = '', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
```

`IconProps`의 정확한 이름과 모양은 `src/components/icons.tsx`의 기존 아이콘을 그대로 따른다(`grep -n "export function ChartIcon" -A12 src/components/icons.tsx`로 확인).

- [ ] **Step 2: 홈 화면에 붙인다**

`src/pages/Home.tsx`:

상태와 불러오기를 더한다(`const [drawerOpen, ...]` 뒤):

```tsx
  const [homework, setHomework] = useState<PendingHomework | null>(null)
  const today = useMemo(() => localDateString(), [])
```

`useEffect` 안에 더한다. **숙제 불러오기가 실패해도 홈의 나머지는 그대로 보여야 하므로** 별도의 catch로 빈 값을 넣는다:

```tsx
  useEffect(() => {
    getPendingHomework(today)
      .then(setHomework)
      // 숙제는 홈의 일부일 뿐이다. 못 불러와도 통계·오답노트·단어장은 보여준다.
      .catch(() => setHomework({ today: [], overdue: [] }))
  }, [today])
```

`<div className="flex flex-col gap-3 pt-6">` 바로 안쪽, "테스트 시작하기" `<Link>` **앞에** 숙제 카드들을 넣는다:

```tsx
          {homework?.today.map((hw) => (
            <HomeworkCard key={hw.id} homework={hw} today={today} />
          ))}
          {homework?.overdue.map((hw) => (
            <HomeworkCard key={hw.id} homework={hw} today={today} />
          ))}
```

import을 더한다:

```tsx
import { useMemo } from 'react'   // 기존 import 줄에 합친다
import { HomeworkCard } from '../components/HomeworkCard'
import { getHomeStats, getPendingHomework, type HomeStats, type PendingHomework } from '../lib/db'
import { localDateString } from '../lib/homework'
```

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: 타입 오류 없음

- [ ] **Step 4: 화면에서 확인한다**

`/admin`에서 **오늘 날짜**로 숙제를 하나, **어제 날짜**로 숙제를 하나 배정한 뒤 홈을 연다. 확인할 것:

- 오늘 숙제가 진한 초록으로 "오늘의 숙제"로 뜨고, "테스트 시작하기"보다 위에 있다
- 어제 숙제가 주황으로 "밀린 숙제 · (어제 날짜)"로 뜬다
- **숙제를 하나도 배정하지 않은 상태에서는 홈이 지금과 똑같다** (카드가 없고 "테스트 시작하기"가 맨 위)
- **같은 날짜에 숙제를 두 개 배정하면 카드가 두 개 뜬다** (Review Focus)
- **단어가 0개인 단어장으로 숙제를 내면** 카드가 흐리고 "단어가 없어요"가 보이며 눌러도 이동하지 않는다 (Review Focus)
  - 단어 0개인 단어장이 없으면 `/input`에서 빈 단어장을 만들 수 없으므로, DB에서 직접 `INSERT INTO word_sets (title, kind, created_at) VALUES ('빈 단어장(테스트)', 'vocab', 0)`로 만들고 확인 후 지운다
- **숙제 API가 죽어도 홈의 나머지가 보인다** (Review Focus) — Playwright의 `page.route('**/api/homework/pending*', r => r.abort())`로 막은 뒤, 통계 숫자와 "오답 노트"·"내 단어장 보기"가 그대로 보이는지 확인한다
- 390px와 1440px 모두에서 가로 스크롤이 없다

- [ ] **Step 5: 커밋**

```bash
git add src/components/HomeworkCard.tsx src/components/icons.tsx src/pages/Home.tsx
git commit -m "$(cat <<'EOF'
feat: 홈 화면에 오늘 숙제와 밀린 숙제 카드 추가

숙제가 있으면 가장 눈에 띄는 자리를 차지하고, 없으면 지금 화면 그대로다.
숙제를 못 불러와도 홈의 나머지는 보여준다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 숙제 시험 경로와 완료 기록

**Files:**
- Modify: `src/App.tsx` (경로 추가)
- Modify: `src/pages/Quiz.tsx` (숙제로 들어온 경우 설정 건너뛰기, 완료 기록, 결과 화면 문구)

**Interfaces:**
- Consumes: Task 2의 `getHomeworkById`, `completeHomework`, `HomeworkRecord`
- Produces: 없음

- [ ] **Step 1: 경로 추가**

`src/App.tsx`의 `<Route path="/quiz/:wordSetId" element={<Quiz />} />` 줄 **앞에** 더한다. 뒤에 두면 `homework`가 `:wordSetId`로 잡힌다:

```tsx
        <Route path="/quiz/homework/:homeworkId" element={<Quiz />} />
```

- [ ] **Step 2: Quiz가 숙제를 알아보게 한다**

`src/pages/Quiz.tsx`에서 파라미터를 읽는 부분(`const { wordSetId: wordSetIdParam } = useParams...`)을 바꾼다:

```tsx
  const { wordSetId: wordSetIdParam, homeworkId: homeworkIdParam } = useParams<{
    wordSetId: string
    homeworkId: string
  }>()
  const homeworkId = homeworkIdParam ? Number(homeworkIdParam) : null
  const [searchParams] = useSearchParams()
  const idsKey = wordSetIdParam ?? searchParams.get('sets') ?? ''
  // 숙제는 단어장이 아니라 숙제 번호로 진행 상황을 저장한다. 같은 단어장을 자유 시험으로도
  // 풀 수 있는데, 열쇠가 같으면 서로의 진행 상황을 덮어쓴다.
  const progressKey = homeworkId !== null ? `hw-${homeworkId}` : idsKey
```

`idsKey`를 쓰는 곳 중 **진행 상황 저장·불러오기·지우기**(`loadQuizProgress`, `saveQuizProgress`, `clearQuizProgress`) 세 군데를 `progressKey`로 바꾼다. 불러오기 `useEffect`의 의존성 배열도 `[idsKey]` → `[idsKey, homeworkId]`로 바꾼다.

- [ ] **Step 3: 숙제면 단어를 숙제에서 가져오고 설정을 건너뛴다**

같은 `useEffect` 안, `if (wordSetIds === null) { ... } else { ... }` 분기 **앞에** 숙제 분기를 넣는다. 숙제일 때는 `wordSetIds`가 `null`(경로에 `wordSetId`가 없으므로)이라 그냥 두면 오답 노트로 가 버린다:

```tsx
        let title: string
        let words: QuizWord[]
        let sets = 1
        let hw: HomeworkRecord | null = null

        if (homeworkId !== null) {
          hw = await getHomeworkById(homeworkId)
          const loaded = await Promise.all(
            hw.wordSets.map(async (s) => {
              try {
                return { title: s.title, words: await getWordsBySet(s.id) }
              } catch {
                return null
              }
            }),
          )
          const found = loaded.filter((l) => l !== null)
          sets = found.length
          title = found.map((l) => l.title).join(' + ')
          words = found.flatMap((l) => l.words)
        } else if (wordSetIds === null) {
          // 기존 오답 노트 분기를 한 줄도 바꾸지 않고 그대로 둔다
          // (getWrongNotes()를 불러 words를 만드는 블록)
        } else {
          // 기존 단어장 분기를 한 줄도 바꾸지 않고 그대로 둔다
          // (wordSetIds.map으로 getWordSet/getWordsBySet을 부르는 블록)
        }
```

즉 기존 `if (wordSetIds === null) { A } else { B }`를
`if (homeworkId !== null) { 새 블록 } else if (wordSetIds === null) { A } else { B }`로
바꾸는 것이고, A와 B의 내용은 손대지 않는다. 기존에 `let title/words/sets`를 선언하던
줄은 위로 올려 `let hw` 선언과 함께 둔다.

`setPhase('setup')`으로 끝나는 부분을, 숙제면 바로 문제를 내게 바꾼다:

```tsx
        const saved = loadQuizProgress(progressKey)
        if (saved) {
          // 기존 이어서 풀기 복원 블록을 그대로 둔다 (setQuestions부터 setPhase('asking')까지)
        } else if (hw !== null) {
          // 숙제는 부모가 문제 수를 정했으므로 설정 화면을 건너뛴다.
          // 순서는 항상 섞는다 — 같은 단어장을 매일 배정했을 때 날마다 같은 순서로
          // 같은 문제가 나오면 아이가 답을 외워버린다.
          setHomeworkSetup({ count: hw.questionCount, words })
        } else {
          setPhase('setup')
        }
```

`startRound`를 effect 안에서 바로 부를 수 없다(아직 정의 전이고 `order` 상태를 읽는다). 상태 하나를 두고 별도 effect에서 시작한다. 컴포넌트 본문에 더한다:

```tsx
  // 숙제는 설정 화면 없이 바로 시작한다. 단어를 다 받은 뒤 한 번만 돈다.
  const [homeworkSetup, setHomeworkSetup] = useState<{ count: number; words: QuizWord[] } | null>(null)

  useEffect(() => {
    if (homeworkSetup === null) return
    setHomeworkSetup(null)
    const qs = generateQuestions(homeworkSetup.words, {
      count: homeworkSetup.count === 0 ? undefined : homeworkSetup.count,
      mode: FIXED_QUESTION_TYPE,
      shuffle: true,
    })
    setQuestions(qs)
    setAnswers(Array(qs.length).fill(null))
    setQIndex(0)
    setAnswerInput('')
    setVerbInput(EMPTY_VERB)
    setRound(1)
    setGroupId(crypto.randomUUID())
    setRoundStartedAt(Date.now())
    elapsedRef.current = 0
    submittingRef.current = false
    setSubmitting(false)
    setSubmitError('')
    setPhase('asking')
  }, [homeworkSetup])
```

`groupId`를 만드는 방식은 기존 `startRound` 호출부가 쓰는 것과 같아야 한다. `grep -n "setGroupId" src/pages/Quiz.tsx`로 기존 생성 방식을 확인하고 **그대로 따른다**(`crypto.randomUUID()`가 아니라면 그 방식을 쓴다).

- [ ] **Step 4: 다 맞히면 숙제를 완료로 기록한다**

`finishRound` 안, `setRoundResult({...})` **앞에** 넣는다:

```tsx
    // 틀린 단어가 0인 라운드를 마쳤을 때만 숙제가 끝난 것이다(설계 3.4).
    let homeworkDone = false
    if (homeworkId !== null && wrongAnswers.length === 0) {
      try {
        await completeHomework(homeworkId, groupId)
        homeworkDone = true
      } catch {
        // 시험 기록은 이미 저장됐다. 숙제 도장만 못 찍었으니 결과 화면은 그대로 보여주고
        // 조용히 알린다. 다시 풀면 복구된다.
        setSubmitError('숙제 완료를 기록하지 못했어요. 인터넷 연결을 확인해 주세요.')
      }
    }
```

`RoundResult`에 칸을 더한다:

```tsx
interface RoundResult {
  // ... 기존 그대로 ...
  /** 이 라운드로 숙제를 끝냈는지 */
  homeworkDone: boolean
}
```

`setRoundResult({ ... })`에 `homeworkDone,`을 더하고, `doFinish`가 만드는 다른 `RoundResult`가 있으면 거기에도 `homeworkDone: false`를 넣는다(`grep -n "setRoundResult" src/pages/Quiz.tsx`로 확인).

`RoundSummary` 컴포넌트에서, 완료 문구가 들어갈 자리(`result.isFinal`이 참일 때 "모든 단어를 맞혔어요"를 보여주는 블록) 안에 한 줄 더한다:

```tsx
          {result.homeworkDone && (
            <span className="rounded-full bg-accent-tint px-3 py-1 text-[12.5px] font-bold text-accent-dark">
              오늘 숙제 끝!
            </span>
          )}
```

import을 더한다:

```tsx
import { completeHomework, getHomeworkById, type HomeworkRecord } from '../lib/db'
```

(기존 `from '../lib/db'` import 줄에 합친다.)

- [ ] **Step 5: 빌드와 전체 테스트**

Run: `npm run build && npm test`
Expected: 타입 오류 없음, 전체 통과

- [ ] **Step 6: 끝에서 끝까지 확인한다**

서버를 띄우고 Playwright로. **단어 3개짜리 `동사 3단변화 · A-B-A`로 숙제를 내면 빨리 끝난다.**

- `/admin`에서 오늘 날짜로 A-B-A 전체 문제 숙제를 낸다
- 홈에 "오늘의 숙제" 카드가 뜬다
- 카드를 누르면 **테스트 설정 화면이 뜨지 않고 바로 1번 문제**가 나온다
- 일부러 하나를 틀리고 라운드를 마치면 → 복습 라운드가 뜨고, **홈으로 돌아가면 숙제는 아직 "오늘의 숙제"다**
- 다시 들어가면 **풀던 자리에서 이어서** 풀 수 있다
- 복습 라운드에서 다 맞히면 "오늘 숙제 끝!"이 보인다
- 홈으로 돌아가면 카드가 **"오늘 숙제 다 했어요!"** 로 바뀐다
- `/admin` 목록에서 그 숙제가 **"완료"** 로 바뀐다
- **어제 날짜 숙제를 내고 다 맞히면** 홈에서 그 밀린 숙제 카드가 사라진다
- 390px와 1440px 모두에서 가로 스크롤이 없다

확인이 끝나면 **만든 숙제를 모두 지운다.**

- [ ] **Step 7: 커밋**

```bash
git add src/App.tsx src/pages/Quiz.tsx
git commit -m "$(cat <<'EOF'
feat: 숙제로 들어온 시험은 설정을 건너뛰고 완료를 기록한다

문제 수는 부모가 정한 값을 쓰고 순서는 항상 섞는다. 틀린 단어가 0인
라운드를 마치면 숙제를 완료로 찍는다. 진행 상황은 숙제 번호로 따로
저장해 같은 단어장의 자유 시험과 섞이지 않게 한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 마무리

모든 태스크가 끝나면 전체 브랜치를 신선한 리뷰어(가장 유능한 모델)에게 보내 리뷰받고,
Critical·Important를 한 번의 수정 패스로 고친 뒤, `superpowers:finishing-a-development-branch`로
마무리한다. **운영 배포(`git push origin main`)는 그 단계에서 한다.**

배포 뒤에는 운영 번들 해시가 로컬 빌드와 일치하는지 확인한다.
