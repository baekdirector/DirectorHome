import { describe, expect, it } from 'vitest'
import { formatWon, isAccessTokenValid, parseWonInput, findMonthSummary } from './household'

describe('formatWon', () => {
  it('천단위 콤마를 붙인다', () => {
    expect(formatWon(1234567)).toBe('1,234,567')
  })
  it('0은 그대로 0', () => {
    expect(formatWon(0)).toBe('0')
  })
})

describe('parseWonInput', () => {
  it('콤마·원 단위가 섞인 문자열에서 숫자만 뽑는다', () => {
    expect(parseWonInput('1,234,567원')).toBe(1234567)
  })
  it('숫자가 없으면 0을 반환한다(빈 문자열 포함)', () => {
    expect(parseWonInput('')).toBe(0)
    expect(parseWonInput('원')).toBe(0)
  })
})

describe('isAccessTokenValid', () => {
  it('저장된 값이 없으면 false', () => {
    expect(isAccessTokenValid(null, Date.now())).toBe(false)
  })
  it('만료 전이면 true', () => {
    expect(isAccessTokenValid(String(Date.now() + 1000), Date.now())).toBe(true)
  })
  it('만료 시각을 정확히 지났으면 false', () => {
    const now = Date.now()
    expect(isAccessTokenValid(String(now - 1), now)).toBe(false)
  })
})

describe('findMonthSummary', () => {
  it('해당 연도에 데이터가 하나도 없으면 undefined를 반환한다(에러 아님)', () => {
    expect(findMonthSummary({ months: [], openingBalance: 0 }, 9)).toBeUndefined()
  })
  it('월이 일치하는 항목을 찾는다', () => {
    const summary = {
      months: [{ year: 2026, month: 9, income: 0, cardTotal: 0, fixedTotal: 0, utilityTotal: 0, variableTotal: 0, expenseTotal: 0, net: 0, balance: 1000 }],
      openingBalance: 0,
    }
    expect(findMonthSummary(summary, 9)?.balance).toBe(1000)
  })
})
