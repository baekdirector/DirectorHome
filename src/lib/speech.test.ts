import { describe, expect, it } from 'vitest'
import { pickVoice, speakableText, type VoiceLike } from './speech'

const v = (name: string, lang = 'en-US'): VoiceLike => ({ name, lang })

describe('speakableText', () => {
  it('문장 끝의 한글 뜻 괄호를 읽지 않는다', () => {
    expect(speakableText('Many bars are on busy streets with a lot of foot traffic. (유동인구)')).toBe(
      'Many bars are on busy streets with a lot of foot traffic.',
    )
  })

  it('줄 맨 앞의 분류 라벨도 읽지 않는다', () => {
    expect(speakableText('(종류) What kinds of phones are available?')).toBe(
      'What kinds of phones are available?',
    )
  })

  it('이중 괄호 오타가 있어도 본문만 남긴다', () => {
    expect(speakableText('I grab some drinks((술을 조금 마시다) with my friends.')).toBe(
      'I grab some drinks with my friends.',
    )
  })

  it('문장 중간의 뜻 칩을 빼고 앞뒤를 자연스럽게 잇는다', () => {
    expect(speakableText('an ongoing diplomatic(디플로메틱,외교) issue')).toBe(
      'an ongoing diplomatic issue',
    )
  })

  it('괄호가 없으면 그대로 둔다', () => {
    expect(speakableText('There are tons of bars in Korea.')).toBe('There are tons of bars in Korea.')
  })

  it('한글이 없는 괄호는 읽는다(영어 부연이므로)', () => {
    expect(speakableText('It is a pub (a nice one) near my house.')).toBe(
      'It is a pub (a nice one) near my house.',
    )
  })

  it('읽을 것이 없으면 빈 문자열', () => {
    expect(speakableText('(사교모임)')).toBe('')
  })
})

describe('pickVoice', () => {
  it('이름으로 남성 음성을 고른다', () => {
    const voices = [v('Microsoft Zira - English (United States)'), v('Microsoft David - English (United States)')]
    expect(pickVoice(voices, 'male')?.name).toContain('David')
  })

  it('이름으로 여성 음성을 고른다', () => {
    const voices = [v('Microsoft David - English (United States)'), v('Microsoft Zira - English (United States)')]
    expect(pickVoice(voices, 'female')?.name).toContain('Zira')
  })

  it('iOS 계열 이름도 성별을 가린다', () => {
    const voices = [v('Samantha'), v('Aaron')]
    expect(pickVoice(voices, 'female')?.name).toBe('Samantha')
    expect(pickVoice(voices, 'male')?.name).toBe('Aaron')
  })

  it('영어 음성만 후보로 삼는다', () => {
    const voices = [v('Yuna', 'ko-KR'), v('Google US English')]
    expect(pickVoice(voices, 'female')?.lang).toBe('en-US')
  })

  it('en-US를 다른 영어 방언보다 먼저 고른다', () => {
    const voices = [v('Daniel', 'en-GB'), v('Alex', 'en-US')]
    expect(pickVoice(voices, 'male')?.lang).toBe('en-US')
  })

  it('성별을 가릴 수 없으면 아무 영어 음성이라도 준다', () => {
    const voices = [v('Voice 1'), v('Voice 2')]
    expect(pickVoice(voices, 'male')).not.toBeNull()
  })

  it('영어 음성이 하나도 없으면 null', () => {
    expect(pickVoice([v('Yuna', 'ko-KR')], 'male')).toBeNull()
  })

  it('목록이 비면 null', () => {
    expect(pickVoice([], 'female')).toBeNull()
  })
})
