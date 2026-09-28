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
