import { describe, expect, it } from 'vitest'
import {
  checkStatement,
  cleanName,
  groupCellsIntoRows,
  normalizeText,
  parseMoney,
  parseStatementRows,
  type TextCell,
} from './statementPdf'

const cell = (x: number, y: number, str: string): TextCell => ({ x, y, str })

/** 실제 PDF와 같은 모양으로 한 줄을 만든다. */
function row(y: number, date: string, time: string, kind: string, memo: string[], w: string, d: string, b: string) {
  return [
    cell(50, y, date),
    cell(130, y, time),
    cell(212, y, kind),
    ...memo.map((m, i) => cell(270 + i * 28, y, m)),
    cell(360, y, w),
    cell(463, y, d),
    cell(503, y, b),
  ]
}

describe('parseMoney', () => {
  it('콤마와 원을 걷어내고 숫자만 남긴다', () => {
    expect(parseMoney('1,473,580 원')).toBe(1473580)
    expect(parseMoney('0 원')).toBe(0)
  })
})

describe('normalizeText', () => {
  it('전각 문자를 반각으로 바꾼다', () => {
    expect(normalizeText('삼성ＳＤＳ지부')).toBe('삼성SDS지부')
    expect(normalizeText('ＫＢ손237 09')).toBe('KB손237 09')
  })
})

describe('cleanName', () => {
  it('오픈뱅킹 거래의 채널명 "토스 "를 떼어낸다', () => {
    expect(cleanName('토스 백승빈', '오픈')).toBe('백승빈')
  })
  it('붙어 있는 상호명 "토스페이"는 자르지 않는다', () => {
    expect(cleanName('토스페이', '오픈')).toBe('토스페이')
  })
  it('열 너비 때문에 잘려 남은 여는 괄호를 뗀다', () => {
    expect(cleanName('토스 구본왕（', '오픈')).toBe('구본왕')
  })
  it('오픈뱅킹이 아니면 토스로 시작해도 건드리지 않는다', () => {
    expect(cleanName('토스 뱅크', '타행')).toBe('토스 뱅크')
  })
})

describe('groupCellsIntoRows', () => {
  it('세로 위치가 가까운 조각을 한 줄로 묶고 가로 순으로 정렬한다', () => {
    const rows = groupCellsIntoRows([cell(300, 100, 'b'), cell(50, 102, 'a'), cell(50, 60, 'c')])
    expect(rows.map((r) => r.map((c) => c.str))).toEqual([['a', 'b'], ['c']])
  })
  it('빈 문자열은 버린다', () => {
    expect(groupCellsIntoRows([cell(50, 100, '  '), cell(60, 100, 'a')])).toEqual([[cell(60, 100, 'a')]])
  })
})

describe('parseStatementRows', () => {
  it('출금 거래를 읽는다', () => {
    const { transactions } = parseStatementRows([
      row(400, '2026.09.28', '19:29:45', '지로', ['KT통신요금09'], '16,170 원', '0 원', '4,610,553 원'),
    ])
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toMatchObject({
      date: '2026-09-28',
      kind: '지로',
      name: 'KT통신요금09',
      withdrawal: 16170,
      deposit: 0,
      balance: 4610553,
    })
  })

  it('입금 거래는 입금액 칸에 값이 들어간다', () => {
    const { transactions } = parseStatementRows([
      row(400, '2026.09.21', '02:07:59', '지로', ['삼성SDS'], '0 원', '7,709,020 원', '10,898,151 원'),
    ])
    expect(transactions[0]).toMatchObject({ name: '삼성SDS', withdrawal: 0, deposit: 7709020 })
  })

  it('이름이 여러 조각으로 쪼개져 들어와도 합쳐 읽는다', () => {
    const { transactions } = parseStatementRows([
      row(400, '2026.09.28', '08:11:33', '오픈', ['토스', '백승빈'], '10,000 원', '0 원', '5,247,132 원'),
    ])
    expect(transactions[0].name).toBe('백승빈')
  })

  it('거래가 아닌 줄은 건너뛴다', () => {
    const { transactions } = parseStatementRows([
      [cell(37, 500, '조회기간 : 2026.09.01 ~ 2026.09.29')],
      [cell(58, 480, '거래일자'), cell(133, 480, '거래시간')],
    ])
    expect(transactions).toHaveLength(0)
  })

  it('문서에 적힌 총 입금액·총 출금액을 읽어 둔다', () => {
    const { statedDeposit, statedWithdrawal } = parseStatementRows([
      [cell(60, 600, '총 입금액'), cell(200, 600, '8,150,678 원'), cell(380, 600, '총 출금액'), cell(500, 600, '7,293,768 원')],
    ])
    expect(statedDeposit).toBe(8150678)
    expect(statedWithdrawal).toBe(7293768)
  })

  it('첫 거래의 날짜로 연월을 정한다', () => {
    const { year, month } = parseStatementRows([
      row(400, '2026.09.28', '19:29:45', '지로', ['KT통신요금09'], '16,170 원', '0 원', '4,610,553 원'),
    ])
    expect([year, month]).toEqual([2026, 9])
  })
})

describe('checkStatement', () => {
  const statement = {
    year: 2026,
    month: 9,
    statedDeposit: 988,
    statedWithdrawal: 100,
    transactions: [
      { id: 'a', date: '2026-09-27', time: '', kind: '오픈', name: '토스페이', withdrawal: 100, deposit: 0, balance: 1 },
      { id: 'b', date: '2026-09-19', time: '', kind: '이자', name: '결산이자', withdrawal: 0, deposit: 988, balance: 2 },
    ],
  }

  it('합계가 문서 총액과 맞으면 통과한다', () => {
    expect(checkStatement(statement)).toMatchObject({ depositOk: true, withdrawalOk: true })
  })

  it('합계가 다르면 걸러낸다', () => {
    expect(checkStatement({ ...statement, statedWithdrawal: 999 }).withdrawalOk).toBe(false)
  })

  it('문서에 총액이 없으면 통과로 둔다', () => {
    const none = { ...statement, statedDeposit: null, statedWithdrawal: null }
    expect(checkStatement(none)).toMatchObject({ depositOk: true, withdrawalOk: true })
  })
})
