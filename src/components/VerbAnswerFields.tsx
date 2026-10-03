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
 * 채점 뒤에는 틀린 칸만 빨갛게 표시하고, revealAnswer가 true일 때만 그 아래에 정답을 보여준다.
 */
export function VerbAnswerFields({
  value,
  onChange,
  onSubmit,
  result,
  correct,
  revealAnswer,
  disabled,
}: {
  value: VerbAnswer
  onChange: (next: VerbAnswer) => void
  onSubmit: () => void
  /** 채점 전에는 null. */
  result: VerbResult | null
  /** 정답 세 형태. 채점 뒤 틀린 칸 아래에 보여준다. */
  correct: { term: string; past: string; participle: string }
  /** 틀린 칸 아래에 정답을 적을지. "모르겠어요"로 넘긴 문항에서는 false라 빨간 테두리만 남는다. */
  revealAnswer: boolean
  disabled: boolean
}) {
  const second = useRef<HTMLInputElement>(null)
  const third = useRef<HTMLInputElement>(null)
  const refs = [null, second, third]

  const answerOf = (key: keyof VerbAnswer) =>
    key === 'present' ? correct.term : key === 'past' ? correct.past : correct.participle

  return (
    <div className="flex flex-col gap-3">
      {LABELS.map(({ key, label }, i) => {
        // 현재형은 문제로 주어지는 값이라 고칠 수 없다.
        const fixed = key === 'present'
        const wrong = !fixed && result ? !result[key] : false
        return (
          <div key={key} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`verb-${key}`} className="text-[13px] font-semibold text-ink-muted">
              {label}
            </label>
            <input
              id={`verb-${key}`}
              ref={refs[i]}
              value={fixed ? correct.term : value[key]}
              readOnly={fixed}
              tabIndex={fixed ? -1 : undefined}
              disabled={disabled}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (i === 1) third.current?.focus()
                else if (i === 2) onSubmit()
              }}
              className={`w-full min-w-0 rounded-xl border px-3 py-2.5 font-display text-[19px] outline-none ${
                fixed ? '' : 'bg-surface'
              } ${
                fixed
                  ? 'border-border bg-surface-alt text-ink-muted'
                  : wrong
                    ? 'border-2 border-error'
                    : 'border-border focus:border-primary'
              }`}
            />
            {wrong && revealAnswer && (
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
