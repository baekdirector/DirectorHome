// MG새마을금고 "거래내역조회" PDF에서 거래 목록을 읽는다.
//
// 이 PDF에는 진짜 텍스트 레이어가 있어 OCR이 필요 없다. 출금액과 입금액이 따로 있는 열이라
// 입출금 방향을 추측할 일도 없고, 문서에 적힌 총 입금액·총 출금액으로 검산까지 된다.
// pdf.js 호출부와 표 해석부를 나눠 두어 해석 로직은 브라우저 없이 테스트할 수 있다.

export interface TextCell {
  x: number
  y: number
  str: string
}

export interface StatementTx {
  /** 같은 날 같은 금액이 여러 건일 수 있어 시각까지 포함해 키를 만든다. */
  id: string
  /** "2026-09-28" */
  date: string
  time: string
  /** 거래구분(지로·대체·CMS·자동이체·오픈 등). */
  kind: string
  /** 거래내용/메모를 정규화한 이름. */
  name: string
  withdrawal: number
  deposit: number
  balance: number
}

export interface Statement {
  year: number
  month: number
  /** 문서에 적힌 총 입금액/총 출금액. 파싱 검산에 쓴다. 없으면 null. */
  statedDeposit: number | null
  statedWithdrawal: number | null
  transactions: StatementTx[]
}

const MONEY = /^[\d,]+\s*원$/
const DATE = /^(\d{4})\.(\d{2})\.(\d{2})$/

/** "1,473,580 원" -> 1473580. 숫자가 없으면 0. */
export function parseMoney(text: string): number {
  const digits = text.replace(/[^0-9]/g, '')
  return digits === '' ? 0 : parseInt(digits, 10)
}

/**
 * 전각 문자를 반각으로 되돌리고 여분의 공백을 정리한다.
 * 이 PDF는 "ＫＢ손237 09", "삼성ＳＤＳ지부"처럼 전각이 섞여 나온다.
 */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

/**
 * 거래내용을 사람이 읽기 좋은 이름으로 다듬는다.
 * 오픈뱅킹 거래는 "토스 백승빈"처럼 채널명이 앞에 붙고, 열 너비 때문에 "구본왕("처럼
 * 이름이 잘린 채 괄호만 남기도 한다.
 */
export function cleanName(raw: string, kind: string): string {
  let name = normalizeText(raw)
  // 채널명이 별도 칸으로 들어온 "토스 백승빈"만 떼어낸다. 붙어 있는 "토스페이"는 상호명이다.
  if (kind === '오픈') name = name.replace(/^토스\s+/, '')
  // 잘려서 남은 여는 괄호는 떼어낸다.
  name = name.replace(/\s*\($/, '')
  return name.trim()
}

/** 세로 위치가 같은 텍스트 조각들을 한 줄로 묶고, 각 줄은 가로 순으로 정렬한다. */
export function groupCellsIntoRows(cells: TextCell[], tolerance = 3): TextCell[][] {
  const rows = new Map<number, TextCell[]>()

  for (const cell of cells) {
    if (cell.str.trim() === '') continue
    const key = [...rows.keys()].find((k) => Math.abs(k - cell.y) <= tolerance) ?? cell.y
    const bucket = rows.get(key)
    if (bucket) bucket.push(cell)
    else rows.set(key, [cell])
  }

  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // PDF 좌표는 아래가 0이라 큰 값이 위쪽이다.
    .map(([, row]) => row.sort((a, b) => a.x - b.x))
}

/**
 * 표의 각 줄을 거래로 해석한다.
 *
 * 열 위치를 좌표로 고정하지 않고 "금액처럼 생긴 칸 중 마지막 세 개가 출금·입금·잔액"이라는
 * 규칙을 쓴다. 이렇게 하면 이름이 여러 조각으로 쪼개져 들어와도(예: "토스"+"백승빈")
 * 흔들리지 않는다.
 */
export function parseStatementRows(rows: TextCell[][]): Statement {
  const transactions: StatementTx[] = []
  let statedDeposit: number | null = null
  let statedWithdrawal: number | null = null

  for (const row of rows) {
    const texts = row.map((c) => normalizeText(c.str))
    const joined = texts.join(' ')

    const totals = joined.match(/총\s*입금액\s*([\d,]+)\s*원\s*총\s*출금액\s*([\d,]+)\s*원/)
    if (totals) {
      statedDeposit = parseMoney(totals[1])
      statedWithdrawal = parseMoney(totals[2])
      continue
    }

    const dateMatch = texts[0]?.match(DATE)
    if (!dateMatch) continue

    const moneyIndexes = texts.map((t, i) => (MONEY.test(t) ? i : -1)).filter((i) => i >= 0)
    if (moneyIndexes.length < 3) continue

    const [wIdx, dIdx, bIdx] = moneyIndexes.slice(-3)
    const time = texts[1] ?? ''
    const kind = texts[2] ?? ''
    const name = cleanName(texts.slice(3, wIdx).join(' '), kind)
    if (name === '') continue

    const [, year, month, day] = dateMatch
    transactions.push({
      id: `${year}${month}${day}-${time}`,
      date: `${year}-${month}-${day}`,
      time,
      kind,
      name,
      withdrawal: parseMoney(texts[wIdx]),
      deposit: parseMoney(texts[dIdx]),
      balance: parseMoney(texts[bIdx]),
    })
  }

  const first = transactions[0]
  const [year, month] = first ? first.date.split('-').map(Number) : [0, 0]

  return { year, month, statedDeposit, statedWithdrawal, transactions }
}

export interface StatementCheck {
  depositOk: boolean
  withdrawalOk: boolean
  sumDeposit: number
  sumWithdrawal: number
}

/** 읽어낸 거래 합계가 문서에 적힌 총액과 맞는지 본다. 총액이 없으면 통과로 둔다. */
export function checkStatement(statement: Statement): StatementCheck {
  const sumDeposit = statement.transactions.reduce((s, t) => s + t.deposit, 0)
  const sumWithdrawal = statement.transactions.reduce((s, t) => s + t.withdrawal, 0)
  return {
    sumDeposit,
    sumWithdrawal,
    depositOk: statement.statedDeposit === null || statement.statedDeposit === sumDeposit,
    withdrawalOk: statement.statedWithdrawal === null || statement.statedWithdrawal === sumWithdrawal,
  }
}

/** PDF 바이트를 읽어 거래 목록으로 만든다. 파일은 메모리에서만 다루고 어디에도 저장하지 않는다. */
export async function readStatementPdf(data: ArrayBuffer): Promise<Statement> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href

  const task = pdfjs.getDocument({ data: new Uint8Array(data) })
  const doc = await task.promise
  const cells: TextCell[] = []

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      // 페이지가 넘어가도 줄이 섞이지 않도록 페이지마다 세로 위치를 아래로 밀어 둔다.
      const offset = (p - 1) * 100000
      for (const item of content.items) {
        if (!('str' in item)) continue
        cells.push({ x: item.transform[4], y: item.transform[5] - offset, str: item.str })
      }
      page.cleanup()
    }
  } finally {
    // 로딩 태스크를 없애야 워커와 PDF 바이트가 함께 풀린다.
    await task.destroy()
  }

  return parseStatementRows(groupCellsIntoRows(cells))
}
