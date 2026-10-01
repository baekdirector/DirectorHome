import { Link } from 'react-router-dom'
import { CheckCircleIcon, ChevronRightIcon, ClockIcon } from './icons'
import type { HomeworkRecord } from '../lib/db'
import { formatDueDate, homeworkState } from '../lib/homework'

/** 숙제에 실제로 낼 수 있는 단어가 있는지. 단어장이 지워졌거나 비면 풀 수 없다. */
export function homeworkWordCount(hw: HomeworkRecord): number {
  return hw.wordSets.reduce((sum, w) => sum + w.count, 0)
}

export function HomeworkCard({ homework, today }: { homework: HomeworkRecord; today: string }) {
  const state = homeworkState(homework, today)
  const words = homeworkWordCount(homework)
  const titles = homework.wordSets.map((w) => w.title).join(' + ')
  const count = homework.questionCount === 0 ? words : Math.min(homework.questionCount, words)

  // 풀 단어가 없으면 들어가 봐야 빈 시험이 뜬다. 눌리지 않게 막고 이유를 보여준다.
  if (words === 0) {
    return (
      <div className="flex items-center gap-3.5 rounded-[20px] border border-border bg-surface p-4.5 opacity-60">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-surface-alt">
          <ClockIcon width={20} height={20} className="text-ink-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold">{formatDueDate(homework.dueDate)} 숙제</div>
          <div className="mt-0.5 text-[12.5px] text-ink-muted">단어가 없어요</div>
        </div>
      </div>
    )
  }

  if (state === 'today-done') {
    return (
      <Link
        to={`/quiz/homework/${homework.id}`}
        className="flex items-center gap-3.5 rounded-[20px] border border-success/40 bg-success-tint p-4.5"
      >
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/70">
          <CheckCircleIcon width={20} height={20} className="text-success" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold text-primary-dark">오늘 숙제 다 했어요!</div>
          <div className="mt-0.5 truncate text-[12.5px] text-primary-dark/80">{titles}</div>
        </div>
        <ChevronRightIcon width={18} height={18} className="text-primary-dark" />
      </Link>
    )
  }

  if (state === 'overdue') {
    return (
      <Link
        to={`/quiz/homework/${homework.id}`}
        className="flex items-center gap-3.5 rounded-[20px] border border-accent/40 bg-accent-tint p-4.5"
      >
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/70">
          <ClockIcon width={20} height={20} className="text-accent-dark" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold text-accent-dark">
            밀린 숙제 · {formatDueDate(homework.dueDate)}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-accent-dark/80">
            {titles} · {count}문제
          </div>
        </div>
        <ChevronRightIcon width={18} height={18} className="text-accent-dark" />
      </Link>
    )
  }

  return (
    <Link
      to={`/quiz/homework/${homework.id}`}
      className="flex items-center gap-3.5 rounded-[20px] bg-primary p-4.5 shadow-[0_8px_20px_-10px_rgba(20,79,76,0.55)]"
    >
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-white/20">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white">
          <path d="M8 5l11 7-11 7Z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-bold text-white">오늘의 숙제</div>
        <div className="mt-0.5 truncate text-[12.5px] text-white/85">
          {titles} · {count}문제
        </div>
      </div>
      <ChevronRightIcon width={18} height={18} className="text-white" />
    </Link>
  )
}
