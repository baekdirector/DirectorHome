import { useRef } from 'react'
import type { VerbAnswer, VerbResult } from '../lib/verbs'

const LABELS: Array<{ key: keyof VerbAnswer; label: string }> = [
  { key: 'present', label: '현재형' },
  { key: 'past', label: '과거형' },
  { key: 'participle', label: '과거분사형' },
]

/**
 * 동사 3단변화 입력. 좁은 화면이 주 사용 환경이라 세 칸을 세로로 쌓는다.
 * 엔터로 다음 칸으로 가고, 마지막 칸에서 엔터를 누르면 제출된다(제출의 주 경로는
 * 기존 시험과 같은 "확인" 버튼이고 엔터는 보조다).
 * 채점 뒤에는 틀린 칸만 빨갛게 표시하고 그 아래에 정답을 보여준다.
 */
export function VerbAnswerFields({
  value,
  onChange,
  onSubmit,
  result,
  correct,
  disabled,
}: {
  value: VerbAnswer
  onChange: (next: VerbAnswer) => void
  onSubmit: () => void
  /** 채점 전에는 null. */
  result: VerbResult | null
  /** 정답 세 형태. 채점 뒤 틀린 칸 아래에 보여준다. */
  correct: { term: string; past: string; participle: string }
  disabled: boolean
}) {
  const first = useRef<HTMLInputElement>(null)
  const second = useRef<HTMLInputElement>(null)
  const third = useRef<HTMLInputElement>(null)
  const refs = [first, second, third]

  const answerOf = (key: keyof VerbAnswer) =>
    key === 'present' ? correct.term : key === 'past' ? correct.past : correct.participle

  return (
    <div className="flex flex-col gap-3">
      {LABELS.map(({ key, label }, i) => {
        const wrong = result ? !result[key] : false
        return (
          <div key={key} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`verb-${key}`} className="text-[13px] font-semibold text-ink-muted">
              {label}
            </label>
            <input
              id={`verb-${key}`}
              ref={refs[i]}
              value={value[key]}
              disabled={disabled}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (i < 2) refs[i + 1].current?.focus()
                else onSubmit()
              }}
              className={`w-full min-w-0 rounded-xl border bg-surface px-3 py-2.5 font-display text-[19px] outline-none ${
                wrong ? 'border-2 border-error' : 'border-border focus:border-primary'
              }`}
            />
            {wrong && (
              <span className="break-words text-[13px] font-semibold text-error">
                정답: {answerOf(key)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
