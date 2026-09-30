// 2026 OPIC 2.xlsx -> Postgres 1회성 임포트.
//   node scripts/import-opic.mjs <xlsx경로>            검수 목록만 출력
//   node scripts/import-opic.mjs <xlsx경로> --apply    DB에 반영
import ExcelJS from 'exceljs'
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

/** 시트명 오타는 화면에 보일 주제명에서 바로잡는다. 원본 오타는 DB에 남기지 않는다. */
const NAME_FIXES = new Map([['Heath', 'Health']])

/** exceljs 셀 값은 문자열·숫자·리치텍스트·수식 결과 등 여러 모양이라 문자열로 눌러준다. */
function cellText(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? '').join('')
    if ('result' in v) return cellText(v.result)
    if ('text' in v) return String(v.text)
  }
  return String(v)
}

export async function buildImport(filePath) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const topics = []
  const questions = []
  const issues = []

  wb.eachSheet((ws) => {
    const sheetName = ws.name
    if (SKIP_SHEETS.has(sheetName)) {
      issues.push({ sheet: sheetName, row: 0, why: '빈 시트 — 건너뜀', sample: '' })
      return
    }

    const parsedSheet = parseSheetName(sheetName)
    const name = NAME_FIXES.get(parsedSheet.name) ?? parsedSheet.name
    const stars = parsedSheet.stars
    const kind = ROLEPLAY_SHEETS.has(sheetName) ? 'roleplay' : 'topic'
    let curSet = null
    let seq = 0
    const before = questions.length

    // 시트 머리글과 시트명이 다른지 본다(기획서가 지적한 Hotel★★ / Bank ★★, Heath 오타).
    // 표기 차이(Park/Walking vs ParkWalking)까지 잡으면 목록이 시끄러워지므로,
    // 기호와 대소문자를 지운 뒤 한쪽이 다른 쪽을 포함하지도 않을 때만 올린다.
    const header = cellText(ws.getRow(1).getCell(1).value).trim()
    const loose = (s) => s.replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase()
    if (header && !/ROLE\s*PLAY/i.test(header)) {
      const h = loose(header)
      const n = loose(name)
      if (h && n && !h.includes(n) && !n.includes(h)) {
        issues.push({ sheet: sheetName, row: 1, why: '시트 머리글이 시트명과 다름', sample: header })
      }
    }

    for (let i = 1; i <= ws.rowCount; i++) {
      const row = ws.getRow(i)
      const a = cellText(row.getCell(1).value).trim()
      const b = cellText(row.getCell(2).value)
      const c = cellText(row.getCell(3).value)

      // 시트 머리글과 ROLE PLAY 구분선은 A:C가 가로로 병합되어 있어 세 칸에 같은 값이 온다.
      // 문항이 아니라 구분선이므로 세트만 바꾸고 넘어간다.
      if (a !== '' && a === b.trim() && a === c.trim()) {
        if (/ROLE\s*PLAY/i.test(a)) curSet = 'ROLE PLAY'
        continue
      }

      const label = normalizeSetLabel(a)
      if (label) curSet = label
      if (b.trim() === '' || c.trim() === '') continue

      if (kind === 'roleplay') {
        seq += 1
        const t = parseTitleLine(b.trim().split('\n')[0])
        questions.push({
          sheetName,
          setLabel: curSet,
          seq,
          level: t.level,
          titleKo: t.title || b.trim().slice(0, 40),
          altTitles: [],
          importance: t.importance,
          questionEn: '',
          answerEn: c,
          sourceRef: `${sheetName}!C${i}`,
          answerHash: answerHash(c),
        })
        continue
      }

      const split = splitQuestionCell(b)
      if (!split) {
        issues.push({
          sheet: sheetName,
          row: i,
          why: 'B열에서 영어 질문 경계를 찾지 못함',
          sample: b.slice(0, 60).replace(/\n/g, '⏎'),
        })
        continue
      }

      const parsed = split.titles.map(parseTitleLine)
      seq += 1
      questions.push({
        sheetName,
        setLabel: curSet,
        seq,
        level: parsed[0].level,
        titleKo: parsed[0].title,
        altTitles: parsed.slice(1).map((p) => p.title),
        importance: Math.max(...parsed.map((p) => p.importance)),
        questionEn: split.questionEn,
        answerEn: c,
        sourceRef: `${sheetName}!C${i}`,
        answerHash: answerHash(c),
      })
    }

    if (questions.length > before) {
      topics.push({ sheetName, name, stars, kind, displayOrder: topics.length })
    }
  })

  // 같은 영어 질문이 서로 다른 주제에 들어가 있으면 시트 간 복사 실수다
  // (Hotel★★에 Bank 질문이 들어간 경우). 화면에서 고칠 수 있게 표시만 남긴다.
  const topicsOfQuestion = new Map()
  for (const q of questions) {
    if (q.questionEn.trim() === '') continue
    const set = topicsOfQuestion.get(q.questionEn) ?? new Set()
    set.add(q.sheetName)
    topicsOfQuestion.set(q.questionEn, set)
  }
  for (const q of questions) {
    q.sharedQuestion = (topicsOfQuestion.get(q.questionEn)?.size ?? 0) > 1
  }

  const patterns = findPatterns(questions.map((q) => ({ topic: q.sheetName, answer: q.answerEn })))
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
  for (const it of issues) {
    console.log(`  [${it.sheet}] r${it.row} ${it.why}${it.sample ? ' | ' + it.sample : ''}`)
  }
  const review = questions.filter((q) => q.sharedQuestion)
  console.log('')
  console.log(`-- 검수 표시(같은 영어 질문이 다른 주제에도 있음) ${review.length}건 --`)
  for (const q of review) console.log(`  ${q.sourceRef.padEnd(18)} ${q.titleKo.slice(0, 40)}`)
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
const data = await buildImport(filePath)
report(data)
if (flag === '--apply') {
  const { applyImport } = await import('./import-opic-apply.mjs')
  await applyImport(data)
}
