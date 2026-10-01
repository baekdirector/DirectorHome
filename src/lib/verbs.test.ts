import { describe, expect, it } from 'vitest'
import {
  checkVerbAnswer,
  joinVerbAnswer,
  joinVerbForms,
  parseVerbLine,
  parseVerbsDetailed,
  splitVerbAnswer,
  verbPattern,
} from './verbs'

describe('parseVerbLine', () => {
  it('번호 현재 과거 과거분사 뜻 을 읽는다', () => {
    expect(parseVerbLine('90 come came come 오다')).toEqual({
      term: 'come',
      past: 'came',
      participle: 'come',
      meaning: '오다',
    })
  })

  it('번호가 없어도 읽는다', () => {
    expect(parseVerbLine('come came come 오다')).toEqual({
      term: 'come',
      past: 'came',
      participle: 'come',
      meaning: '오다',
    })
  })

  it('뜻에 띄어쓰기와 쉼표가 있어도 끝까지 뜻으로 본다', () => {
    expect(parseVerbLine('16 lay laid laid 눕히다, 놓다')).toEqual({
      term: 'lay',
      past: 'laid',
      participle: 'laid',
      meaning: '눕히다, 놓다',
    })
    expect(parseVerbLine('80 cost cost cost 비용이 들다')?.meaning).toBe('비용이 들다')
  })

  it('대체형은 슬래시가 붙은 한 토큰으로 읽는다', () => {
    expect(parseVerbLine('41 be was/were been 이다, 있다')).toEqual({
      term: 'be',
      past: 'was/were',
      participle: 'been',
      meaning: '이다, 있다',
    })
  })

  it('탭으로 나뉜 줄도 읽는다', () => {
    expect(parseVerbLine('1\tbleed\tbled\tbled\t피를 흘리다')).toEqual({
      term: 'bleed',
      past: 'bled',
      participle: 'bled',
      meaning: '피를 흘리다',
    })
  })

  it('토큰이 모자라면 null', () => {
    expect(parseVerbLine('come came')).toBeNull()
    expect(parseVerbLine('come came come')).toBeNull() // 뜻이 없다
    expect(parseVerbLine('')).toBeNull()
  })
})

describe('parseVerbsDetailed', () => {
  it('읽은 줄과 못 읽은 줄을 나눈다', () => {
    const out = parseVerbsDetailed('1 come came come 오다\n이건 못 읽는 줄\n2 go went gone 가다')
    expect(out.verbs.map((v) => v.term)).toEqual(['come', 'go'])
    expect(out.skipped).toEqual(['이건 못 읽는 줄'])
  })

  it('같은 현재형이 두 번 나오면 뒤엣것을 버린다', () => {
    const out = parseVerbsDetailed('get got got 얻다\nget got got/gotten 얻다')
    expect(out.verbs).toHaveLength(1)
    expect(out.skipped).toHaveLength(1)
  })
})

describe('verbPattern', () => {
  it('세 형태의 같고 다름으로 유형을 가른다', () => {
    expect(verbPattern({ term: 'bring', past: 'brought', participle: 'brought' })).toBe('A-B-B')
    expect(verbPattern({ term: 'go', past: 'went', participle: 'gone' })).toBe('A-B-C')
    expect(verbPattern({ term: 'cut', past: 'cut', participle: 'cut' })).toBe('A-A-A')
    expect(verbPattern({ term: 'come', past: 'came', participle: 'come' })).toBe('A-B-A')
    expect(verbPattern({ term: 'beat', past: 'beat', participle: 'beaten' })).toBe('A-A-B')
  })

  it('대체형이 있으면 원형과 다른 것으로 본다', () => {
    // get-got-got 은 A-B-B, get-got-got/gotten 은 과거분사가 달라 A-B-C
    expect(verbPattern({ term: 'get', past: 'got', participle: 'got' })).toBe('A-B-B')
    expect(verbPattern({ term: 'get', past: 'got', participle: 'got/gotten' })).toBe('A-B-C')
  })

  it('대소문자 차이는 무시한다', () => {
    expect(verbPattern({ term: 'Cut', past: 'cut', participle: 'CUT' })).toBe('A-A-A')
  })
})

describe('checkVerbAnswer', () => {
  const come = { term: 'come', past: 'came', participle: 'come' }

  it('세 칸이 모두 맞으면 all', () => {
    expect(checkVerbAnswer(come, { present: 'come', past: 'came', participle: 'come' })).toEqual({
      present: true,
      past: true,
      participle: true,
      all: true,
    })
  })

  it('한 칸만 틀리면 그 칸만 false이고 all은 false', () => {
    expect(checkVerbAnswer(come, { present: 'come', past: 'come', participle: 'come' })).toEqual({
      present: true,
      past: false,
      participle: true,
      all: false,
    })
  })

  it('대소문자와 앞뒤 공백은 무시한다', () => {
    expect(checkVerbAnswer(come, { present: '  COME ', past: 'Came', participle: 'come' }).all).toBe(
      true,
    )
  })

  it('빈 칸은 오답', () => {
    const r = checkVerbAnswer(come, { present: 'come', past: '', participle: 'come' })
    expect(r.past).toBe(false)
    expect(r.all).toBe(false)
  })

  it('대체형은 둘 중 하나만 맞아도 정답', () => {
    const get = { term: 'get', past: 'got', participle: 'got/gotten' }
    expect(checkVerbAnswer(get, { present: 'get', past: 'got', participle: 'got' }).all).toBe(true)
    expect(checkVerbAnswer(get, { present: 'get', past: 'got', participle: 'gotten' }).all).toBe(true)
    expect(checkVerbAnswer(get, { present: 'get', past: 'got', participle: 'got/gotten' }).all).toBe(
      true,
    )
    expect(checkVerbAnswer(get, { present: 'get', past: 'got', participle: 'getted' }).all).toBe(false)
  })

  it('be의 과거 was/were도 둘 다 받는다', () => {
    const be = { term: 'be', past: 'was/were', participle: 'been' }
    expect(checkVerbAnswer(be, { present: 'be', past: 'was', participle: 'been' }).all).toBe(true)
    expect(checkVerbAnswer(be, { present: 'be', past: 'were', participle: 'been' }).all).toBe(true)
  })
})

describe('joinVerbForms / joinVerbAnswer', () => {
  it('파이프로 잇는다 (대체형의 슬래시와 충돌하지 않게)', () => {
    expect(joinVerbForms({ term: 'come', past: 'came', participle: 'come' })).toBe('come | came | come')
    expect(joinVerbForms({ term: 'get', past: 'got', participle: 'got/gotten' })).toBe(
      'get | got | got/gotten',
    )
  })

  it('입력한 세 칸도 같은 방식으로 잇는다', () => {
    expect(joinVerbAnswer({ present: 'come', past: '', participle: 'comed' })).toBe('come |  | comed')
  })
})

describe('splitVerbAnswer', () => {
  it('joinVerbAnswer로 합친 답을 그대로 되돌린다', () => {
    const answer = { present: 'come', past: 'came', participle: 'come' }
    expect(splitVerbAnswer(joinVerbAnswer(answer))).toEqual(answer)
  })

  it('빈 칸이 섞여 있어도 자리를 지켜 되돌린다', () => {
    expect(splitVerbAnswer(joinVerbAnswer({ present: '', past: 'came', participle: '' }))).toEqual({
      present: '',
      past: 'came',
      participle: '',
    })
  })

  it('모르겠어요로 넘겨 빈 문자열이 저장된 경우 세 칸 모두 빈 칸이 된다', () => {
    expect(splitVerbAnswer('')).toEqual({ present: '', past: '', participle: '' })
  })
})
