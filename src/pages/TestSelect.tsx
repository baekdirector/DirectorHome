import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '../components/icons'
import { Loading } from '../components/Loading'
import { WordSetPicker } from '../components/WordSetPicker'
import { getWordSetAttemptCounts, getWordSets } from '../lib/db'
import { loadWordSetsCache, saveWordSetsCache, type WordSetItem } from '../lib/wordSetsCache'
import { formatDate } from '../lib/quiz'
import { peekQuizProgress } from '../lib/quizProgress'

type SortOrder = 'newest' | 'oldest'

const SORT_KEY = 'junsvoca_testselect_sort'

function loadSort(): SortOrder {
  try {
    return localStorage.getItem(SORT_KEY) === 'oldest' ? 'oldest' : 'newest'
  } catch {
    return 'newest'
  }
}

/** 테스트할 단어장을 (여러 개도) 고르는 화면. 고르면 문제 수/유형을 정하는 테스트 설정 화면으로 간다. */
export function TestSelect() {
  const navigate = useNavigate()
  const [sets, setSets] = useState<WordSetItem[] | null>(loadWordSetsCache)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sort, setSort] = useState<SortOrder>(loadSort)
  const [attemptCounts, setAttemptCounts] = useState<Map<number, number>>(new Map())

  useEffect(() => {
    getWordSets()
      .then((fresh) => {
        setSets(fresh)
        saveWordSetsCache(fresh)
        // 삭제되었거나 사라진 단어장은 선택에서 뺀다
        setSelected((prev) => new Set([...prev].filter((id) => fresh.some((s) => s.id === id))))
      })
      .catch(() => setSets((prev) => prev ?? []))
    getWordSetAttemptCounts()
      .then((rows) => setAttemptCounts(new Map(rows.map((r) => [r.wordSetId, r.count]))))
      .catch(() => {})
  }, [])

  const allSelected = sets !== null && sets.length > 0 && sets.every((s) => selected.has(s.id))
  const sortedSets = useMemo(() => {
    const direction = sort === 'newest' ? -1 : 1
    return [...(sets ?? [])].sort((a, b) => direction * (a.createdAt - b.createdAt || a.id - b.id))
  }, [sets, sort])
  const selectedSets = useMemo(() => sets?.filter((s) => selected.has(s.id)) ?? [], [sets, selected])
  const selectedWordCount = selectedSets.reduce((sum, s) => sum + s.count, 0)

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function changeSort(next: SortOrder) {
    setSort(next)
    try {
      localStorage.setItem(SORT_KEY, next)
    } catch {
      // 정렬 기억은 편의 기능이라 실패해도 무시한다.
    }
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(sets?.map((s) => s.id)))
  }

  function start() {
    // 오래된 단어장부터 (단어장 순서대로 출제할 때 Unit1 → Unit2 → ... 순서가 되도록)
    const ids = [...selectedSets].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id).map((s) => s.id)
    navigate(ids.length === 1 ? `/quiz/${ids[0]}` : `/test/start?sets=${ids.join(',')}`)
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-bg">
      <div className="flex-none px-[18px] pt-[18px]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="홈으로"
            onClick={() => navigate('/')}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-ink"
          >
            <ArrowLeftIcon />
          </button>
          <h2 className="m-0 text-[17px] font-bold">테스트할 단어장 고르기</h2>
        </div>
      </div>

      {sets !== null && sets.length > 0 && (
        <div className="flex-none px-[22px] pb-2 pt-3">
          <p className="m-0 text-[13px] text-ink-muted">여러 개를 골라 한 번에 테스트할 수 있어요.</p>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[13.5px] text-ink-muted">
              <b className="text-ink">{selected.size}</b> / {sets.length}개 선택
            </span>
            <div className="flex flex-none items-center gap-1.5">
              <div role="radiogroup" aria-label="정렬" className="flex rounded-[10px] bg-surface-alt p-0.5">
                {(
                  [
                    ['newest', '최신순'],
                    ['oldest', '오래된순'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={sort === value}
                    onClick={() => changeSort(value)}
                    className={`rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-bold ${
                      sort === value ? 'bg-surface text-primary shadow-sm' : 'text-ink-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={toggleAll}
                className="rounded-[10px] bg-surface-alt px-3 py-1.5 text-[12.5px] font-bold text-primary"
              >
                {allSelected ? '전체 해제' : '전체 선택'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-[22px] pb-4">
        {sets === null ? (
          <Loading />
        ) : sets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="m-0 text-[14px] text-ink-muted">아직 단어장이 없어요. 먼저 단어를 입력해서 만들어주세요.</p>
            <Link to="/input" className="rounded-2xl bg-primary px-6 py-3 text-[14px] font-bold text-white">
              단어 입력하러 가기
            </Link>
          </div>
        ) : (
          <WordSetPicker
            sets={sortedSets}
            selected={selected}
            onToggle={toggle}
            renderMeta={(s) => {
              const progress = peekQuizProgress(String(s.id))
              const attempts = attemptCounts.get(s.id) ?? 0
              return (
                <>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] font-normal text-ink-muted">
                    <span>단어 {s.count}개</span>
                    <span>· {formatDate(s.createdAt)}</span>
                    {attempts > 0 && <span>· 테스트 {attempts}회 완료</span>}
                  </div>
                  {progress && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-[11.5px] font-bold text-accent-dark">
                      이어서 풀 수 있어요 · {progress.answered}/{progress.total}
                    </div>
                  )}
                </>
              )
            }}
          />
        )}
      </div>

      {sets !== null && sets.length > 0 && (
        <div className="flex-none border-t border-border bg-surface px-[22px] pb-5 pt-3.5">
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={start}
            className="w-full rounded-2xl bg-primary p-[15px] text-center text-[15.5px] font-bold text-white disabled:opacity-40"
          >
            {selected.size === 0
              ? '단어장을 골라주세요'
              : `${selected.size}개 단어장 (단어 ${selectedWordCount}개) 테스트 설정하기`}
          </button>
        </div>
      )}
    </div>
  )
}
