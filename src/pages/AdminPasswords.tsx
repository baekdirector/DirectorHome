import { useEffect, useState } from 'react'
import { getAppUsers, setAppUserPassword, type AppUser } from '../lib/auth'
import { CHILD_PROFILES, PROFILE_LABEL } from '../lib/profile'

function changedLabel(updatedAt: number): string {
  const d = new Date(updatedAt)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

/** 아이 계정 비밀번호 설정. admin 비밀번호는 가계부·OPIC과 같은 서비스 비밀번호라 여기서 바꾸지 않는다. */
export function AdminPasswords() {
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
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
      setSavedId(null)
      return
    }
    setSaving(id)
    setError('')
    setSavedId(null)
    try {
      await setAppUserPassword(id, password)
      // 입력칸을 비우지 않는다. 방금 무엇으로 정했는지 "보기"로 확인하고 아이에게
      // 알려줄 수 있어야 한다(저장된 값은 해시라 나중에는 꺼내 볼 수 없다).
      setSavedId(id)
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
      <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
        저장된 비밀번호는 되돌려 볼 수 없게 보관돼요. 잊어버렸으면 여기서 새로 정하고 아이에게
        알려주시면 돼요. 정하는 동안에는 <b className="text-ink">보기</b>로 확인할 수 있어요.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {CHILD_PROFILES.map((id) => {
          const user = users?.find((u) => u.id === id)
          const visible = shown[id] ?? false
          return (
            <div key={id} className="rounded-2xl border border-border bg-surface p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold">{PROFILE_LABEL[id]}</span>
                <span className="text-[12px] text-ink-muted">({id})</span>
                <span
                  className={`ml-auto flex-none rounded-full px-2 py-0.5 text-[11.5px] font-bold ${
                    user?.hasPassword ? 'bg-success-tint text-success' : 'bg-warning-tint text-warning'
                  }`}
                >
                  {users === null ? '확인 중' : user?.hasPassword ? '설정됨' : '아직 없음'}
                </span>
              </div>

              {user?.updatedAt != null && (
                <div className="mt-1 text-[12px] text-ink-muted">
                  마지막 변경 {changedLabel(user.updatedAt)}
                </div>
              )}

              <div className="mt-2 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    type={visible ? 'text' : 'password'}
                    value={drafts[id] ?? ''}
                    onChange={(e) => {
                      setDrafts((prev) => ({ ...prev, [id]: e.target.value }))
                      setSavedId(null)
                    }}
                    placeholder="새 비밀번호 (4자 이상)"
                    aria-label={`${PROFILE_LABEL[id]} 새 비밀번호`}
                    className="w-full rounded-xl border border-border bg-bg py-2.5 pl-3 pr-[58px] text-[14px] outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShown((prev) => ({ ...prev, [id]: !visible }))}
                    aria-pressed={visible}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[12.5px] font-semibold text-ink-muted"
                  >
                    {visible ? '숨기기' : '보기'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => save(id)}
                  disabled={saving !== null}
                  className="flex-none rounded-xl bg-primary px-4 text-[14px] font-bold text-white disabled:opacity-40"
                >
                  {saving === id ? '저장 중...' : '저장'}
                </button>
              </div>

              {savedId === id && (
                <p className="m-0 mt-2 text-[12.5px] font-semibold text-success">
                  바꿨어요. 위 칸에 방금 정한 비밀번호가 그대로 있으니 "보기"로 확인하고 아이에게
                  알려주세요. 이 화면을 벗어나면 사라져요.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="m-0 mt-2 text-[12.5px] font-semibold text-error">{error}</p>}
    </section>
  )
}
