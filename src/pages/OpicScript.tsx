import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AccessGate } from '../components/AccessGate'
import { OpicNav } from '../components/OpicNav'
import { OpicQuestionList } from '../components/OpicQuestionList'
import { OpicScriptBody, type FontSize } from '../components/OpicScriptBody'
import { Loading } from '../components/Loading'
import { LoadError } from '../components/LoadError'
import { OpicNotFound, useTopicData } from './OpicTopic'
import {
  getPatterns,
  getQuestion,
  putStatus,
  OPIC_STATES,
  OPIC_STATE_LABEL,
  type OpicQuestion,
  type OpicState,
} from '../lib/opic'

const FONT_KEY = 'opic_font_size'
const SIZES: FontSize[] = ['sm', 'md', 'lg']

export function OpicScript() {
  return (
    <AccessGate>
      <OpicScriptContent />
    </AccessGate>
  )
}

function OpicScriptContent() {
  const { topicId, questionId } = useParams()
  const tid = Number(topicId)
  const qid = Number(questionId)
  const navigate = useNavigate()

  const { topic, questions, reload: reloadTopic } = useTopicData(tid)
  const [question, setQuestion] = useState<OpicQuestion | null>(null)
  const [patterns, setPatterns] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [size, setSize] = useState<FontSize>(() => {
    const saved = localStorage.getItem(FONT_KEY)
    return SIZES.includes(saved as FontSize) ? (saved as FontSize) : 'md'
  })
  // 문항을 빠르게 넘기면 응답이 순서를 어겨 도착할 수 있다. 마지막 요청만 화면에 반영한다.
  const requestIdRef = useRef(0)

  const load = async () => {
    const requestId = ++requestIdRef.current
    setFailed(false)
    setNotFound(false)
    // 새 문항을 불러오는 동안 이전 문항을 남겨두면 잘못된 문항에 상태를 저장하게 된다.
    setQuestion(null)

    try {
      const q = await getQuestion(qid)
      if (requestIdRef.current !== requestId) return
      setQuestion(q)
    } catch (e) {
      if (requestIdRef.current !== requestId) return
      // 없는 문항과 통신 실패는 사용자가 할 수 있는 일이 다르다.
      if (e instanceof Error && e.message.includes('404')) setNotFound(true)
      else setFailed(true)
    }

    // 만능 패턴은 밑줄을 위한 부가 정보다. 못 받아도 본문 읽기를 막지 않는다.
    if (patterns.size === 0) {
      try {
        const list = await getPatterns()
        if (requestIdRef.current === requestId) setPatterns(new Set(list))
      } catch {
        /* 밑줄만 빠진다 */
      }
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid])

  const pickSize = (s: FontSize) => {
    setSize(s)
    localStorage.setItem(FONT_KEY, s)
  }

  // 같은 칸을 다시 누르면 미설정으로 되돌린다.
  // 저장 중에 문항이 바뀔 수 있으므로 되돌릴 때도 "그 문항이 아직 화면에 있을 때만" 손댄다.
  const pickState = async (nextState: OpicState) => {
    if (!question) return
    const target = question
    const before = target.state
    const value = before === nextState ? null : nextState
    setQuestion((cur) => (cur && cur.id === target.id ? { ...cur, state: value } : cur))
    setSaveError(null)
    try {
      await putStatus(target.answerHash, value)
      // 같은 답변을 쓰는 다른 문항까지 상태가 바뀌므로 목록과 진도를 다시 받는다.
      reloadTopic()
    } catch {
      setQuestion((cur) => (cur && cur.id === target.id ? { ...cur, state: before } : cur))
      setSaveError('상태를 저장하지 못했어요. 다시 눌러 주세요.')
    }
  }

  const idx = questions?.findIndex((q) => q.id === qid) ?? -1
  const prev = idx > 0 ? questions?.[idx - 1] : undefined
  const next = idx >= 0 && questions ? questions[idx + 1] : undefined

  return (
    <div className="flex min-h-svh flex-col bg-op-bg font-hh-sans text-op-ink lg:flex-row">
      <OpicNav />

      {/* 넓은 화면에서는 문항 목록을 가운데 단으로 함께 보여준다. */}
      {topic && questions && (
        <aside className="hidden w-[330px] flex-none border-r border-op-border bg-op-surface px-4 py-6 lg:block lg:h-svh lg:overflow-y-auto">
          <OpicQuestionList topic={topic} questions={questions} selectedId={qid} />
        </aside>
      )}

      <main className="min-w-0 flex-1 px-5 pb-12 pt-3 lg:px-10 lg:pt-7">
        <button
          type="button"
          onClick={() => navigate(`/opic/t/${tid}`)}
          className="mb-3 text-[13px] font-semibold text-op-ink-muted lg:hidden"
        >
          ← {topic?.name ?? '문항 목록'}
        </button>

        <div className="lg:max-w-[860px]">
          {notFound && <OpicNotFound what="문항" />}
          {failed && <LoadError screen={false} message="스크립트를 불러오지 못했어요." onRetry={load} />}
          {!notFound && !failed && !question && <Loading />}

          {question && !notFound && !failed && (
            <div className="flex flex-col gap-4">
              {/* 롤플레이 조각은 에바 카드가 없어 제목이 사라지므로 따로 보여준다. */}
              {question.questionEn.trim() === '' && (
                <h1 className="m-0 text-[17px] font-semibold">{question.titleKo}</h1>
              )}

              {/* 에바 질문 카드. 롤플레이처럼 영어 질문이 없는 문항에는 그리지 않는다. */}
              {question.questionEn.trim() !== '' && (
                <section className="flex gap-4 rounded-2xl border border-[#E8C9DA] bg-op-eva-tint p-4 lg:p-5">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-op-eva text-[13px] font-bold text-white">
                    Eva
                  </span>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold">{question.titleKo}</span>
                      {question.altTitles.map((t) => (
                        <span key={t} className="text-[12px] text-[#6E2A50]">
                          + {t}
                        </span>
                      ))}
                    </div>
                    <p className="m-0 whitespace-pre-line font-op-serif text-[17px] leading-[1.55] text-[#2A2230] lg:text-[18px]">
                      {question.questionEn}
                    </p>
                  </div>
                </section>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 rounded-xl bg-[#ECE8DF] p-1">
                  {OPIC_STATES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => pickState(s)}
                      aria-pressed={question.state === s}
                      className={`h-9 rounded-lg px-3.5 text-[14px] ${
                        question.state === s
                          ? 'bg-white font-bold text-op-ink shadow-[0_1px_3px_rgba(31,42,39,0.12)]'
                          : 'text-op-ink-muted'
                      }`}
                    >
                      {OPIC_STATE_LABEL[s]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-op-ink-muted">글자</span>
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => pickSize(s)}
                      aria-pressed={size === s}
                      aria-label={s === 'sm' ? '글자 작게' : s === 'md' ? '글자 보통' : '글자 크게'}
                      className={`h-8 w-8 rounded-lg border text-[13px] font-bold ${
                        size === s
                          ? 'border-op-ink bg-op-ink text-white'
                          : 'border-op-border bg-white text-op-ink-muted'
                      }`}
                    >
                      {s === 'sm' ? 'A-' : s === 'md' ? 'A' : 'A+'}
                    </button>
                  ))}
                </div>
              </div>

              {saveError && (
                <p className="m-0 rounded-xl bg-[#FDECE3] px-4 py-2.5 text-[13px] text-[#B23A0A]">
                  {saveError}
                </p>
              )}

              <OpicScriptBody answer={question.answerEn} patterns={patterns} size={size} />

              {question.sharedQuestion && (
                <p className="m-0 text-[12px] text-op-ink-muted">
                  이 영어 질문은 다른 주제에도 있어요. 엑셀에서 고칠 곳: {question.sourceRef}
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                {prev ? (
                  <Link
                    to={`/opic/t/${tid}/q/${prev.id}`}
                    className="rounded-xl border border-op-border bg-white px-4 py-2.5 text-[14px] font-semibold text-op-ink no-underline"
                  >
                    ← Q{prev.seq}
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link
                    to={`/opic/t/${tid}/q/${next.id}`}
                    className="rounded-xl border border-op-border bg-white px-4 py-2.5 text-[14px] font-semibold text-op-ink no-underline"
                  >
                    Q{next.seq} →
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
