import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { pool } from './db.js'

export const router = Router()

// ---- 사용자 구분 (JunsVoca / BeensVoca / admin) ----

/** 단어장을 따로 쓰는 아이 계정. admin은 이 둘 중 하나를 골라서 본다. */
export const CHILD_IDS = ['junsvoca', 'beensvoca']

/**
 * 이 요청이 누구의 단어장을 보려는 것인지. 화면이 X-Voca-Owner 헤더로 알려준다.
 * 모르는 값이면 기존 데이터의 주인인 junsvoca로 떨어뜨린다 -- 헤더를 안 보내던
 * 예전 화면이 남아 있어도 지금까지와 같게 동작한다.
 */
export function ownerOf(req) {
  const raw = req.get('X-Voca-Owner')
  return CHILD_IDS.includes(raw) ? raw : 'junsvoca'
}

/** 가계부·OPIC·admin이 함께 쓰는 서비스 비밀번호. 배포 설정(환경변수)에서 관리한다. */
function servicePassword() {
  // 이름을 DIRECTORHOME_PASSWORD로 바꾸는 중이다. 배포 설정이 아직 옛 이름이어도 열리게 둘 다 읽는다.
  return process.env.DIRECTORHOME_PASSWORD || process.env.HOUSEHOLD_PASSWORD || ''
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function verifyHashed(password, stored) {
  const [salt, expected] = String(stored).split(':')
  if (!salt || !expected) return false
  const actual = scryptSync(password, salt, 64)
  const expectedBuf = Buffer.from(expected, 'hex')
  // 길이가 다르면 timingSafeEqual이 던진다.
  return actual.length === expectedBuf.length && timingSafeEqual(actual, expectedBuf)
}

/**
 * 입구 로그인. id는 junsvoca / beensvoca / admin.
 * 아이 비밀번호는 DB(app_users), admin 비밀번호는 서비스 환경변수다.
 * 비밀번호가 아직 없는 아이 계정은 unset으로 알려 "부모님께 요청하세요"를 띄우게 한다.
 */
router.post('/login', async (req, res) => {
  const { id, password } = req.body ?? {}
  if (typeof id !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'id and password required' })
  }

  if (id === 'admin') {
    const expected = servicePassword()
    if (!expected) return res.status(500).json({ error: 'DIRECTORHOME_PASSWORD is not configured' })
    return res.json({ ok: password === expected, profile: 'admin' })
  }

  if (!CHILD_IDS.includes(id)) return res.json({ ok: false })

  const { rows } = await pool.query(`SELECT password_hash AS "hash" FROM app_users WHERE id = $1`, [id])
  if (!rows[0]) return res.json({ ok: false, reason: 'unset' })
  res.json({ ok: verifyHashed(password, rows[0].hash), profile: id })
})

/** 아이 계정 목록과 비밀번호 설정 여부. 비밀번호 자체는 절대 돌려주지 않는다. */
router.get('/app-users', async (_req, res) => {
  const { rows } = await pool.query(`SELECT id, updated_at AS "updatedAt" FROM app_users`)
  const byId = new Map(rows.map((r) => [r.id, r.updatedAt]))
  res.json(CHILD_IDS.map((id) => ({ id, hasPassword: byId.has(id), updatedAt: byId.get(id) ?? null })))
})

router.put('/app-users/:id', async (req, res) => {
  const { id } = req.params
  const password = req.body?.password
  if (!CHILD_IDS.includes(id)) return res.status(404).json({ error: 'unknown user' })
  if (typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'password must be at least 4 characters' })
  }
  await pool.query(
    `INSERT INTO app_users (id, password_hash, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = EXCLUDED.updated_at`,
    [id, hashPassword(password), Date.now()],
  )
  res.json({ ok: true })
})

function isSameDay(a, b) {
  const da = new Date(a)
  const db_ = new Date(b)
  return da.getFullYear() === db_.getFullYear() && da.getMonth() === db_.getMonth() && da.getDate() === db_.getDate()
}

/** Groups quiz_sessions rows by groupId into one attempt summary each, same shape as the old Dexie-backed getAttempts(). */
function summarizeAttempts(sessions) {
  const byGroup = new Map()
  for (const s of sessions) {
    const list = byGroup.get(s.groupId) ?? []
    list.push(s)
    byGroup.set(s.groupId, list)
  }
  const attempts = []
  for (const [groupId, rounds] of byGroup) {
    rounds.sort((a, b) => a.round - b.round)
    const first = rounds[0]
    const last = rounds[rounds.length - 1]
    attempts.push({
      groupId,
      wordSetId: first.wordSetId,
      wordSetTitle: first.wordSetTitle,
      startedAt: first.startedAt,
      totalQuestions: first.totalQuestions,
      correctCount: first.correctCount,
      wrongCount: first.wrongCount,
      accuracy: first.totalQuestions > 0 ? Math.round((first.correctCount / first.totalQuestions) * 100) : 0,
      totalDurationMs: rounds.reduce((sum, r) => sum + r.durationMs, 0),
      mastered: rounds.some((r) => r.wrongCount === 0),
    })
  }
  attempts.sort((a, b) => b.startedAt - a.startedAt)
  return attempts
}

/**
 * 같은 테스트(group_id)의 같은 라운드가 여러 번 저장된 기록이 있다. 예전에는 "마치기"를
 * 여러 번 누르면 그때마다 다시 저장됐기 때문이다. 집계(소요 시간, 정답률, 틀린 횟수)에는
 * 가장 먼저 저장된 하나만 쓰고, 나머지 중복은 원본만 남겨 두고 세지 않는다.
 * `s`는 quiz_sessions의 별칭이어야 한다.
 */
const FIRST_SAVE_ONLY = `s.id = (SELECT MIN(d.id) FROM quiz_sessions d WHERE d.group_id = s.group_id AND d.round = s.round)`

async function fetchAllSessions(owner) {
  const { rows } = await pool.query(
    `SELECT s.id, s.group_id AS "groupId", s.word_set_id AS "wordSetId", s.word_set_title AS "wordSetTitle",
            s.round, s.started_at AS "startedAt", s.finished_at AS "finishedAt", s.duration_ms AS "durationMs",
            s.total_questions AS "totalQuestions", s.correct_count AS "correctCount", s.wrong_count AS "wrongCount"
     FROM quiz_sessions s
     WHERE s.owner = $1 AND ${FIRST_SAVE_ONLY}
     ORDER BY s.started_at DESC`,
    [owner],
  )
  return rows
}

/**
 * 오답 노트 갱신. 틀리면 노트에 담고(이미 있으면 횟수 +1, 다시 '남은 단어'로),
 * 이후 다른 테스트의 첫 라운드에서 맞히면 '외운 단어'로 옮긴다.
 * (같은 테스트의 복습 라운드에서 맞힌 것은 외운 것으로 치지 않는다.)
 */
async function updateWrongNote(client, answer, { groupId, round, finishedAt }) {
  if (!answer.correct) {
    await client.query(
      `INSERT INTO wrong_notes (word_id, wrong_count, last_wrong_at, last_wrong_group_id)
       SELECT id, 1, $2::bigint, $3::text FROM words WHERE id = $1
       ON CONFLICT (word_id) DO UPDATE SET
         wrong_count = wrong_notes.wrong_count + 1,
         last_wrong_at = $2::bigint,
         last_wrong_group_id = $3::text,
         resolved_at = NULL`,
      [answer.wordId, finishedAt, groupId],
    )
  } else if (round === 1) {
    await client.query(
      `UPDATE wrong_notes SET resolved_at = $2::bigint
       WHERE word_id = $1 AND resolved_at IS NULL AND last_wrong_group_id <> $3::text`,
      [answer.wordId, finishedAt, groupId],
    )
  }
}

// ---- word sets ----

router.get('/wordsets', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ws.id, ws.title, ws.kind, ws.created_at AS "createdAt",
            ws.category_id AS "categoryId", COUNT(w.id)::int AS count
     FROM word_sets ws
     LEFT JOIN words w ON w.word_set_id = ws.id
     WHERE ws.owner = $1
     GROUP BY ws.id
     ORDER BY ws.created_at DESC`,
    [ownerOf(req)],
  )
  res.json(rows)
})

router.get('/wordsets/attempt-counts', async (req, res) => {
  // 단어장 하나로만 진행한 테스트(1라운드 기준)의 횟수. 여러 단어장을 묶어서 본 테스트는
  // 특정 단어장 하나에 속하지 않으므로(word_set_id NULL) 세지 않는다.
  const { rows } = await pool.query(
    `SELECT word_set_id AS "wordSetId", COUNT(DISTINCT group_id)::int AS count
     FROM quiz_sessions
     WHERE owner = $1 AND round = 1 AND word_set_id IS NOT NULL
     GROUP BY word_set_id`,
    [ownerOf(req)],
  )
  res.json(rows)
})

router.get('/wordsets/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, title, kind, created_at AS "createdAt" FROM word_sets WHERE id = $1`,
    [req.params.id],
  )
  if (!rows[0]) return res.status(404).json({ error: 'not found' })
  res.json(rows[0])
})

// 단어와 그 단어의 오답 노트는 함께 사라지고(CASCADE), 시험 기록은 남는다(SET NULL).
router.delete('/wordsets/:id', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'invalid id' })
  const { rowCount } = await pool.query(`DELETE FROM word_sets WHERE id = $1`, [req.params.id])
  if (rowCount === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

router.get('/wordsets/:id/words', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, word_set_id AS "wordSetId", term, meaning, is_idiom AS "isIdiom",
            part_of_speech AS "partOfSpeech", past, participle
     FROM words WHERE word_set_id = $1 ORDER BY id`,
    [req.params.id],
  )
  res.json(rows)
})

router.post('/wordsets', async (req, res) => {
  const { title, words, kind, categoryId } = req.body
  if (!title || !Array.isArray(words)) return res.status(400).json({ error: 'title and words[] required' })
  const setKind = kind === 'verb' ? 'verb' : 'vocab'
  const setCategory = Number.isInteger(categoryId) ? categoryId : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const {
      rows: [wordSet],
    } = await client.query(
      `INSERT INTO word_sets (title, kind, created_at, owner, category_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [title, setKind, Date.now(), ownerOf(req), setCategory],
    )
    for (const w of words) {
      await client.query(
        `INSERT INTO words (word_set_id, term, meaning, is_idiom, part_of_speech, past, participle)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [wordSet.id, w.term, w.meaning, !!w.isIdiom, w.partOfSpeech ?? null, w.past ?? null, w.participle ?? null],
      )
    }
    await client.query('COMMIT')
    res.json({ id: wordSet.id })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

router.patch('/wordsets/:id', async (req, res) => {
  const { title, categoryId } = req.body ?? {}
  if (typeof title === 'string') {
    await pool.query(`UPDATE word_sets SET title = $1 WHERE id = $2`, [title, req.params.id])
  }
  // categoryId를 null로 보내면 "미분류"로 되돌린다. 아예 안 보내면 분류는 건드리지 않는다.
  if (categoryId === null || Number.isInteger(categoryId)) {
    await pool.query(`UPDATE word_sets SET category_id = $1 WHERE id = $2 AND owner = $3`, [
      categoryId,
      req.params.id,
      ownerOf(req),
    ])
  }
  res.json({ ok: true })
})

// ---- 단어장 카테고리 ----

router.get('/wordset-categories', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.display_order AS "displayOrder", c.created_at AS "createdAt",
            COUNT(ws.id)::int AS "setCount"
     FROM word_set_categories c
     LEFT JOIN word_sets ws ON ws.category_id = c.id
     WHERE c.owner = $1
     GROUP BY c.id
     ORDER BY c.display_order, c.id`,
    [ownerOf(req)],
  )
  res.json(rows)
})

router.post('/wordset-categories', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (name === '') return res.status(400).json({ error: 'name required' })
  const owner = ownerOf(req)
  // 같은 이름이 이미 있으면 새로 만들지 않고 그것을 돌려준다. 화면에서 "직접 입력"으로
  // 같은 이름을 또 넣어도 분류가 두 개로 갈라지지 않는다.
  const {
    rows: [row],
  } = await pool.query(
    `INSERT INTO word_set_categories (owner, name, display_order, created_at)
     VALUES ($1, $2, COALESCE((SELECT MAX(display_order) + 1 FROM word_set_categories WHERE owner = $1), 0), $3)
     ON CONFLICT (owner, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name, display_order AS "displayOrder", created_at AS "createdAt"`,
    [owner, name, Date.now()],
  )
  res.json({ ...row, setCount: 0 })
})

router.patch('/wordset-categories/:id', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (name === '') return res.status(400).json({ error: 'name required' })
  const { rowCount } = await pool.query(
    `UPDATE word_set_categories SET name = $1 WHERE id = $2 AND owner = $3`,
    [name, req.params.id, ownerOf(req)],
  )
  if (rowCount === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

// 분류만 사라지고 단어장은 "미분류"로 남는다(스키마의 ON DELETE SET NULL).
router.delete('/wordset-categories/:id', async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM word_set_categories WHERE id = $1 AND owner = $2`, [
    req.params.id,
    ownerOf(req),
  ])
  if (rowCount === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

// ---- words ----

router.post('/words', async (req, res) => {
  const { wordSetId, term, meaning, isIdiom, partOfSpeech, past, participle } = req.body
  const {
    rows: [row],
  } = await pool.query(
    `INSERT INTO words (word_set_id, term, meaning, is_idiom, part_of_speech, past, participle)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [wordSetId, term ?? '', meaning ?? '', !!isIdiom, partOfSpeech ?? null, past ?? null, participle ?? null],
  )
  res.json({ id: row.id })
})

router.patch('/words/:id', async (req, res) => {
  const { term, meaning, isIdiom, partOfSpeech, past, participle } = req.body
  await pool.query(
    `UPDATE words SET
       term = COALESCE($1, term),
       meaning = COALESCE($2, meaning),
       is_idiom = COALESCE($3, is_idiom),
       part_of_speech = COALESCE($4, part_of_speech),
       past = COALESCE($5, past),
       participle = COALESCE($6, participle)
     WHERE id = $7`,
    [term, meaning, isIdiom, partOfSpeech, past, participle, req.params.id],
  )
  res.json({ ok: true })
})

router.delete('/words/:id', async (req, res) => {
  await pool.query(`DELETE FROM words WHERE id = $1`, [req.params.id])
  res.json({ ok: true })
})

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
         completed_at AS "completedAt", completed_group_id AS "completedGroupId",
         attempted_at AS "attemptedAt", attempt_correct AS "attemptCorrect",
         attempt_total AS "attemptTotal", question_order AS "questionOrder"`

router.get('/homework', async (req, res) => {
  const { from, to } = req.query
  if (!DATE_RE.test(from ?? '') || !DATE_RE.test(to ?? '')) {
    return res.status(400).json({ error: 'from, to (YYYY-MM-DD) required' })
  }
  const { rows } = await pool.query(
    `SELECT ${HOMEWORK_COLUMNS} FROM homework
     WHERE owner = $3 AND due_date BETWEEN $1 AND $2 ORDER BY due_date, id`,
    [from, to, ownerOf(req)],
  )
  res.json(await withWordSets(rows))
})

// 이 라우트는 '/homework/:id'보다 먼저 와야 한다. 순서가 바뀌면 'pending'이 id로 잡힌다.
// 아이 홈 화면용. 오늘 숙제는 끝냈어도 돌려준다("오늘 숙제 다 했어요"를 보여주려고).
// 밀린 숙제는 안 끝낸 것만, 오래된 것부터.
router.get('/homework/pending', async (req, res) => {
  const today = req.query.today
  if (!DATE_RE.test(today ?? '')) {
    return res.status(400).json({ error: 'today (YYYY-MM-DD) required' })
  }
  const { rows } = await pool.query(
    `SELECT ${HOMEWORK_COLUMNS} FROM homework
     WHERE owner = $2 AND (due_date = $1 OR (due_date < $1 AND completed_at IS NULL))
     ORDER BY due_date, id`,
    [today, ownerOf(req)],
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
  const { fromDate, toDate, wordSetIds, questionCount, questionOrder } = req.body ?? {}
  if (!DATE_RE.test(fromDate ?? '') || !DATE_RE.test(toDate ?? '')) {
    return res.status(400).json({ error: 'fromDate, toDate (YYYY-MM-DD) required' })
  }
  if (!Array.isArray(wordSetIds) || wordSetIds.length === 0) {
    return res.status(400).json({ error: 'wordSetIds required' })
  }
  if (toDate < fromDate) return res.status(400).json({ error: 'toDate must not precede fromDate' })
  const count = Number.isInteger(questionCount) && questionCount >= 0 ? questionCount : 0
  const order = questionOrder === 'ordered' ? 'ordered' : 'shuffle'

  // 날짜를 Postgres가 펼친다. 실수로 몇 년치를 넣는 것을 막는다.
  const { rows } = await pool.query(
    `INSERT INTO homework (due_date, word_set_ids, question_count, created_at, owner, question_order)
     SELECT d::date, $3::int[], $4, $5, $7, $8
     FROM generate_series($1::date, $2::date, interval '1 day') AS d
     WHERE $2::date - $1::date < $6
     RETURNING ${HOMEWORK_COLUMNS}`,
    [fromDate, toDate, wordSetIds, count, Date.now(), MAX_RANGE_DAYS, ownerOf(req), order],
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

// 끝내지 못한 시도의 마지막 결과. 끝낸 숙제는 처음 기록을 지키려고 건드리지 않는다.
router.post('/homework/:id/attempt', async (req, res) => {
  const { correct, total } = req.body ?? {}
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total < 1 || correct < 0 || correct > total) {
    return res.status(400).json({ error: 'correct and total required' })
  }
  await pool.query(
    `UPDATE homework SET attempted_at = $1, attempt_correct = $2, attempt_total = $3
     WHERE id = $4 AND completed_at IS NULL`,
    [Date.now(), correct, total, req.params.id],
  )
  res.json({ ok: true })
})

router.delete('/homework/:id', async (req, res) => {
  await pool.query(`DELETE FROM homework WHERE id = $1`, [req.params.id])
  res.json({ ok: true })
})

// ---- quiz rounds ----

router.post('/quiz-rounds', async (req, res) => {
  const { groupId, wordSetId, wordSetTitle, round, startedAt, finishedAt, answers } = req.body
  if (!Array.isArray(answers)) return res.status(400).json({ error: 'answers[] required' })

  const correctCount = answers.filter((a) => a.correct).length
  const wrongCount = answers.length - correctCount

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // 같은 라운드가 동시에/반복해서 들어와도 한 번만 저장한다 (연타, 재시도, 네트워크 재전송).
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${groupId}:${round}`])
    const {
      rows: [existing],
    } = await client.query(`SELECT id FROM quiz_sessions WHERE group_id = $1 AND round = $2 ORDER BY id LIMIT 1`, [
      groupId,
      round,
    ])
    if (existing) {
      await client.query('COMMIT')
      return res.json({ sessionId: existing.id, duplicate: true })
    }
    const {
      rows: [session],
    } = await client.query(
      `INSERT INTO quiz_sessions
         (group_id, word_set_id, word_set_title, round, started_at, finished_at, duration_ms, total_questions, correct_count, wrong_count, owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [groupId, wordSetId, wordSetTitle, round, startedAt, finishedAt, finishedAt - startedAt, answers.length, correctCount, wrongCount, ownerOf(req)],
    )
    for (const a of answers) {
      await client.query(
        `INSERT INTO quiz_answers (session_id, word_id, question_type, term, meaning, correct_answer, user_answer, correct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [session.id, a.wordId, a.questionType, a.term, a.meaning, a.correctAnswer, a.userAnswer, a.correct],
      )
      await updateWrongNote(client, a, { groupId, round, finishedAt })
    }
    await client.query('COMMIT')
    res.json({ sessionId: session.id })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

// ---- parent dashboard ----

router.get('/attempts', async (req, res) => {
  res.json(summarizeAttempts(await fetchAllSessions(ownerOf(req))))
})

router.get('/attempts/:groupId', async (req, res) => {
  const { rows: rounds } = await pool.query(
    `SELECT s.id, s.group_id AS "groupId", s.word_set_id AS "wordSetId", s.word_set_title AS "wordSetTitle",
            s.round, s.started_at AS "startedAt", s.finished_at AS "finishedAt", s.duration_ms AS "durationMs",
            s.total_questions AS "totalQuestions", s.correct_count AS "correctCount", s.wrong_count AS "wrongCount"
     FROM quiz_sessions s WHERE s.group_id = $1 AND s.owner = $2 AND ${FIRST_SAVE_ONLY} ORDER BY s.round`,
    [req.params.groupId, ownerOf(req)],
  )
  const sessionIds = rounds.map((r) => r.id)
  const { rows: answers } =
    sessionIds.length === 0
      ? { rows: [] }
      : await pool.query(
          `SELECT id, session_id AS "sessionId", word_id AS "wordId", question_type AS "questionType",
                  term, meaning, correct_answer AS "correctAnswer", user_answer AS "userAnswer", correct
           FROM quiz_answers WHERE session_id = ANY($1::int[]) ORDER BY id`,
          [sessionIds],
        )
  res.json({ rounds, answers })
})

router.get('/missed-words', async (req, res) => {
  const limit = Number(req.query.limit) || 5
  const { rows: wrongAnswers } = await pool.query(
    `SELECT a.term, a.meaning
     FROM quiz_answers a
     JOIN quiz_sessions s ON s.id = a.session_id
     WHERE a.correct = false AND s.owner = $1 AND ${FIRST_SAVE_ONLY}`,
    [ownerOf(req)],
  )
  const counts = new Map()
  for (const a of wrongAnswers) {
    const entry = counts.get(a.term) ?? { term: a.term, meaning: a.meaning, wrong: 0 }
    entry.wrong += 1
    counts.set(a.term, entry)
  }
  const top = Array.from(counts.values())
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, limit)
  res.json(top)
})

// ---- wrong notes ----

router.get('/wrong-notes', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT n.word_id AS "wordId", w.term, w.meaning, w.is_idiom AS "isIdiom", w.part_of_speech AS "partOfSpeech",
            w.past, w.participle,
            w.word_set_id AS "wordSetId", ws.title AS "wordSetTitle",
            n.wrong_count AS "wrongCount", n.last_wrong_at AS "lastWrongAt", n.resolved_at AS "resolvedAt"
     FROM wrong_notes n
     JOIN words w ON w.id = n.word_id
     JOIN word_sets ws ON ws.id = w.word_set_id
     WHERE ws.owner = $1
     ORDER BY n.last_wrong_at DESC`,
    [ownerOf(req)],
  )
  res.json(rows)
})

router.patch('/wrong-notes/:wordId', async (req, res) => {
  const resolved = req.body?.resolved
  if (typeof resolved !== 'boolean') return res.status(400).json({ error: 'resolved (boolean) required' })
  const { rowCount } = await pool.query(`UPDATE wrong_notes SET resolved_at = $2::bigint WHERE word_id = $1`, [
    req.params.wordId,
    resolved ? Date.now() : null,
  ])
  if (rowCount === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

router.get('/home-stats', async (req, res) => {
  const owner = ownerOf(req)
  const {
    rows: [{ count: totalWords }],
  } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM words w
     JOIN word_sets ws ON ws.id = w.word_set_id WHERE ws.owner = $1`,
    [owner],
  )
  const attempts = summarizeAttempts(await fetchAllSessions(owner))

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recent = attempts.filter((a) => a.startedAt >= weekAgo)
  const weeklyAccuracy =
    recent.length > 0 ? Math.round(recent.reduce((sum, a) => sum + a.accuracy, 0) / recent.length) : 0

  let streakDays = 0
  if (attempts.length > 0) {
    const days = Array.from(new Set(attempts.map((a) => new Date(a.startedAt).toDateString())))
      .map((d) => new Date(d).getTime())
      .sort((a, b) => b - a)
    let cursor = Date.now()
    for (const day of days) {
      if (isSameDay(day, cursor) || isSameDay(day, cursor - 24 * 60 * 60 * 1000)) {
        streakDays += 1
        cursor = day
      } else {
        break
      }
    }
  }

  const {
    rows: [{ count: wrongNoteCount }],
  } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM wrong_notes n
     JOIN words w ON w.id = n.word_id
     JOIN word_sets ws ON ws.id = w.word_set_id
     WHERE n.resolved_at IS NULL AND ws.owner = $1`,
    [owner],
  )

  res.json({ totalWords, weeklyAccuracy, streakDays, wrongNoteCount })
})

// ---- household expense tracker ----

// 로그인 시스템이 아니라 '가계부' 메뉴 진입용 비밀번호 확인만 한다. DB는 쓰지 않는다.
router.post('/expense/verify-password', (req, res) => {
  const { password } = req.body
  const expected = servicePassword()
  if (!expected) {
    return res.status(500).json({ error: 'DIRECTORHOME_PASSWORD is not configured' })
  }
  res.json({ ok: password === expected })
})

router.get('/expense/categories', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT id, name, group_type AS "groupType", display_order AS "displayOrder",
           created_at AS "createdAt", archived_at AS "archivedAt"
    FROM expense_categories
    ORDER BY archived_at NULLS FIRST, group_type, display_order, id
  `)
  res.json(rows)
})

router.post('/expense/categories', async (req, res) => {
  const { name, groupType, displayOrder } = req.body
  if (!name || !groupType) return res.status(400).json({ error: 'name and groupType required' })
  const {
    rows: [row],
  } = await pool.query(
    `INSERT INTO expense_categories (name, group_type, display_order, created_at) VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, groupType, displayOrder ?? 0, Date.now()],
  )
  res.json({ id: row.id })
})

router.patch('/expense/categories/:id', async (req, res) => {
  const { name, groupType, displayOrder, archived } = req.body
  await pool.query(
    `UPDATE expense_categories SET
       name = COALESCE($1, name),
       group_type = COALESCE($2, group_type),
       display_order = COALESCE($3, display_order),
       archived_at = CASE WHEN $4::boolean IS NULL THEN archived_at WHEN $4 THEN COALESCE(archived_at, $5::bigint) ELSE NULL END
     WHERE id = $6`,
    [name, groupType, displayOrder, typeof archived === 'boolean' ? archived : null, Date.now(), req.params.id],
  )
  res.json({ ok: true })
})

// ---- expense entries (one row per category per year+month) ----

router.get('/expense/entries', async (req, res) => {
  const year = Number(req.query.year)
  if (!year) return res.status(400).json({ error: 'year required' })
  const { rows } = await pool.query(
    `SELECT id, category_id AS "categoryId", year, month, amount, memo, updated_at AS "updatedAt"
     FROM expense_entries WHERE year = $1
     ORDER BY id`,
    [year],
  )
  res.json(rows)
})

// 카테고리당 월 하나의 값만 갖는 일반 입력칸용: 기존 줄을 지우고 하나를 새로 넣어
// "이 카테고리+이 달은 항상 한 줄"을 유지한다("추가 지출액"처럼 품목별로 여러 줄을 쌓는
// 카테고리는 이 엔드포인트를 쓰지 않고 아래 POST를 쓴다).
router.put('/expense/entries', async (req, res) => {
  const { categoryId, year, month, amount, memo } = req.body
  if (!categoryId || !year || !month) return res.status(400).json({ error: 'categoryId, year, month required' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM expense_entries WHERE category_id = $1 AND year = $2 AND month = $3`, [
      categoryId,
      year,
      month,
    ])
    const {
      rows: [row],
    } = await client.query(
      `INSERT INTO expense_entries (category_id, year, month, amount, memo, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [categoryId, year, month, amount ?? 0, memo ?? null, Date.now()],
    )
    await client.query('COMMIT')
    res.json({ id: row.id })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
})

// 품목별로 여러 줄을 쌓는 카테고리("추가 지출액"/"추가 입금액")용: 기존 줄을 건드리지 않고
// 새 품목 한 줄을 추가한다.
router.post('/expense/entries', async (req, res) => {
  const { categoryId, year, month, amount, memo } = req.body
  if (!categoryId || !year || !month) return res.status(400).json({ error: 'categoryId, year, month required' })
  const {
    rows: [row],
  } = await pool.query(
    `INSERT INTO expense_entries (category_id, year, month, amount, memo, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [categoryId, year, month, amount ?? 0, memo ?? null, Date.now()],
  )
  res.json({ id: row.id })
})

// 품목 한 줄(주로 "추가 지출액"/"추가 입금액")의 이름/금액을 수정한다.
router.patch('/expense/entries/:id', async (req, res) => {
  const { amount, memo } = req.body
  await pool.query(
    `UPDATE expense_entries SET amount = $1, memo = $2, updated_at = $3 WHERE id = $4`,
    [amount ?? 0, memo ?? null, Date.now(), req.params.id],
  )
  res.json({ ok: true })
})

router.delete('/expense/entries/:id', async (req, res) => {
  await pool.query(`DELETE FROM expense_entries WHERE id = $1`, [req.params.id])
  res.json({ ok: true })
})

// ---- expense settings: opening balance anchor for carry-forward math ----

router.get('/expense/settings', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT opening_year AS "openingYear", opening_month AS "openingMonth", opening_balance AS "openingBalance"
     FROM expense_settings WHERE id = 1`,
  )
  res.json(rows[0] ?? null)
})

/**
 * 연간 요약: 월별 수입/카드값/고정비·저축/통신·공과/기타지출 합계와, 시작 잔액(opening_balance)부터
 * 이어지는 이월 잔액(총 합계)을 계산한다. 시작 시점부터 요청 연도 12월까지 누적해야 잔액이
 * 정확하므로, DB에서 그 구간 전체를 읽어 JS에서 월별로 접는다(가계부 규모상 충분히 가볍다).
 */
router.get('/expense/summary', async (req, res) => {
  const year = Number(req.query.year)
  if (!year) return res.status(400).json({ error: 'year required' })

  const { rows: settingsRows } = await pool.query(
    `SELECT opening_year AS "openingYear", opening_month AS "openingMonth", opening_balance AS "openingBalance"
     FROM expense_settings WHERE id = 1`,
  )
  const settings = settingsRows[0] ?? { openingYear: year, openingMonth: 1, openingBalance: 0 }

  const { rows: entries } = await pool.query(
    `SELECT e.year, e.month, e.amount, c.group_type AS "groupType"
     FROM expense_entries e JOIN expense_categories c ON c.id = e.category_id
     WHERE (e.year, e.month) >= ($1, $2) AND (e.year, e.month) <= ($3, 12)`,
    [settings.openingYear, settings.openingMonth, year],
  )

  const byMonth = new Map()
  for (const e of entries) {
    const key = `${e.year}-${e.month}`
    const m = byMonth.get(key) ?? { income: 0, card: 0, fixed: 0, utility: 0, variable: 0 }
    m[e.groupType] += Number(e.amount)
    byMonth.set(key, m)
  }

  let balance = Number(settings.openingBalance)
  const months = []
  let y = settings.openingYear
  let m = settings.openingMonth
  while (y < year || (y === year && m <= 12)) {
    const entry = byMonth.get(`${y}-${m}`) ?? { income: 0, card: 0, fixed: 0, utility: 0, variable: 0 }
    const expenseTotal = entry.card + entry.fixed + entry.utility + entry.variable
    const net = entry.income - expenseTotal
    balance += net
    if (y === year) {
      months.push({
        year: y,
        month: m,
        income: entry.income,
        cardTotal: entry.card,
        fixedTotal: entry.fixed,
        utilityTotal: entry.utility,
        variableTotal: entry.variable,
        expenseTotal,
        net,
        balance,
      })
    }
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }

  res.json({ months, openingBalance: Number(settings.openingBalance) })
})

// ===== OPIC 스크립트 암기장 =====
// 접근 제한은 가계부와 같은 비밀번호 게이트를 화면에서 공유한다(/expense/verify-password).

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
            q.importance, q.source_ref AS "sourceRef",
            q.shared_question AS "sharedQuestion",
            q.answer_hash AS "answerHash", s.state
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
            q.source_ref AS "sourceRef", q.shared_question AS "sharedQuestion",
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
  if (!answerHash) return res.status(400).json({ error: 'answerHash required' })
  if (state === null || state === undefined) {
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
