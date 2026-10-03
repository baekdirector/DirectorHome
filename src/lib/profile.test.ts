import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearProfile,
  loadProfile,
  saveProfile,
  setViewingOwner,
  viewingOwner,
} from './profile'

// 이 저장소는 Node 환경(jsdom 없음)에서 테스트가 돌아가므로 localStorage를 직접 흉내 낸다.
class FakeLocalStorage {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new FakeLocalStorage()
})

describe('loadProfile / saveProfile', () => {
  it('로그인하지 않았으면 null', () => {
    expect(loadProfile()).toBeNull()
  })

  it('저장한 계정을 그대로 돌려준다', () => {
    saveProfile('beensvoca', false)
    expect(loadProfile()).toBe('beensvoca')
  })

  it('"30일 유지"를 끄면 만료 시각을 두지 않는다(브라우저를 닫을 때까지)', () => {
    saveProfile('junsvoca', false)
    expect(localStorage.getItem('dh_profile_until')).toBeNull()
    expect(loadProfile()).toBe('junsvoca')
  })

  it('"30일 유지"를 켜면 만료 시각이 30일 뒤로 찍힌다', () => {
    const before = Date.now()
    saveProfile('junsvoca', true)
    const until = Number(localStorage.getItem('dh_profile_until'))
    expect(until).toBeGreaterThanOrEqual(before + 29 * 24 * 60 * 60 * 1000)
    expect(loadProfile()).toBe('junsvoca')
  })

  it('만료된 로그인은 null이고 저장값도 지워진다', () => {
    saveProfile('junsvoca', true)
    localStorage.setItem('dh_profile_until', String(Date.now() - 1))
    expect(loadProfile()).toBeNull()
    expect(localStorage.getItem('dh_profile')).toBeNull()
  })

  it('저장된 값이 아는 계정이 아니면 null', () => {
    localStorage.setItem('dh_profile', 'someone')
    expect(loadProfile()).toBeNull()
  })

  it('로그아웃하면 계정과 보던 아이가 함께 지워진다', () => {
    saveProfile('admin', true)
    setViewingOwner('beensvoca')
    clearProfile()
    expect(loadProfile()).toBeNull()
    expect(viewingOwner(null)).toBe('junsvoca')
  })
})

describe('viewingOwner', () => {
  it('아이로 로그인했으면 고른 값과 무관하게 자기 자신을 본다', () => {
    setViewingOwner('beensvoca')
    expect(viewingOwner('junsvoca')).toBe('junsvoca')
  })

  it('admin은 고른 아이를 본다', () => {
    setViewingOwner('beensvoca')
    expect(viewingOwner('admin')).toBe('beensvoca')
  })

  it('admin이 아직 고르지 않았으면 기존 데이터의 주인(junsvoca)을 본다', () => {
    expect(viewingOwner('admin')).toBe('junsvoca')
  })

  it('localStorage를 쓸 수 없어도 던지지 않는다', () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = undefined
    expect(loadProfile()).toBeNull()
    expect(viewingOwner('admin')).toBe('junsvoca')
    expect(() => saveProfile('junsvoca', true)).not.toThrow()
  })
})
