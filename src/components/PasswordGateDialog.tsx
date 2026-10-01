import { useState } from 'react'

/**
 * 브라우저 기본 prompt() 대신 쓰는 비밀번호 팝업.
 * 기본 문구는 가계부·OPIC 진입용이고, 단어장을 바꾸는 것처럼 다른 맥락에서는
 * 문구만 바꿔 같은 팝업을 쓴다.
 */
export function PasswordGateDialog({
  verify,
  onSuccess,
  onCancel,
  title = '가계부 비밀번호',
  description = '가족만 볼 수 있는 공간이에요.',
  confirmLabel = '입장하기',
}: {
  verify: (password: string) => Promise<{ ok: boolean }>
  onSuccess: () => void
  onCancel: () => void
  title?: string
  description?: string
  confirmLabel?: string
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function submit() {
    if (checking || password === '') return
    setChecking(true)
    setError(null)
    try {
      const { ok } = await verify(password)
      if (ok) onSuccess()
      else setError('비밀번호가 올바르지 않아요.')
    } catch {
      setError('확인 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div
      role="presentation"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-5 pb-8 sm:items-center sm:pb-0"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[360px] rounded-[22px] border-t-4 border-hh-gold bg-surface p-5 shadow-lg"
      >
        <h3 className="m-0 text-[16.5px] font-bold">{title}</h3>
        <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-muted">{description}</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="비밀번호"
          className="mt-4 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-[15px]"
        />
        {error && <p className="m-0 mt-2 text-[13px] text-error">{error}</p>}
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-border bg-surface p-3 text-[14px] font-semibold text-ink"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={checking || password === ''}
            className="flex-1 rounded-2xl bg-hh-pine p-3 text-[14px] font-bold text-white disabled:opacity-50"
          >
            {checking ? '확인 중...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
