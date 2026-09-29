// 거래내역 PDF에서 읽은 거래를 가계부 카테고리로 옮기는 규칙.

import type { StatementTx } from './statementPdf'

export type MatchKind = 'exact' | 'prefix'

export interface MappingRule {
  /** 거래내용에 찍히는 이름. */
  statementName: string
  /** 가계부 카테고리 이름. expense_categories.name과 같아야 한다. */
  category: string
  /** 이 규칙이 성립하는 방향. 방향이 다르면 이름이 같아도 적용하지 않는다. */
  direction: 'income' | 'expense'
  /**
   * prefix면 뒤에 무엇이 붙어도 매칭한다. 핸드폰 요금은 "KT2931736809"처럼 계좌번호가
   * 달마다 바뀌어 붙기 때문에 필요하다.
   */
  match: MatchKind
}

/**
 * 한 달에 여러 건이 찍혀 합산해야 하는 카테고리.
 * 삼성카드는 개인/법인 두 건, 핸드폰은 본인과 자녀 2명분으로 세 건이 나온다.
 */
export const SUMMED_CATEGORIES = new Set(['삼성카드', '내꺼핸드폰+애들'])

/**
 * 매달 21~25일에 "김성진" 이름으로 나가는 출금은 현대카드와 우리카드(와이프 사용분)를
 * 합쳐 보내는 돈이다. 두 카드로 어떻게 나뉘는지는 거래내역만 보고 알 수 없으므로 자동
 * 입력에서 빼고 안내만 한다. 추가 지출액으로 넣으면 카드값이 이중 계상된다.
 */
export const MANUAL_SPLIT_NAME = '김성진'

/**
 * 규칙은 구체적인 것이 앞에 온다. "KT통신요금09"(인터넷)와 "KT2931736809"(핸드폰)가
 * 둘 다 KT로 시작하므로, 인터넷 규칙을 먼저 보고 나서 핸드폰 접두사 규칙을 봐야 한다.
 */
export const MAPPING_RULES: MappingRule[] = [
  { statementName: '삼성SDS', category: '월급', direction: 'income', match: 'exact' },
  { statementName: '결산이자', category: '이자', direction: 'income', match: 'exact' },
  { statementName: '장모님용돈', category: '장모님 용돈', direction: 'expense', match: 'exact' },
  { statementName: '마눌준보험료', category: '마눌승빈보험', direction: 'expense', match: 'exact' },
  { statementName: 'KB손23709', category: 'KB 보험', direction: 'expense', match: 'exact' },
  { statementName: '장계계', category: '장계계', direction: 'expense', match: 'exact' },
  { statementName: '내꺼주택청약', category: '주택청약', direction: 'expense', match: 'exact' },
  { statementName: '신한카드', category: '신한카드', direction: 'expense', match: 'exact' },
  { statementName: '삼성카드', category: '삼성카드', direction: 'expense', match: 'exact' },
  { statementName: 'KT통신요금', category: '인터넷+TV', direction: 'expense', match: 'prefix' },
  { statementName: 'KT', category: '내꺼핸드폰+애들', direction: 'expense', match: 'prefix' },
]

export const ITEMIZED_EXPENSE = '추가 지출액'
export const ITEMIZED_INCOME = '추가 입금액'

export interface MappedCategory {
  category: string
  amount: number
  /** 이 금액을 만든 거래들. 합산된 경우 여러 건이다. */
  sources: StatementTx[]
}

export interface MappedItem {
  category: string
  memo: string
  amount: number
  source: StatementTx
}

export interface MappingResult {
  categories: MappedCategory[]
  items: MappedItem[]
  /** 자동 입력에서 빼고 사용자가 직접 처리해야 하는 거래. */
  manual: StatementTx[]
}

/** 비교용으로 공백과 기호를 없애고 영문은 대문자로 맞춘다. */
export function normalizeName(name: string): string {
  return name.replace(/[\s()[\]{}.,_\-'"]/g, '').toUpperCase()
}

/** 거래에 맞는 규칙을 고른다. 방향이 같은 규칙만, 그리고 앞에 있는 규칙을 먼저 본다. */
export function findRule(tx: StatementTx, rules: MappingRule[] = MAPPING_RULES): MappingRule | null {
  const direction = tx.deposit > 0 ? 'income' : 'expense'
  const target = normalizeName(tx.name)

  for (const rule of rules) {
    if (rule.direction !== direction) continue
    const key = normalizeName(rule.statementName)
    if (rule.match === 'exact' ? target === key : target.startsWith(key)) return rule
  }

  return null
}

/** 품목 메모. "9.27 토스페이"처럼 날짜를 앞에 붙인다. */
export function buildMemo(tx: StatementTx): string {
  const [, month, day] = tx.date.split('-')
  return `${Number(month)}.${Number(day)} ${tx.name}`
}

const amountOf = (tx: StatementTx) => (tx.deposit > 0 ? tx.deposit : tx.withdrawal)

const toItem = (tx: StatementTx): MappedItem => ({
  category: tx.deposit > 0 ? ITEMIZED_INCOME : ITEMIZED_EXPENSE,
  memo: buildMemo(tx),
  amount: amountOf(tx),
  source: tx,
})

/** 거래 목록을 가계부에 넣을 형태로 바꾼다. */
export function mapTransactions(
  transactions: StatementTx[],
  rules: MappingRule[] = MAPPING_RULES,
): MappingResult {
  const byCategory = new Map<string, MappedCategory>()
  const items: MappedItem[] = []
  const manual: StatementTx[] = []

  for (const tx of transactions) {
    if (tx.withdrawal > 0 && normalizeName(tx.name) === normalizeName(MANUAL_SPLIT_NAME)) {
      manual.push(tx)
      continue
    }

    const rule = findRule(tx, rules)
    if (!rule) {
      items.push(toItem(tx))
      continue
    }

    const existing = byCategory.get(rule.category)
    if (!existing) {
      byCategory.set(rule.category, { category: rule.category, amount: amountOf(tx), sources: [tx] })
    } else if (SUMMED_CATEGORIES.has(rule.category)) {
      existing.amount += amountOf(tx)
      existing.sources.push(tx)
    } else {
      // 합산 대상이 아닌데 두 번 잡히면 품목으로 돌려 사용자가 판단하게 둔다.
      items.push(toItem(tx))
    }
  }

  return { categories: [...byCategory.values()], items, manual }
}
