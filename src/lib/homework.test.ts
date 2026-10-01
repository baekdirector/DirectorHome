import { describe, expect, it } from 'vitest'
import {
  dayCount,
  expandDateRange,
  formatDueDate,
  homeworkState,
  localDateString,
  nextDate,
  parseQuestionCount,
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

  it('오늘 숙제를 풀어 봤지만 아직 못 끝냈으면 today-tried', () => {
    expect(homeworkState({ dueDate: today, completedAt: null, attemptedAt: 5 }, today)).toBe('today-tried')
  })

  it('풀어 본 기록이 있어도 끝냈으면 today-done', () => {
    expect(homeworkState({ dueDate: today, completedAt: 9, attemptedAt: 5 }, today)).toBe('today-done')
  })

  it('밀린 숙제는 풀어 봤어도 overdue 그대로', () => {
    expect(homeworkState({ dueDate: '2026-09-30', completedAt: null, attemptedAt: 5 }, today)).toBe('overdue')
  })
})

describe('parseQuestionCount', () => {
  it('양의 정수 문자열을 숫자로 읽는다', () => {
    expect(parseQuestionCount('50')).toBe(50)
    expect(parseQuestionCount(' 7 ')).toBe(7)
  })

  it('비었거나 숫자가 아니거나 0 이하면 null', () => {
    expect(parseQuestionCount('')).toBeNull()
    expect(parseQuestionCount('abc')).toBeNull()
    expect(parseQuestionCount('0')).toBeNull()
    expect(parseQuestionCount('-3')).toBeNull()
  })

  it('소수나 숫자 뒤에 글자가 붙은 것은 받지 않는다', () => {
    expect(parseQuestionCount('2.5')).toBeNull()
    expect(parseQuestionCount('20개')).toBeNull()
  })

  it('너무 큰 값은 상한(1000)으로 막는다', () => {
    expect(parseQuestionCount('5000')).toBeNull()
    expect(parseQuestionCount('1000')).toBe(1000)
  })
})
