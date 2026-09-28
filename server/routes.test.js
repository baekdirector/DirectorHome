import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import { router } from './routes.js'

describe('POST /expense/verify-password', () => {
  let server
  let baseUrl

  beforeAll(() => {
    process.env.HOUSEHOLD_PASSWORD = 'admin/017hand!'
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
      body: JSON.stringify({ password: 'admin/017hand!' }),
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
