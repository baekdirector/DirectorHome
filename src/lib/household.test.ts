import { describe, expect, it } from 'vitest'
import { formatWon, isAccessTokenValid, parseWonInput } from './household'

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
