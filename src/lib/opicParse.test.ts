import { describe, expect, it } from 'vitest'
import {
  answerHash,
  findPatterns,
  normalizeSetLabel,
  parseAnnotations,
  parseSheetName,
  parseTitleLine,
  splitQuestionCell,
} from './opicParse'

describe('parseSheetName', () => {
  it('시트명 끝의 ★ 개수를 빈출도로, 앞부분을 주제명으로 나눈다', () => {
    expect(parseSheetName('Bar★★★')).toEqual({ name: 'Bar', stars: 3 })
    expect(parseSheetName('Transport★★')).toEqual({ name: 'Transport', stars: 2 })
    expect(parseSheetName('Weather★')).toEqual({ name: 'Weather', stars: 1 })
  })
  it('한글 주제명과 공백이 섞여도 처리한다', () => {
    expect(parseSheetName('신문★★★')).toEqual({ name: '신문', stars: 3 })
    expect(parseSheetName('House 1★★★')).toEqual({ name: 'House 1', stars: 3 })
  })
  it('★이 없으면 0', () => {
    expect(parseSheetName('Roleplay')).toEqual({ name: 'Roleplay', stars: 0 })
  })
})

describe('normalizeSetLabel', () => {
  it('대소문자를 맞춘다', () => {
    expect(normalizeSetLabel('1Set')).toBe('1set')
    expect(normalizeSetLabel('2set')).toBe('2set')
  })
  it('숫자로 저장된 값을 N번으로 바꾼다', () => {
    expect(normalizeSetLabel('7.0')).toBe('7번')
    expect(normalizeSetLabel('8.0')).toBe('8번')
  })
  it('번호 라벨은 그대로 둔다', () => {
    expect(normalizeSetLabel('11번')).toBe('11번')
  })
  it('ROLE PLAY 구분선은 ROLE PLAY로 통일한다', () => {
    expect(normalizeSetLabel('ROLE PLAY ★★★ 기차역')).toBe('ROLE PLAY')
  })
  it('빈 값은 null (앞 세트를 잇는다는 뜻)', () => {
    expect(normalizeSetLabel('')).toBeNull()
    expect(normalizeSetLabel('   ')).toBeNull()
  })
})

describe('splitQuestionCell', () => {
  it('빈 줄로 나뉜 형태를 처리한다', () => {
    const cell =
      '[Int] 기차역창구에 가서 기차표 사는 방법 문의\n\nI’d like to give you a situation.\nYou need to buy a train ticket.'
    expect(splitQuestionCell(cell)).toEqual({
      titles: ['[Int] 기차역창구에 가서 기차표 사는 방법 문의'],
      questionEn: 'I’d like to give you a situation.\nYou need to buy a train ticket.',
    })
  })

  it('빈 줄 없이 한 줄 바꿈만 있는 형태도 처리한다', () => {
    const cell =
      '[Int] 가장 좋아하는 영화 장르와 좋아하는 이유 설명 ★★★\nYou indicated in the survey that you like to watch movies.'
    expect(splitQuestionCell(cell)).toEqual({
      titles: ['[Int] 가장 좋아하는 영화 장르와 좋아하는 이유 설명 ★★★'],
      questionEn: 'You indicated in the survey that you like to watch movies.',
    })
  })

  it('한글 제목이 여러 줄이면 모두 titles에 담는다', () => {
    const cell =
      '[Int] 본인이 즐겨 가는 술집 묘사 ★★★★★\n  [Int] 본인이 자주 가는 맥주집 묘사 ★★★★★\n\nTell me about your favorite bar.'
    const out = splitQuestionCell(cell)
    expect(out?.titles).toEqual([
      '[Int] 본인이 즐겨 가는 술집 묘사 ★★★★★',
      '[Int] 본인이 자주 가는 맥주집 묘사 ★★★★★',
    ])
    expect(out?.questionEn).toBe('Tell me about your favorite bar.')
  })

  it('영문 시작 줄이 없으면 null (검수 대상)', () => {
    expect(splitQuestionCell('영업점메시지시작 (전화)')).toBeNull()
  })
})

describe('parseTitleLine', () => {
  it('[Int]와 끝의 ★를 떼고 제목만 남긴다', () => {
    expect(parseTitleLine('[Int] 본인이 즐겨 가는 술집 묘사 ★★★★★')).toEqual({
      level: 'Int',
      importance: 5,
      title: '본인이 즐겨 가는 술집 묘사',
    })
  })
  it('[Adv]도 처리하고 ★이 없으면 0', () => {
    expect(parseTitleLine('[Adv] 술집에 있었던 에피소드 묘사')).toEqual({
      level: 'Adv',
      importance: 0,
      title: '술집에 있었던 에피소드 묘사',
    })
  })
  it('유형 표기가 없으면 level은 null', () => {
    expect(parseTitleLine('영업점메시지시작')).toEqual({
      level: null,
      importance: 0,
      title: '영업점메시지시작',
    })
  })
})

describe('parseAnnotations', () => {
  it('괄호가 없으면 본문 한 조각', () => {
    expect(parseAnnotations('There are tons of bars in Korea.')).toEqual([
      { type: 'text', value: 'There are tons of bars in Korea.' },
    ])
  })

  it('줄 맨 앞 괄호는 분류 라벨로 뺀다', () => {
    expect(parseAnnotations('(종류) What kinds of phones are available?')).toEqual([
      { type: 'label', value: '종류' },
      { type: 'text', value: 'What kinds of phones are available?' },
    ])
  })

  it('문장 중간·끝의 한글 괄호는 칩으로 뺀다', () => {
    expect(parseAnnotations('I often go to bars for social gatherings. (사교모임)')).toEqual([
      { type: 'text', value: 'I often go to bars for social gatherings.' },
      { type: 'chip', pron: null, meaning: '사교모임' },
    ])
  })

  it('쉼표형은 앞을 발음, 뒤를 뜻으로 가른다', () => {
    const out = parseAnnotations('an ongoing diplomatic(디플로메틱,외교) issue')
    expect(out).toEqual([
      { type: 'text', value: 'an ongoing diplomatic' },
      { type: 'chip', pron: '디플로메틱', meaning: '외교' },
      { type: 'text', value: 'issue' },
    ])
  })

  it('이중 괄호 오타를 예외 없이 칩 하나로 처리한다', () => {
    const out = parseAnnotations('I grab some drinks((술을 조금 마시다) with my friends.')
    expect(out).toEqual([
      { type: 'text', value: 'I grab some drinks' },
      { type: 'chip', pron: null, meaning: '술을 조금 마시다' },
      { type: 'text', value: 'with my friends.' },
    ])
  })

  it('한글이 없는 괄호는 본문으로 남긴다', () => {
    expect(parseAnnotations('It is a pub (a nice one) near my house.')).toEqual([
      { type: 'text', value: 'It is a pub (a nice one) near my house.' },
    ])
  })
})

describe('answerHash', () => {
  it('같은 본문은 같은 해시', () => {
    expect(answerHash('A\nB')).toBe(answerHash('A\nB'))
  })
  it('앞뒤 공백과 줄 끝 공백 차이를 무시한다', () => {
    expect(answerHash('  A \n B  ')).toBe(answerHash('A\nB'))
  })
  it('다른 본문은 다른 해시', () => {
    expect(answerHash('A\nB')).not.toBe(answerHash('A\nC'))
  })
})

describe('findPatterns', () => {
  it('서로 다른 주제 3개 이상에서 반복되는 문장만 뽑는다', () => {
    const answers = [
      { topic: 'Bar', answer: 'They are everywhere these days.\nOnly here.' },
      { topic: 'Movie', answer: 'They are everywhere these days.' },
      { topic: 'Shopping', answer: 'They are everywhere these days.' },
      { topic: 'Bank', answer: 'Two topics only.' },
      { topic: 'Hotel', answer: 'Two topics only.' },
    ]
    const out = findPatterns(answers)
    expect(out).toEqual([{ text: 'They are everywhere these days.', topicCount: 3, occurrences: 3 }])
  })

  it('12자 이하 짧은 줄은 패턴으로 보지 않는다', () => {
    const answers = [
      { topic: 'A', answer: 'Thanks.' },
      { topic: 'B', answer: 'Thanks.' },
      { topic: 'C', answer: 'Thanks.' },
    ]
    expect(findPatterns(answers)).toEqual([])
  })
})
