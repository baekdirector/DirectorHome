import { useEffect, useState } from 'react'
import { getAppUsers, setAppUserPassword, type AppUser } from '../lib/auth'
import { CHILD_PROFILES, PROFILE_LABEL } from '../lib/profile'

/** 아이 계정 비밀번호 설정. admin 비밀번호는 가계부·OPIC과 같은 서비스 비밀번호라 여기서 바꾸지 않는다. */
export function AdminPasswords() {
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getAppUsers()
      .then(setUsers)
      .catch(() => setError('사용자 목록을 불러오지 못했어요.'))
  }, [])

  async function save(id: (typeof CHILD_PROFILES)[number]) {
    const password = (drafts[id] ?? '').trim()
    if (password.length < 4) {
      setError('비밀번호는 4자 이상으로 정해주세요.')
      setMessage('')
      return
    }
    setSaving(id)
    setError('')
    setMessage('')
    try {
      await setAppUserPassword(id, password)
      setDrafts((prev) => ({ ...prev, [id]: '' }))
      setMessage(`${PROFILE_LABEL[id]} 비밀번호를 바꿨어요.`)
      setUsers(await getAppUsers())
    } catch {
      setError('비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section>
      <h3 className="m-0 text-[15px] font-extrabold">사용자 비밀번호</h3>
      <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-ink-muted">
        아이가 입구에서 쓸 비밀번호예요. 부모님(admin) 비밀번호는 가계부·OPIC과 같은 서비스
        비밀번호라 배포 설정(DIRECTORHOME_PASSWORD)에서 바꿔요.
      </p>

      <div className="mt-2.5 flex flex-col gap-2">
        {CHILD_PROFILES.map((id) => {
          const user = users?.find((u) => u.id === id)
          return (
            <div key={id} className="rounded-2xl border border-border bg-surface p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold">{PROFILE_LABEL[id]}</span>
                <span className="text-[12px] text-ink-muted">({id})</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-bold ${
                    user?.hasPassword ? 'bg-success-tint text-success' : 'bg-warning-tint text-warning'
                  }`}
                >
                  {users === null ? '확인 중' : user?.hasPassword ? '설정됨' : '아직 없음'}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  value={drafts[id] ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [id]: e.target.value }))}
                  placeholder="새 비밀번호 (4자 이상)"
                  aria-label={`${PROFILE_LABEL[id]} 새 비밀번호`}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 text-[14px] outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => save(id)}
                  disabled={saving !== null}
                  className="flex-none rounded-xl bg-primary px-4 text-[14px] font-bold text-white disabled:opacity-40"
                >
                  {saving === id ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {message && <p className="m-0 mt-2 text-[12.5px] font-semibold text-success">{message}</p>}
      {error && <p className="m-0 mt-2 text-[12.5px] font-semibold text-error">{error}</p>}
    </section>
  )
}
