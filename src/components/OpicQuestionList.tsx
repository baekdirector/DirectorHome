import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { OpicProgressBar } from './OpicProgressBar'
import { OpicStatusChip } from './OpicStatusChip'
import type { OpicQuestionSummary, OpicTopic } from '../lib/opic'

/**
 * 주제 머리 + 세트 탭 + 문항 카드.
 * 좁은 화면에서는 주제 상세 화면 전체가 되고, 넓은 화면에서는 3단 중 가운데 단이 된다.
 */
export function OpicQuestionList({
  topic,
  questions,
  selectedId,
}: {
  topic: OpicTopic
  questions: OpicQuestionSummary[]
  selectedId?: number
}) {
  const sets = useMemo(() => {
    const seen: string[] = []
    for (const q of questions) {
      const label = q.setLabel ?? '기타'
      if (!seen.includes(label)) seen.push(label)
    }
    return seen
  }, [questions])

  // 주제가 바뀌면 이전 주제의 세트 선택이 남아 목록이 비어 보일 수 있다.
  const [set, setSet] = useState<string>('전체')
  useEffect(() => setSet('전체'), [topic.id])
  const shown = set === '전체' ? questions : questions.filter((q) => (q.setLabel ?? '기타') === set)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-[22px] font-bold tracking-tight lg:text-[26px]">{topic.name}</h1>
          <span className="flex-none text-[13px] text-[#B7791F]">
            {topic.stars > 0 ? '★'.repeat(topic.stars) + ' · ' : ''}
            {topic.total}문항
          </span>
        </div>
        <OpicProgressBar total={topic.total} done={topic.done} ok={topic.ok} weak={topic.weak} />
      </div>

      {sets.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {['전체', ...sets].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSet(s)}
              className={`h-8 rounded-lg px-3 text-[13px] font-semibold ${
                set === s ? 'bg-op-ink text-white' : 'border border-op-border bg-white text-op-ink-muted'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {shown.map((q) => (
          <Link
            key={q.id}
            to={`/opic/t/${topic.id}/q/${q.id}`}
            className={`flex flex-col gap-1.5 rounded-xl border bg-white p-3.5 text-op-ink no-underline ${
              q.id === selectedId ? 'border-2 border-op-accent' : 'border-op-border'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-bold text-op-accent">
                Q{q.seq}
                {q.level ? ` · ${q.level}` : ''}
                {q.importance > 0 ? ` ${'★'.repeat(q.importance)}` : ''}
              </span>
              <OpicStatusChip state={q.state} />
            </div>
            <span className="text-[15px] font-semibold">{q.titleKo}</span>
            {q.sharedQuestion && (
              <span className="text-[11px] text-op-ink-muted">
                다른 주제와 같은 질문 · {q.sourceRef}
              </span>
            )}
          </Link>
        ))}
        {shown.length === 0 && <p className="text-[14px] text-op-ink-muted">해당 세트에 문항이 없어요.</p>}
      </div>
    </div>
  )
}
