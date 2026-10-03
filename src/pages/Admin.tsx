import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AccessGate } from '../components/AccessGate'
import { ArrowLeftIcon, CheckCircleIcon, TrashIcon } from '../components/icons'
import { Loading } from '../components/Loading'
import { WordSetPicker } from '../components/WordSetPicker'
import {
  createHomework,
  deleteHomework,
  getHomework,
  getWordSets,
  type HomeworkRecord,
} from '../lib/db'
import {
  dayCount,
  formatDueDate,
  localDateString,
  nextDate,
  parseQuestionCount,
  shiftDate,
} from '../lib/homework'
import type { WordSetItem } from '../lib/wordSetsCache'

/** 목록에 보여줄 범위: 지난 2주 ~ 앞으로 4주. 전부 불러오면 시간이 갈수록 느려진다. */
const PAST_DAYS = 14
const FUTURE_DAYS = 28
// 배정은 "배정된 숙제" 목록이 보여주는 창 안에서만 받는다. 그보다 멀리 내면 만들어는
// 지는데 목록에 나타나지 않아 확인도 삭제도 할 수 없다(숙제 수정은 지우고 다시 내는 것뿐).
// 서버는 92일까지 받지만 그건 사고 방지용 상한이고, 화면은 더 좁게 잡는다.

export function Admin() {
  return (
    <AccessGate title="부모님 화면입니다" description="비밀번호를 입력하세요." confirmLabel="확인">
      <AdminBody />
    </AccessGate>
  )
}

function AdminBody() {
  const navigate = useNavigate()
  const today = useMemo(() => localDateString(), [])

  const [sets, setSets] = useState<WordSetItem[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [countText, setCountText] = useState('20')
  const [allWords, setAllWords] = useState(false)

  const [list, setList] = useState<HomeworkRecord[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try {
      const rows = await getHomework(shiftDate(today, -PAST_DAYS), shiftDate(today, FUTURE_DAYS))
      setList(rows)
    } catch {
      setError('숙제 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
      setList([])
    }
  }, [today])

  useEffect(() => {
    getWordSets()
      .then(setSets)
      .catch(() => setSets([]))
    void reload()
  }, [reload])

  const days = dayCount(fromDate, toDate)
  const latestAllowed = shiftDate(today, FUTURE_DAYS)
  const tooFar = toDate > latestAllowed
  const parsedCount = parseQuestionCount(countText)
  // 0은 서버에서 "전체"를 뜻한다.
  const questionCount = allWords ? 0 : parsedCount
  const selectedWordTotal = (sets ?? []).filter((w) => selected.has(w.id)).reduce((n, w) => n + w.count, 0)
  const canAssign = selected.size > 0 && days > 0 && !tooFar && !saving && questionCount !== null

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function assign() {
    if (!canAssign || questionCount === null) return
    setSaving(true)
    setError('')
    try {
      await createHomework({ fromDate, toDate, wordSetIds: [...selected], questionCount })
      // 날마다 다른 단어장을 내는 것이 주된 사용법이라, 배정하고 나면 다음 날로 넘어가고
      // 선택을 풀어 둔다. 체크 → 배정만 반복하면 일주일치를 다르게 낼 수 있다.
      const after = nextDate(toDate)
      setFromDate(after)
      setToDate(after)
      setSelected(new Set())
      await reload()
    } catch {
      setError('숙제를 내지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: number) {
    setList((prev) => prev?.filter((h) => h.id !== id) ?? null)
    try {
      await deleteHomework(id)
    } catch {
      setError('숙제를 지우지 못했어요. 목록을 새로 불러옵니다.')
      await reload()
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <div className="flex flex-none items-center gap-3 px-[18px] pt-[18px]">
        <button
          type="button"
          aria-label="홈으로"
          onClick={() => navigate('/')}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-ink"
        >
          <ArrowLeftIcon />
        </button>
        <h2 className="m-0 text-[17px] font-bold">숙제 관리</h2>
      </div>

      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 overflow-y-auto px-[22px] py-5">
        <section>
          <h3 className="m-0 text-[15px] font-extrabold">숙제 내기</h3>

          <p className="m-0 mt-3 text-[13px] font-bold text-ink-muted">
            단어장 고르기
            {selected.size > 0 && (
              <span className="ml-1.5 font-normal text-primary">{selected.size}개 선택</span>
            )}
          </p>
          {/* 단어장이 쌓이면 목록만으로 화면이 가득 차 기간·문제 수·배정 버튼이 한참 아래로
              밀린다. 매일 배정하는 화면이라 목록 안에서만 스크롤되게 높이를 묶는다. */}
          <div className="mt-1.5 max-h-[300px] overflow-y-auto">
            {sets === null ? (
              <Loading />
            ) : sets.length === 0 ? (
              <p className="m-0 py-4 text-center text-[13.5px] text-ink-muted">
                아직 단어장이 없어요. 먼저 단어장을 만들어주세요.
              </p>
            ) : (
              <WordSetPicker
                sets={sets}
                selected={selected}
                onToggle={toggle}
                renderMeta={(s) => (
                  <div className="mt-0.5 text-[12.5px] font-normal text-ink-muted">
                    단어 {s.count}개
                  </div>
                )}
              />
            )}
          </div>

          <p className="m-0 mt-4 text-[13px] font-bold text-ink-muted">기간</p>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="date"
              aria-label="시작일"
              value={fromDate}
              max={latestAllowed}
              onChange={(e) => {
                setFromDate(e.target.value)
                if (e.target.value > toDate) setToDate(e.target.value)
              }}
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-primary"
            />
            <span className="flex-none text-ink-muted">~</span>
            <input
              type="date"
              aria-label="종료일"
              value={toDate}
              min={fromDate}
              max={latestAllowed}
              onChange={(e) => setToDate(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-primary"
            />
          </div>

          <p className="m-0 mt-4 text-[13px] font-bold text-ink-muted">문제 수</p>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              aria-label="문제 수"
              value={allWords ? '' : countText}
              disabled={allWords}
              placeholder={allWords ? '전체' : '예: 50'}
              onChange={(e) => setCountText(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-primary disabled:bg-surface-alt"
            />
            <span className="text-[14px] text-ink-muted">문제</span>
            <button
              type="button"
              onClick={() => setAllWords((v) => !v)}
              aria-pressed={allWords}
              className={`h-10 flex-none rounded-xl px-3.5 text-[14px] font-semibold ${
                allWords ? 'bg-primary text-white' : 'border border-border bg-surface text-ink-muted'
              }`}
            >
              전체
            </button>
          </div>
          <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
            {selected.size > 0 && `고른 단어 ${selectedWordTotal}개 중에서 `}
            날마다 새로 무작위로 뽑아요. 여러 날을 한꺼번에 내도 날마다 다른 단어가 나와요.
          </p>
          {!allWords && parsedCount === null && (
            <p className="m-0 mt-1 text-[12.5px] font-semibold text-error">
              문제 수를 1~1000 사이 숫자로 입력해 주세요.
            </p>
          )}

          {days === 0 && (
            <p className="m-0 mt-2 text-[12.5px] font-semibold text-error">
              종료일이 시작일보다 빨라요.
            </p>
          )}
          {tooFar && (
            <p className="m-0 mt-2 text-[12.5px] font-semibold text-error">
              {formatDueDate(latestAllowed)}까지만 낼 수 있어요. 그 뒤 날짜는 아래 목록에서
              확인하거나 지울 수 없어요.
            </p>
          )}

          <button
            type="button"
            disabled={!canAssign}
            onClick={assign}
            className="mt-4 w-full rounded-2xl bg-primary p-[15px] text-[15.5px] font-bold text-white disabled:opacity-40"
          >
            {saving ? '내는 중...' : selected.size === 0 ? '단어장을 골라주세요' : `${days}일치 숙제 내기`}
          </button>
          {error && <p className="m-0 mt-2 text-[12.5px] font-semibold text-error">{error}</p>}
        </section>

        <section>
          <h3 className="m-0 text-[15px] font-extrabold">배정된 숙제</h3>
          <p className="m-0 mt-1 text-[12.5px] text-ink-muted">
            지난 2주와 앞으로 4주를 보여줘요 · <span className="font-semibold">테스트</span>는 문제가 어떻게
            나오는지 미리 풀어보는 용도예요(기록에 남지 않아요)
          </p>
          <div className="mt-2.5 flex flex-col gap-2">
            {list === null ? (
              <Loading />
            ) : list.length === 0 ? (
              <p className="m-0 py-6 text-center text-[13.5px] text-ink-muted">
                아직 배정한 숙제가 없어요.
              </p>
            ) : (
              list.map((hw) => (
                <div
                  key={hw.id}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[14px] font-bold">{formatDueDate(hw.dueDate)}</span>
                      {hw.completedAt !== null ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-[11.5px] font-bold text-success">
                          <CheckCircleIcon width={12} height={12} />
                          완료
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${
                            hw.attemptedAt !== null
                              ? 'bg-accent-tint text-accent-dark'
                              : 'bg-surface-alt text-ink-muted'
                          }`}
                        >
                          {hw.attemptedAt !== null
                            ? `도전 중 ${hw.attemptCorrect}/${hw.attemptTotal}`
                            : '안 함'}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 break-words text-[12.5px] text-ink-muted">
                      {hw.wordSets.length === 0
                        ? '단어장이 없어요'
                        : hw.wordSets.map((w) => w.title).join(' + ')}
                      {' · '}
                      {hw.questionCount === 0 ? '전체' : `${hw.questionCount}문제`}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`${formatDueDate(hw.dueDate)} 숙제 모의 테스트`}
                    onClick={() => navigate(`/quiz/homework/${hw.id}?practice=1`)}
                    className="h-9 flex-none rounded-[10px] border border-border bg-surface px-2.5 text-[12.5px] font-bold text-primary"
                  >
                    테스트
                  </button>
                  <button
                    type="button"
                    aria-label={`${formatDueDate(hw.dueDate)} 숙제 삭제`}
                    onClick={() => remove(hw.id)}
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-surface-alt text-error"
                  >
                    <TrashIcon width={15} height={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
