import { describe, expect, it } from 'vitest'
import {
  dayCount,
  expandDateRange,
  formatDueDate,
  homeworkState,
  localDateString,
  nextDate,
  shiftDate,
} from './homework'

describe('localDateString', () => {
  it('그 기기의 지역 날짜를 YYYY-MM-DD로 준다', () => {
    expect(localDateString(new Date(2026, 9, 2, 14, 30))).toBe('2026-10-02')
  })

  it('월과 일을 두 자리로 채운다', () => {
    expect(localDateString(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05')
  })

  // toISOString()을 쓰면 한국 시간 오전 9시 이전이 전날 UTC로 바뀌어 하루가 밀린다.
  it('새벽에도 그날 날짜를 준다', () => {
    expect(localDateString(new Date(2026, 9, 2, 0, 30))).toBe('2026-10-02')
  })

  it('밤 늦게도 그날 날짜를 준다', () => {
    expect(localDateString(new Date(2026, 9, 2, 23, 59))).toBe('2026-10-02')
  })
})

describe('shiftDate', () => {
  it('날짜를 앞뒤로 옮긴다', () => {
    expect(shiftDate('2026-10-02', 7)).toBe('2026-10-09')
    expect(shiftDate('2026-10-02', -7)).toBe('2026-09-25')
    expect(shiftDate('2026-10-02', 0)).toBe('2026-10-02')
  })

  it('월과 연을 거꾸로도 넘긴다', () => {
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('nextDate', () => {
  it('하루를 더한다', () => {
    expect(nextDate('2026-10-02')).toBe('2026-10-03')
  })

  it('월말을 넘긴다', () => {
    expect(nextDate('2026-10-31')).toBe('2026-11-01')
  })

  it('연말을 넘긴다', () => {
    expect(nextDate('2026-12-31')).toBe('2027-01-01')
  })

  it('윤년 2월을 넘긴다', () => {
    expect(nextDate('2028-02-28')).toBe('2028-02-29')
  })
})

describe('expandDateRange', () => {
  it('하루짜리는 그 하루만 준다', () => {
    expect(expandDateRange('2026-10-02', '2026-10-02')).toEqual(['2026-10-02'])
  })

  it('기간을 하루씩 모두 펼친다', () => {
    expect(expandDateRange('2026-10-02', '2026-10-05')).toEqual([
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ])
  })

  it('월을 넘겨도 날짜가 빠지지 않는다', () => {
    expect(expandDateRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
  })

  it('거꾸로 주면 빈 목록을 준다', () => {
    expect(expandDateRange('2026-10-05', '2026-10-02')).toEqual([])
  })

  it('날짜 형식이 아니면 빈 목록을 준다', () => {
    expect(expandDateRange('', '2026-10-02')).toEqual([])
  })
})

describe('dayCount', () => {
  it('배정 버튼에 쓸 날짜 수를 센다', () => {
    expect(dayCount('2026-10-02', '2026-10-08')).toBe(7)
    expect(dayCount('2026-10-02', '2026-10-02')).toBe(1)
    expect(dayCount('2026-10-08', '2026-10-02')).toBe(0)
  })
})

describe('formatDueDate', () => {
  it('"10월 2일 (금)"으로 보여준다', () => {
    expect(formatDueDate('2026-10-02')).toBe('10월 2일 (금)')
  })
})

describe('homeworkState', () => {
  const today = '2026-10-02'

  it('오늘 날짜이고 안 끝냈으면 today', () => {
    expect(homeworkState({ dueDate: today, completedAt: null }, today)).toBe('today')
  })

  it('오늘 날짜이고 끝냈으면 today-done', () => {
    expect(homeworkState({ dueDate: today, completedAt: 1 }, today)).toBe('today-done')
  })

  it('지난 날짜이고 안 끝냈으면 overdue', () => {
    expect(homeworkState({ dueDate: '2026-09-30', completedAt: null }, today)).toBe('overdue')
  })

  it('지난 날짜이고 끝냈으면 done', () => {
    expect(homeworkState({ dueDate: '2026-09-30', completedAt: 1 }, today)).toBe('done')
  })

  it('앞으로 올 날짜면 upcoming', () => {
    expect(homeworkState({ dueDate: '2026-10-03', completedAt: null }, today)).toBe('upcoming')
  })
})
