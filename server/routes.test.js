import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import { router } from './routes.js'

describe('POST /expense/verify-password', () => {
  let server
  let baseUrl

  beforeAll(() => {
    process.env.HOUSEHOLD_PASSWORD = 'test-only-password'
    const app = express()
    app.use(express.json())
    app.use('/api', router)
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  it('올바른 비밀번호면 ok: true', async () => {
    const res = await fetch(`${baseUrl}/expense/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-only-password' }),
    })
    expect(await res.json()).toEqual({ ok: true })
  })

  it('틀린 비밀번호면 ok: false (에러 아님)', async () => {
    const res = await fetch(`${baseUrl}/expense/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: false })
  })
})

// 숙제 라우트는 실제 DB가 있어야 의미가 있다. DATABASE_URL이 없는 환경(CI 등)에서는 건너뛴다.
// 여기서 고정하려는 것은 소리 없이 깨지는 두 가지다 — 완료의 멱등성과, DATE를 문자열로
// 돌려주는 타입 파서. 둘 다 한 줄이 사라져도 화면에서는 한참 뒤에야 티가 난다.
const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('숙제 라우트', () => {
  let server
  let baseUrl
  let wordSetId
  const made = []

  const call = async (path, init) => {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
    return { status: res.status, body: res.status === 204 ? null : await res.json() }
  }

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use('/api', router)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api`
        resolve()
      })
    })
    const { body } = await call('/wordsets')
    wordSetId = body[0].id
  })

  afterAll(async () => {
    for (const id of made) await call(`/homework/${id}`, { method: 'DELETE' })
    await new Promise((resolve) => server.close(resolve))
  })

  // 테스트끼리 섞이지 않게 실제 달력과 멀리 떨어진 날짜를 쓴다.
  const BASE_DATE = '2031-03-01'

  it('기간을 날짜별 행으로 펼치고 달력 날짜 문자열로 돌려준다', async () => {
    const { body } = await call('/homework', {
      method: 'POST',
      body: JSON.stringify({
        fromDate: BASE_DATE,
        toDate: '2031-03-04',
        wordSetIds: [wordSetId],
        questionCount: 20,
      }),
    })
    made.push(...body.map((h) => h.id))
    expect(body).toHaveLength(4)
    // pg가 DATE를 Date 객체로 파싱하면 시간대만큼 하루가 밀린다. 문자열이어야 한다.
    expect(body.map((h) => h.dueDate)).toEqual([
      '2031-03-01',
      '2031-03-02',
      '2031-03-03',
      '2031-03-04',
    ])
  })

  it('이미 끝낸 숙제를 다시 완료해도 처음 기록이 남는다', async () => {
    const { body: created } = await call('/homework', {
      method: 'POST',
      body: JSON.stringify({
        fromDate: '2031-03-10',
        toDate: '2031-03-10',
        wordSetIds: [wordSetId],
        questionCount: 0,
      }),
    })
    const id = created[0].id
    made.push(id)

    await call(`/homework/${id}/complete`, { method: 'POST', body: JSON.stringify({ groupId: 'first' }) })
    const { body: afterFirst } = await call(`/homework/${id}`)
    await call(`/homework/${id}/complete`, { method: 'POST', body: JSON.stringify({ groupId: 'second' }) })
    const { body: afterSecond } = await call(`/homework/${id}`)

    expect(afterSecond.completedGroupId).toBe('first')
    expect(afterSecond.completedAt).toBe(afterFirst.completedAt)
  })

  it('없는 단어장 id는 조용히 빠진다', async () => {
    const { body: created } = await call('/homework', {
      method: 'POST',
      body: JSON.stringify({
        fromDate: '2031-03-20',
        toDate: '2031-03-20',
        wordSetIds: [wordSetId, 999999],
        questionCount: 0,
      }),
    })
    made.push(created[0].id)
    expect(created[0].wordSetIds).toEqual([wordSetId, 999999])
    expect(created[0].wordSets.map((w) => w.id)).toEqual([wordSetId])
  })

  it('오늘 숙제는 끝냈어도, 밀린 숙제는 안 끝낸 것만 돌려준다', async () => {
    const { body } = await call('/homework/pending?today=2031-03-04')
    expect(body.today.every((h) => h.dueDate === '2031-03-04')).toBe(true)
    expect(body.overdue.every((h) => h.dueDate < '2031-03-04')).toBe(true)
    expect(body.overdue.every((h) => h.completedAt === null)).toBe(true)
  })
})
