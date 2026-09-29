import { useEffect, useState } from 'react'
import { formatWon, parseWonInput } from '../lib/household'

/** 가계부 금액 항목을 누르면 뜨는 수정 팝업. 확인을 눌러야 저장된다. */
export function EditEntryModal({
  open,
  categoryName,
  initialAmount,
  saving,
  onConfirm,
  onCancel,
}: {
  open: boolean
  categoryName: string
  initialAmount: number
  saving: boolean
  onConfirm: (amount: number) => void
  onCancel: () => void
}) {
  const [raw, setRaw] = useState('')

  useEffect(() => {
    if (open) setRaw(initialAmount > 0 ? formatWon(initialAmount) : '')
  }, [open, initialAmount])

  if (!open) return null

  return (
    <div
      role="presentation"
      onClick={onCancel}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-5 pb-8 sm:items-center sm:pb-0"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${categoryName} 금액 수정`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[360px] rounded-[22px] bg-white p-5 shadow-lg"
      >
        <h3 className="m-0 font-hh-serif text-[17px] font-bold text-hh-ink">{categoryName}</h3>
        <div className="mt-4 flex items-center gap-1 rounded-[14px] border border-hh-border bg-hh-bg px-4 py-3">
          <input
            autoFocus
            inputMode="numeric"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onFocus={(e) => e.target.select()}
            placeholder="0"
            className="min-w-0 flex-1 bg-transparent text-right text-[22px] font-bold tabular-nums text-hh-ink outline-none"
          />
          <span className="text-[15px] text-hh-ink-muted">원</span>
        </div>
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-hh-border bg-white p-3 text-[14px] font-semibold text-hh-ink"
          >
            취소
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onConfirm(parseWonInput(raw))}
            className="flex-1 rounded-2xl bg-hh-pine p-3 text-[14px] font-bold text-white disabled:opacity-50"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
