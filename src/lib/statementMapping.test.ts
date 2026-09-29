import { describe, expect, it } from 'vitest'
import { buildMemo, findRule, mapTransactions } from './statementMapping'
import type { StatementTx } from './statementPdf'

let seq = 0
const tx = (name: string, amount: number, dir: 'in' | 'out', date = '2026-09-22'): StatementTx => ({
  id: `t${seq++}`,
  date,
  time: '00:00:00',
  kind: '오픈',
  name,
  withdrawal: dir === 'out' ? amount : 0,
  deposit: dir === 'in' ? amount : 0,
  balance: 0,
})

describe('findRule', () => {
  it('입금 삼성SDS는 월급으로 잡는다', () => {
    expect(findRule(tx('삼성SDS', 7709020, 'in'))?.category).toBe('월급')
  })

  it('출금 삼성SDS지부는 월급으로 잡지 않는다', () => {
    expect(findRule(tx('삼성SDS지부', 10000, 'out'))).toBeNull()
  })

  it('계좌번호가 붙은 KT는 핸드폰 요금으로 잡는다', () => {
    expect(findRule(tx('KT2931736809', 56700, 'out'))?.category).toBe('내꺼핸드폰+애들')
  })

  it('KT통신요금09는 핸드폰이 아니라 인터넷+TV로 잡는다', () => {
    expect(findRule(tx('KT통신요금09', 16170, 'out'))?.category).toBe('인터넷+TV')
  })

  it('전각·공백이 섞여도 같은 이름으로 본다', () => {
    expect(findRule(tx('KB손237 09', 148409, 'out'))?.category).toBe('KB 보험')
  })
})

describe('mapTransactions', () => {
  it('핸드폰 요금 3건을 하나로 합산한다', () => {
    const { categories } = mapTransactions([
      tx('KT2931736809', 56700, 'out'),
      tx('KT9930736809', 31160, 'out'),
      tx('KT3479736809', 31160, 'out'),
    ])
    const phone = categories.find((c) => c.category === '내꺼핸드폰+애들')
    expect(phone?.amount).toBe(119020)
    expect(phone?.sources).toHaveLength(3)
  })

  it('삼성카드 2건(개인·법인)을 합산한다', () => {
    const { categories } = mapTransactions([tx('삼성카드', 372000, 'out'), tx('삼성카드', 2748251, 'out')])
    expect(categories.find((c) => c.category === '삼성카드')?.amount).toBe(3120251)
  })

  it('합산 대상이 아닌 카테고리가 두 번 나오면 뒤엣것은 품목으로 돌린다', () => {
    const { categories, items } = mapTransactions([tx('신한카드', 641483, 'out'), tx('신한카드', 500, 'out')])
    expect(categories.find((c) => c.category === '신한카드')?.amount).toBe(641483)
    expect(items).toHaveLength(1)
    expect(items[0].amount).toBe(500)
  })

  it('김성진 출금은 자동 입력에서 빼고 안내로만 남긴다', () => {
    const { manual, items, categories } = mapTransactions([tx('김성진', 1473580, 'out')])
    expect(manual).toHaveLength(1)
    expect(items).toHaveLength(0)
    expect(categories).toHaveLength(0)
  })

  it('매핑에 없는 출금은 추가 지출액, 입금은 추가 입금액으로 보낸다', () => {
    const { items } = mapTransactions([tx('황명희', 160000, 'out'), tx('송인성', 220670, 'in')])
    expect(items.map((i) => i.category)).toEqual(['추가 지출액', '추가 입금액'])
  })

  it('품목 메모에 날짜를 붙인다', () => {
    expect(buildMemo(tx('토스페이', 100, 'out', '2026-09-27'))).toBe('9.27 토스페이')
  })
})
