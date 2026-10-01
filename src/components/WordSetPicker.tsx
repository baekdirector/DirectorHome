import type { ReactNode } from 'react'
import { CheckIcon } from './icons'
import type { WordSetItem } from '../lib/wordSetsCache'

/**
 * 단어장을 여러 개 고르는 목록. 테스트 시작 화면과 숙제 관리 화면이 같이 쓴다.
 * 체크 동작과 생김새만 공유하고, 제목 아래 설명 줄은 쓰는 쪽이 정한다 —
 * 테스트 화면은 날짜·응시 횟수·이어풀기를 보여주고 숙제 화면은 단어 수만 보여준다.
 */
export function WordSetPicker({
  sets,
  selected,
  onToggle,
  renderMeta,
}: {
  sets: WordSetItem[]
  selected: Set<number>
  onToggle: (id: number) => void
  renderMeta: (set: WordSetItem) => ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {sets.map((s) => {
        const checked = selected.has(s.id)
        return (
          <button
            key={s.id}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onToggle(s.id)}
            className={`m-0 flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left ${
              checked ? 'border-primary bg-primary-tint/40' : 'border-border bg-surface'
            }`}
          >
            <div
              className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg border-2 ${
                checked ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-transparent'
              }`}
            >
              <CheckIcon width={16} height={16} strokeWidth={3} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-bold">{s.title}</div>
              {renderMeta(s)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
