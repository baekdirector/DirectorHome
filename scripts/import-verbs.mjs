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
