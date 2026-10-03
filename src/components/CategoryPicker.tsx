import { useState } from 'react'
import { createWordSetCategory, type WordSetCategory } from '../lib/db'

/** 드롭다운에서 "직접 입력"을 고르면 쓰는 값. 실제 분류 id와 겹치지 않게 음수로 둔다. */
const CUSTOM = -1
export const UNCATEGORIZED_LABEL = '미분류'

/**
 * 단어장 분류 고르기. 목록에서 고르거나 "직접 입력"으로 새 분류를 바로 만든다.
 * 새로 만든 분류는 서버에 저장한 뒤 곧바로 선택되고 목록에도 들어간다.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  onCategoryCreated,
  disabled = false,
}: {
  categories: WordSetCategory[]
  value: number | null
  onChange: (categoryId: number | null) => void
  /** 새 분류가 만들어졌을 때. 부모가 목록을 갱신한다. */
  onCategoryCreated: (category: WordSetCategory) => void
  disabled?: boolean
}) {
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function addCategory() {
    const name = draft.trim()
    if (name === '' || saving) return
    setSaving(true)
    setError('')
    try {
      const created = await createWordSetCategory(name)
      onCategoryCreated(created)
      onChange(created.id)
      setDraft('')
      setTyping(false)
    } catch {
      setError('분류를 만들지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        value={typing ? CUSTOM : (value ?? '')}
        disabled={disabled}
        aria-label="단어장 분류"
        onChange={(e) => {
          const raw = e.target.value
          if (raw === String(CUSTOM)) {
            setTyping(true)
            return
          }
          setTyping(false)
          setError('')
          onChange(raw === '' ? null : Number(raw))
        }}
        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-primary disabled:opacity-50"
      >
        <option value="">{UNCATEGORIZED_LABEL}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={CUSTOM}>+ 직접 입력...</option>
      </select>

      {typing && (
        <div className="flex gap-2">
          <input
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            placeholder="새 분류 이름 (예: Listening)"
            aria-label="새 분류 이름"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={addCategory}
            disabled={saving || draft.trim() === ''}
            className="flex-none rounded-xl bg-primary px-4 text-[14px] font-bold text-white disabled:opacity-40"
          >
            {saving ? '만드는 중...' : '추가'}
          </button>
          <button
            type="button"
            onClick={() => {
              setTyping(false)
              setDraft('')
              setError('')
            }}
            className="flex-none rounded-xl border border-border bg-surface px-3 text-[13.5px] font-semibold text-ink-muted"
          >
            취소
          </button>
        </div>
      )}

      {error && <p className="m-0 text-[12.5px] font-semibold text-error">{error}</p>}
    </div>
  )
}
