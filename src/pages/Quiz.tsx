import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  SpeakerIcon,
  StarIcon,
  XCircleIcon,
  XIcon,
} from '../components/icons'
import { BlockingOverlay } from '../components/BlockingOverlay'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { useSpeak } from '../lib/useSpeak'
import {
  getWordSet,
  getWordsBySet,
  getWrongNotes,
  recordQuizRound,
  updateWordSetTitle,
} from '../lib/db'
import { checkAnswer, formatDateTime, formatDuration, generateQuestions, type Question, type QuizWord } from '../lib/quiz'
import { VerbAnswerFields } from '../components/VerbAnswerFields'
import { VerbAnswerCells } from '../components/VerbAnswerCells'
import {
  checkVerbAnswer,
  joinVerbAnswer,
  joinVerbForms,
  splitVerbAnswer,
  type VerbAnswer,
  type VerbResult,
} from '../lib/verbs'
import {
  clearQuizProgress,
  loadQuizProgress,
  saveQuizProgress,
  type SavedAnswer,
} from '../lib/quizProgress'

type QuizOrder = 'shuffle' | 'ordered'

type Phase = 'loading' | 'error' | 'nowords' | 'setup' | 'asking' | 'round-summary'

// 뜻을 자유롭게 입력받는 유형(영어→뜻)은 비슷한 말을 컴퓨터가 자동으로 알아보기 어려워
// 채점이 애매해진다. 정확히 채점할 수 있는 "뜻→영어(철자 쓰기)"로만 출제한다.
const FIXED_QUESTION_TYPE = 'spelling'

const COUNT_OPTIONS = [5, 10, 20, 50] as const
const ALL_WORDS = 0
const ORDER_OPTIONS: { value: QuizOrder; label: string }[] = [
  { value: 'shuffle', label: '섞기' },
  { value: 'ordered', label: '단어장 순서대로' },
]

type AnswerLog = SavedAnswer

interface RoundResult {
  round: number
  finishedAt: number
  /** 이 테스트의 첫 라운드 결과 (복습 라운드 뒤에도 처음 성적을 보여주기 위해) */
  firstRound: { correct: number; total: number }
  durationMs: number
  correctCount: number
  wrongCount: number
  wrongAnswers: AnswerLog[]
  isFinal: boolean
}

/** "5" 또는 "1,2,3" 같은 단어장 id 목록을 숫자 배열로. */
function parseIds(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0)
}

const EMPTY_VERB: VerbAnswer = { present: '', past: '', participle: '' }

/** 동사 문제의 정답 세 형태. 저장된 변화형이 비어 있을 일은 없지만 방어적으로 받는다. */
function formsOf(word: QuizWord) {
  return { term: word.term, past: word.past ?? '', participle: word.participle ?? '' }
}

function buildAnswer(q: Question, userAnswer: string, correct: boolean): AnswerLog {
  return {
    wordId: q.word.id,
    questionType: q.type,
    term: q.word.term,
    meaning: q.word.meaning,
    correctAnswer:
      q.type === 'spelling'
        ? q.word.term
        : q.type === 'verb'
          ? joinVerbForms(formsOf(q.word))
          : q.word.meaning,
    userAnswer,
    correct,
  }
}

export function Quiz() {
  const { wordSetId: wordSetIdParam } = useParams<{ wordSetId: string }>()
  const [searchParams] = useSearchParams()
  // /quiz/5 (단어장 하나), /test/start?sets=1,2,3 (여러 단어장), /wrong/quiz (id 없음: 오답 노트 단어들)
  const idsKey = wordSetIdParam ?? searchParams.get('sets') ?? ''
  const wordSetIds = idsKey ? parseIds(idsKey) : null
  // 단어장 하나만 고른 경우에만 값이 있다 (이름 편집, 기록의 단어장 연결에 사용)
  const singleId = wordSetIds?.length === 1 ? wordSetIds[0] : null
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('loading')
  const [wordSetTitle, setWordSetTitle] = useState('')
  const [round, setRound] = useState(1)
  const [groupId, setGroupId] = useState('')

  const [allWords, setAllWords] = useState<QuizWord[]>([])
  const [setCount, setSetCount] = useState(1)
  const [questionCount, setQuestionCount] = useState<number>(ALL_WORDS)
  const [order, setOrder] = useState<QuizOrder>('shuffle')
  const [titleError, setTitleError] = useState('')

  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<(AnswerLog | null)[]>([])
  const [qIndex, setQIndex] = useState(0)
  const [answerInput, setAnswerInput] = useState('')
  const [verbInput, setVerbInput] = useState<VerbAnswer>(EMPTY_VERB)
  const [roundStartedAt, setRoundStartedAt] = useState(0)
  const [firstRound, setFirstRound] = useState<{ correct: number; total: number } | null>(null)
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [exitDialogOpen, setExitDialogOpen] = useState(false)
  const [finishDialogOpen, setFinishDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const savedTitleRef = useRef('')
  // 결과를 서버에 저장하는 중인지. 저장이 느릴 때 "마치기"를 여러 번 눌러도 한 번만 저장되게 한다.
  const submittingRef = useRef(false)
  // 이 라운드에서 화면을 켜 둔 채 실제로 푼 시간(ms). 나갔다가 이어서 풀 때 그 사이 시간이
  // 소요 시간에 들어가지 않도록, 시작~종료 시각 차이 대신 이 값을 쓴다.
  const elapsedRef = useRef(0)
  const badgeRefs = useRef<Array<HTMLButtonElement | null>>([])

  const { speak, speakingTerm } = useSpeak()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let title: string
        let words: QuizWord[]
        let sets = 1
        if (wordSetIds === null) {
          const notes = (await getWrongNotes()).filter((n) => n.resolvedAt === null)
          title = '오답 노트'
          words = notes.map((n) => ({
            id: n.wordId,
            wordSetId: n.wordSetId,
            term: n.term,
            meaning: n.meaning,
            isIdiom: n.isIdiom,
            partOfSpeech: n.partOfSpeech ?? undefined,
            past: n.past,
            participle: n.participle,
          }))
        } else {
          const loaded = await Promise.all(
            wordSetIds.map(async (id) => {
              try {
                const [set, setWords] = await Promise.all([getWordSet(id), getWordsBySet(id)])
                return set ? { title: set.title, words: setWords } : null
              } catch {
                return null // 삭제되었거나 불러오지 못한 단어장은 건너뛴다
              }
            }),
          )
          const found = loaded.filter((l) => l !== null)
          sets = found.length
          title = found.map((l) => l.title).join(' + ')
          words = found.flatMap((l) => l.words)
        }
        if (cancelled) return
        if (words.length === 0) {
          setPhase('nowords')
          return
        }
        setWordSetTitle(title)
        savedTitleRef.current = title
        setAllWords(words)
        setSetCount(sets)

        // 풀다가 나간 테스트가 있으면 처음부터가 아니라 이어서 보여준다.
        const saved = loadQuizProgress(idsKey)
        if (saved) {
          setQuestions(saved.questions)
          setAnswers(saved.answers)
          const resumeIndex = Math.min(saved.qIndex, saved.questions.length - 1)
          setQIndex(resumeIndex)
          const resumeAnswer = saved.answers[resumeIndex]?.userAnswer ?? ''
          setAnswerInput(resumeAnswer)
          // goTo와 같은 복원. 이게 없으면 이어서 풀 때 동사 세 칸만 비어 보인다.
          setVerbInput(
            saved.questions[resumeIndex]?.type === 'verb' ? splitVerbAnswer(resumeAnswer) : EMPTY_VERB,
          )
          setRound(saved.round)
          setGroupId(saved.groupId)
          setRoundStartedAt(saved.startedAt)
          elapsedRef.current = saved.elapsedMs ?? 0
          setFirstRound(saved.firstRound)
          setPhase('asking')
        } else {
          setPhase('setup')
        }
      } catch {
        // 불러오기에 실패하면 스피너가 끝없이 돌지 않게 안내 화면으로 바꾼다.
        if (!cancelled) setPhase('error')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  // 풀고 있는 동안 진행 상황을 계속 저장해서, 실수로 화면을 벗어나도 이어서 풀 수 있게 한다.
  useEffect(() => {
    if (phase !== 'asking' || questions.length === 0) return
    saveQuizProgress(idsKey, {
      wordSetTitle,
      setCount,
      round,
      groupId,
      startedAt: roundStartedAt,
      elapsedMs: elapsedRef.current,
      firstRound,
      questions,
      answers,
      qIndex,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questions, answers, qIndex, round, groupId, roundStartedAt, wordSetTitle, setCount])

  // 풀고 있는 동안, 화면이 보일 때만 시간을 센다.
  useEffect(() => {
    if (phase !== 'asking') return
    const tick = 1000
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') elapsedRef.current += tick
    }, tick)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    badgeRefs.current[qIndex]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [qIndex, questions.length])

  const currentQuestion = questions[qIndex]
  const feedback: 'idle' | 'correct' | 'wrong' =
    answers[qIndex] == null ? 'idle' : answers[qIndex]!.correct ? 'correct' : 'wrong'
  const answeredCount = answers.filter((a) => a !== null).length
  // 칸별 정오는 화면의 입력값이 아니라 기록된 답에서 다시 센다. "모르겠어요"로 넘긴
  // 문항도 세 칸이 모두 틀린 것으로 표시되어 정답이 보인다.
  const verbResult =
    currentQuestion?.type === 'verb' && answers[qIndex]
      ? checkVerbAnswer(formsOf(currentQuestion.word), splitVerbAnswer(answers[qIndex]!.userAnswer))
      : null

  function startRound(words: QuizWord[], roundNumber: number, count?: number) {
    const qs = generateQuestions(words, { count, mode: FIXED_QUESTION_TYPE, shuffle: order === 'shuffle' })
    setQuestions(qs)
    setAnswers(Array(qs.length).fill(null))
    setQIndex(0)
    setAnswerInput('')
    setVerbInput(EMPTY_VERB)
    setRound(roundNumber)
    setRoundStartedAt(Date.now())
    elapsedRef.current = 0
    submittingRef.current = false
    setSubmitting(false)
    setSubmitError('')
    setPhase('asking')
  }

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(questions.length - 1, index))
    setQIndex(clamped)
    const saved = answers[clamped]?.userAnswer ?? ''
    setAnswerInput(saved)
    // 동사 답은 "현재 | 과거 | 과거분사"로 저장돼 있으니 세 칸으로 되돌린다.
    setVerbInput(questions[clamped]?.type === 'verb' ? splitVerbAnswer(saved) : EMPTY_VERB)
  }

  function submit(skip = false) {
    if (!currentQuestion) return
    if (currentQuestion.type === 'verb') {
      const result = skip ? null : checkVerbAnswer(formsOf(currentQuestion.word), verbInput)
      const record = buildAnswer(
        currentQuestion,
        skip ? '' : joinVerbAnswer(verbInput),
        result?.all ?? false,
      )
      setAnswers((prev) => {
        const next = [...prev]
        next[qIndex] = record
        return next
      })
      return
    }
    const correct = !skip && checkAnswer(currentQuestion, answerInput)
    const record = buildAnswer(currentQuestion, skip ? '' : answerInput, correct)
    setAnswers((prev) => {
      const next = [...prev]
      next[qIndex] = record
      return next
    })
  }

  function handleNext() {
    if (qIndex === questions.length - 1) {
      requestFinish()
      return
    }
    goTo(qIndex + 1)
  }

  function requestFinish() {
    if (answeredCount < questions.length) {
      setFinishDialogOpen(true)
      return
    }
    doFinish()
  }

  function doFinish() {
    setFinishDialogOpen(false)
    const finalAnswers = questions.map((q, i) => answers[i] ?? buildAnswer(q, '', false))
    finishRound(finalAnswers)
  }

  async function finishRound(finalAnswers: AnswerLog[]) {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')

    const finishedAt = Date.now()
    const correctCount = finalAnswers.filter((a) => a.correct).length
    const wrongAnswers = finalAnswers.filter((a) => !a.correct)
    const resultFirstRound = round === 1 ? { correct: correctCount, total: finalAnswers.length } : firstRound
    if (round === 1) setFirstRound(resultFirstRound)

    const durationMs = elapsedRef.current
    try {
      await recordQuizRound({
        groupId,
        wordSetId: singleId,
        wordSetTitle,
        round,
        // 서버는 소요 시간을 finishedAt - startedAt으로 계산하므로, 실제로 푼 시간이 나오게 맞춘다.
        startedAt: finishedAt - durationMs,
        finishedAt,
        answers: finalAnswers,
      })
    } catch {
      // 저장에 실패하면 다시 눌러 재시도할 수 있게 풀어준다. (서버는 같은 라운드 중복 저장을 무시한다)
      submittingRef.current = false
      setSubmitting(false)
      setSubmitError('결과를 저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러주세요.')
      return
    }
    clearQuizProgress(idsKey) // 서버에 남겼으니 기기의 임시 저장은 지운다

    setRoundResult({
      round,
      finishedAt,
      firstRound: resultFirstRound ?? { correct: correctCount, total: finalAnswers.length },
      durationMs,
      correctCount,
      wrongCount: wrongAnswers.length,
      wrongAnswers,
      isFinal: wrongAnswers.length === 0,
    })
    setPhase('round-summary')
  }

  async function saveTitle() {
    const trimmed = wordSetTitle.trim()
    if (singleId === null) return
    if (!trimmed) {
      setWordSetTitle(savedTitleRef.current)
      return
    }
    setWordSetTitle(trimmed)
    if (trimmed === savedTitleRef.current) return
    try {
      await updateWordSetTitle(singleId, trimmed)
      savedTitleRef.current = trimmed
      setTitleError('')
    } catch {
      setWordSetTitle(savedTitleRef.current)
      setTitleError('이름을 저장하지 못했어요. 잠시 후 다시 시도해주세요.')
    }
  }

  function startQuiz() {
    setGroupId(crypto.randomUUID())
    setFirstRound(null)
    const count = questionCount === ALL_WORDS ? undefined : questionCount
    startRound(allWords, 1, count)
  }

  function retryWrong() {
    if (!roundResult) return
    const wrongWords: QuizWord[] = []
    const seen = new Set<number>()
    for (const a of roundResult.wrongAnswers) {
      if (!seen.has(a.wordId)) {
        seen.add(a.wordId)
        const q = questions.find((qq) => qq.word.id === a.wordId)
        if (q) wrongWords.push(q.word)
      }
    }
    startRound(wrongWords, round + 1)
  }

  function requestExit() {
    if (phase === 'asking') {
      setExitDialogOpen(true)
      return
    }
    navigate('/')
  }

  function confirmExit() {
    clearQuizProgress(idsKey)
    navigate('/')
  }

  if (phase === 'loading') {
    return <Loading screen />
  }

  if (phase === 'error') {
    return <LoadError screen message="테스트를 불러오지 못했어요." onRetry={() => window.location.reload()} />
  }

  if (phase === 'nowords') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <p className="text-[15px] font-semibold text-ink">
          {wordSetIds === null ? '오답 노트가 비어 있어요. 잘하고 있어요!' : '선택한 단어장에는 문제가 없어요.'}
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-2xl bg-primary px-6 py-3 text-[14px] font-bold text-white"
        >
          홈으로 가기
        </button>
      </div>
    )
  }

  if (phase === 'setup') {
    const total = allWords.length
    const effectiveCount = questionCount === ALL_WORDS ? total : Math.min(questionCount, total)
    return (
      <div className="flex min-h-svh flex-col bg-bg">
        <div className="flex flex-none items-center gap-3 px-[18px] pt-[18px]">
          <button
            type="button"
            aria-label="홈으로"
            onClick={() => navigate('/')}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-ink"
          >
            <XIcon width={18} height={18} />
          </button>
          <h2 className="m-0 text-[17px] font-bold">테스트 설정</h2>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-[22px] py-5">
          <div className="rounded-[22px] border border-border bg-surface p-5">
            {singleId === null ? (
              <div className="break-words text-[19px] font-extrabold">{wordSetTitle}</div>
            ) : (
              <label className="flex items-center gap-2">
                <input
                  value={wordSetTitle}
                  onChange={(e) => setWordSetTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  aria-label="단어장 이름"
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[19px] font-extrabold outline-none focus:border-primary"
                />
                <PencilIcon width={16} height={16} className="flex-none text-ink-muted" />
              </label>
            )}
            <p className="m-0 mt-1 px-1 text-[13px] text-ink-muted">
              {setCount > 1 && `단어장 ${setCount}개 · `}단어 {total}개 중 {effectiveCount}문제를 풀어요
            </p>
            {titleError && <p className="m-0 mt-1.5 px-1 text-[12.5px] font-semibold text-error">{titleError}</p>}
          </div>

          <OptionGroup
            label="문제 수"
            value={questionCount}
            onChange={setQuestionCount}
            options={[
              ...COUNT_OPTIONS.filter((c) => c < total).map((c) => ({ value: c as number, label: `${c}개` })),
              { value: ALL_WORDS, label: `전체 (${total})` },
            ]}
          />
          <OptionGroup label="문제 순서" value={order} onChange={setOrder} options={ORDER_OPTIONS} />

          <div className="mt-6">
            <div className="mb-2 text-[13px] font-bold text-ink-muted">시험 유형</div>
            <div className="rounded-2xl border-2 border-primary bg-primary-tint/40 p-3 text-center text-[14px] font-bold text-primary-dark">
              뜻을 보고 영어 단어 쓰기
            </div>
            <p className="m-0 mt-1.5 px-1 text-[11.5px] leading-relaxed text-ink-muted">
              비슷한 뜻은 컴퓨터가 자동으로 알아보기 어려워서, 정확하게 채점할 수 있는 이 유형으로만 진행돼요.
            </p>
          </div>

          <div className="flex-1" />
          <button
            type="button"
            onClick={startQuiz}
            className="mt-6 rounded-2xl bg-primary p-[15px] text-[15.5px] font-bold text-white"
          >
            테스트 시작
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'round-summary' && roundResult) {
    return (
      <RoundSummary
        wordSetTitle={wordSetTitle}
        result={roundResult}
        onRetry={retryWrong}
        onHome={() => navigate('/')}
        onWrongNotes={() => navigate('/wrong')}
      />
    )
  }

  if (!currentQuestion) return null

  const isReviewRound = round > 1

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <div className="flex-none px-[14px] pt-[16px]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="테스트 종료"
            onClick={requestExit}
            className="flex h-[34px] w-[34px] flex-none items-center justify-center text-ink-muted"
          >
            <XIcon width={18} height={18} />
          </button>
          <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto scroll-smooth py-1">
            {questions.map((_, i) => {
              const a = answers[i]
              const isCurrent = i === qIndex
              const stateClass = isCurrent
                ? 'border-2 border-primary bg-surface text-primary'
                : a === null
                  ? 'border border-border bg-surface-alt text-ink-muted'
                  : a.correct
                    ? 'border border-transparent bg-success text-white'
                    : 'border border-transparent bg-error text-white'
              return (
                <button
                  key={i}
                  ref={(el) => {
                    badgeRefs.current[i] = el
                  }}
                  type="button"
                  aria-label={`${i + 1}번 문제로 이동`}
                  aria-current={isCurrent}
                  onClick={() => goTo(i)}
                  className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[12.5px] font-bold ${stateClass}`}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <span className="flex-none text-[13px] font-bold text-ink-muted">
            {qIndex + 1} / {questions.length}
          </span>
        </div>
        {isReviewRound && (
          <div className="mt-2.5 flex justify-center">
            <span className="rounded-full bg-accent-tint px-3 py-1 text-[11.5px] font-bold text-accent-dark">
              복습 라운드 · 틀린 단어만 다시 풀어요
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-[22px] py-6">
        {currentQuestion.type === 'verb' ? (
          <VerbQuestion
            question={currentQuestion}
            answer={verbInput}
            setAnswer={setVerbInput}
            result={verbResult}
            feedback={feedback}
            onSubmit={() => submit(false)}
            speak={speak}
            speakingTerm={speakingTerm}
          />
        ) : (
          <SpellingQuestion
            question={currentQuestion}
            answer={answerInput}
            setAnswer={setAnswerInput}
            feedback={feedback}
            speak={speak}
            speakingTerm={speakingTerm}
          />
        )}

        <div className="flex-1" />

        {feedback === 'idle' && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => submit(false)}
              className="flex-1 rounded-2xl bg-primary p-[15px] text-[15.5px] font-bold text-white"
            >
              확인
            </button>
            <button
              type="button"
              onClick={() => submit(true)}
              className="flex-none rounded-2xl border border-border bg-surface px-4 text-[13.5px] font-semibold text-ink-muted"
            >
              모르겠어요
            </button>
          </div>
        )}

        {submitError && <p className="m-0 mt-2 text-center text-[12.5px] font-semibold text-error">{submitError}</p>}

        <div className="mt-3 flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => goTo(qIndex - 1)}
            disabled={qIndex === 0}
            className="flex items-center gap-1 rounded-2xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-ink disabled:opacity-30"
          >
            <ChevronLeftIcon width={16} height={16} />
            이전
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={submitting || (qIndex < questions.length - 1 && feedback === 'idle')}
            className="flex items-center gap-1 rounded-2xl border border-border bg-surface px-4 py-2.5 text-[13.5px] font-semibold text-ink disabled:opacity-30"
          >
            {qIndex === questions.length - 1 ? (
              submitting ? '저장 중...' : '테스트 마치기'
            ) : (
              <>
                다음
                <ChevronRightIcon width={16} height={16} />
              </>
            )}
          </button>
        </div>
      </div>

      <BlockingOverlay open={submitting} message="결과를 저장하고 있어요..." />
      <ConfirmDialog
        open={exitDialogOpen}
        title="테스트를 종료할까요?"
        description="지금까지 답한 내용이 사라지고, 다음엔 처음부터 다시 풀어야 해요."
        confirmLabel="종료하기"
        cancelLabel="계속 풀기"
        danger
        onConfirm={confirmExit}
        onCancel={() => setExitDialogOpen(false)}
      />
      <ConfirmDialog
        open={finishDialogOpen}
        title="아직 안 푼 문제가 있어요"
        description={`${questions.length - answeredCount}문제를 안 풀었어요. 그래도 제출할까요? 안 푼 문제는 오답으로 처리돼요.`}
        confirmLabel={submitting ? '저장 중...' : '제출하기'}
        cancelLabel="이어서 풀기"
        onConfirm={doFinish}
        onCancel={() => setFinishDialogOpen(false)}
      />
    </div>
  )
}

function OptionGroup<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="mt-6">
      <div className="mb-2 text-[13px] font-bold text-ink-muted">{label}</div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`min-w-[76px] flex-1 rounded-2xl border p-3 text-[14px] font-semibold ${
                selected ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-ink'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface QuestionProps {
  question: Question
  answer: string
  setAnswer: (v: string) => void
  feedback: 'idle' | 'correct' | 'wrong'
  speak: (term: string) => void
  speakingTerm: string | null
}

function SpellingQuestion({ question, answer, setAnswer, feedback, speak, speakingTerm }: QuestionProps) {
  const { word } = question
  const showHintBoxes = !word.term.includes(' ')

  return (
    <>
      <div className="flex justify-center">
        <span className="rounded-full bg-primary-tint px-3.5 py-1.5 text-[12.5px] font-bold text-primary-dark">
          뜻을 보고 영어 단어를 써보세요
        </span>
      </div>

      <div className="mt-6 rounded-[22px] border border-border bg-surface p-8 text-center">
        {word.partOfSpeech && (
          <span className="rounded-md bg-surface-alt px-2 py-0.5 text-[11px] font-bold text-ink-muted">
            {word.partOfSpeech}
          </span>
        )}
        <div className="mt-3.5 text-[26px] font-extrabold">{word.meaning}</div>
        <button
          type="button"
          onClick={() => speak(word.term)}
          className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-4 py-2 text-[12.5px] font-bold text-primary-dark"
        >
          <SpeakerIcon width={15} height={15} className={speakingTerm === word.term ? 'animate-speak' : ''} />
          발음 듣기
        </button>
      </div>

      {showHintBoxes && (
        <div className="mt-[22px] flex flex-wrap justify-center gap-1.5">
          {word.term.split('').map((ch, i) => (
            <div
              key={i}
              className="flex h-10 w-[32px] items-center justify-center border-b-[3px] font-display text-[21px] font-bold"
              style={{ borderColor: i === 0 ? 'var(--color-primary)' : 'var(--color-border)' }}
            >
              {i === 0 ? ch : ''}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={feedback !== 'idle'}
          placeholder="정답을 입력하세요"
          autoFocus
          className="w-full rounded-2xl border-[1.5px] border-border bg-surface p-3.5 text-center font-display text-[23px] outline-none focus:border-primary"
        />
      </div>

      <FeedbackBanner feedback={feedback} correctText={`${word.term} = ${word.meaning}`} wrongText={`정답은 ${word.term} 예요`} />
    </>
  )
}

/** 뜻을 보여주고 현재형·과거형·과거분사형 세 칸을 받는 문제. */
function VerbQuestion({
  question,
  answer,
  setAnswer,
  result,
  feedback,
  onSubmit,
  speak,
  speakingTerm,
}: {
  question: Question
  answer: VerbAnswer
  setAnswer: (v: VerbAnswer) => void
  result: VerbResult | null
  feedback: 'idle' | 'correct' | 'wrong'
  onSubmit: () => void
  speak: (term: string) => void
  speakingTerm: string | null
}) {
  const { word } = question
  const forms = formsOf(word)

  return (
    <>
      <div className="flex justify-center">
        <span className="rounded-full bg-primary-tint px-3.5 py-1.5 text-[12.5px] font-bold text-primary-dark">
          뜻을 보고 3단 변화를 써보세요
        </span>
      </div>

      <div className="mt-6 rounded-[22px] border border-border bg-surface p-8 text-center">
        <div className="text-[26px] font-extrabold">{word.meaning}</div>
        <button
          type="button"
          onClick={() => speak(word.term)}
          className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-4 py-2 text-[12.5px] font-bold text-primary-dark"
        >
          <SpeakerIcon width={15} height={15} className={speakingTerm === word.term ? 'animate-speak' : ''} />
          발음 듣기
        </button>
      </div>

      <div className="mt-5">
        <VerbAnswerFields
          value={answer}
          onChange={setAnswer}
          onSubmit={onSubmit}
          result={result}
          correct={forms}
          disabled={feedback !== 'idle'}
        />
      </div>

      <FeedbackBanner
        feedback={feedback}
        correctText={`${word.meaning} = ${joinVerbForms(forms)}`}
        wrongText={`정답은 ${joinVerbForms(forms)} 예요`}
      />
    </>
  )
}

function FeedbackBanner({
  feedback,
  correctText,
  wrongText,
}: {
  feedback: 'idle' | 'correct' | 'wrong'
  correctText: string
  wrongText: string
}) {
  if (feedback === 'idle') return null
  if (feedback === 'correct') {
    return (
      <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-success-tint p-4">
        <CheckCircleIcon width={20} height={20} className="flex-none text-success" />
        <span className="text-[13.5px] font-bold text-primary-dark">정답이에요! {correctText}</span>
      </div>
    )
  }
  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-error-tint p-4">
      <XCircleIcon width={20} height={20} className="flex-none text-error" />
      <span className="text-[13.5px] font-bold text-error">아쉬워요! {wrongText}</span>
    </div>
  )
}

function RoundSummary({
  wordSetTitle,
  result,
  onRetry,
  onHome,
  onWrongNotes,
}: {
  wordSetTitle: string
  result: RoundResult
  onRetry: () => void
  onHome: () => void
  onWrongNotes: () => void
}) {
  const { speak, speakingTerm } = useSpeak()
  const total = result.correctCount + result.wrongCount
  const accuracy = total > 0 ? Math.round((result.correctCount / total) * 100) : 0
  const first = result.firstRound
  const firstAccuracy = first.total > 0 ? Math.round((first.correct / first.total) * 100) : 0
  const hadMistakes = first.correct < first.total

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <div className="flex-none px-[22px] pt-8 text-center">
        <span className="text-[13px] font-bold tracking-wide text-ink-muted">
          {result.round === 1 ? '테스트 완료!' : result.isFinal ? '복습 완료!' : '복습 라운드 결과'}
        </span>
        <p className="m-0 mt-1 text-[12.5px] text-ink-muted">
          {wordSetTitle} · {formatDateTime(result.finishedAt)}
        </p>

        {result.isFinal ? (
          <div className="mx-auto mt-3.5 flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full border-8 border-surface bg-success-tint">
            <CheckCircleIcon width={40} height={40} className="text-success" strokeWidth={2} />
          </div>
        ) : (
          <div className="mx-auto mt-3.5 flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full border-8 border-success-tint bg-surface">
            <span className="text-[32px] font-extrabold text-primary-dark">
              {result.correctCount}/{total}
            </span>
            <span className="mt-0.5 text-[11.5px] text-ink-muted">정답률 {accuracy}%</span>
          </div>
        )}

        {result.round > 1 && (
          <p className="m-0 mt-3 text-[13px] font-semibold text-ink-muted">
            첫 시도 결과 {first.correct}/{first.total} · 정답률 {firstAccuracy}%
          </p>
        )}

        <p className="mx-auto mt-4 max-w-[280px] whitespace-pre-line text-[15px] font-bold leading-relaxed">
          {result.isFinal
            ? `완벽해요, ${wordSetTitle}의 단어를\n모두 다 외웠어요!`
            : result.round === 1
              ? '잘했어요, 조금만 더 연습하면\n완벽해질 거예요!'
              : '거의 다 왔어요!\n조금만 더 하면 끝나요.'}
        </p>
      </div>

      <div className="flex flex-none gap-2.5 px-[22px] pt-4.5">
        <div className="flex-1 rounded-2xl border border-border bg-surface p-2.5 text-center">
          <div className="text-lg font-extrabold">{formatDuration(result.durationMs)}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-muted">소요 시간</div>
        </div>
        <div className="flex-1 rounded-2xl bg-success-tint p-2.5 text-center">
          <div className="text-lg font-extrabold text-primary-dark">{result.correctCount}</div>
          <div className="mt-0.5 text-[11.5px] text-primary-dark">정답</div>
        </div>
        <div className="flex-1 rounded-2xl bg-error-tint p-2.5 text-center">
          <div className="text-lg font-extrabold text-error">{result.wrongCount}</div>
          <div className="mt-0.5 text-[11.5px] text-error">오답</div>
        </div>
      </div>

      {!result.isFinal && (
        <div className="flex-none px-[22px] pb-1.5 pt-5">
          <h3 className="m-0 text-[14.5px] font-bold">틀린 단어 다시 보기</h3>
        </div>
      )}

      {result.isFinal ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-8 text-center">
          <StarIcon width={30} height={30} className="text-gold" />
          <p className="m-0 text-[13px] leading-relaxed text-ink-muted">
            {result.round}라운드 만에 모든 단어를 맞혔어요.
            <br />
            오늘 학습은 여기까지!
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-[22px] pb-3.5">
          {Array.from(new Map(result.wrongAnswers.map((a) => [a.wordId, a])).values()).map((a) => (
            <div key={a.wordId} className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface p-3">
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">
                  {a.questionType === 'verb' ? a.correctAnswer.split(' | ').join(' · ') : a.term}{' '}
                  <span className="font-kr text-[13px] font-normal text-ink-muted">= {a.meaning}</span>
                </div>
                <div className="mt-1 text-[12.5px] text-error">
                  내가 쓴 답:{' '}
                  {a.questionType === 'verb' ? (
                    <VerbAnswerCells value={a.userAnswer} layout="row" />
                  ) : (
                    <span className="line-through">{a.userAnswer || '(건너뜀)'}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label="영어 발음 듣기"
                onClick={() => speak(a.term)}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-primary-tint text-primary"
              >
                <SpeakerIcon width={15} height={15} className={speakingTerm === a.term ? 'animate-speak' : ''} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-none flex-col gap-2 border-t border-border bg-surface px-[22px] pb-5 pt-3.5">
        {!result.isFinal && (
          <>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-2xl bg-accent p-[15px] text-[15.5px] font-bold text-white"
            >
              틀린 단어만 다시 풀기
            </button>
            <p className="m-0 text-center text-[11.5px] text-ink-muted">
              다 맞힐 때까지 틀린 단어만 모아서 반복돼요
            </p>
          </>
        )}
        {hadMistakes && (
          <button
            type="button"
            onClick={onWrongNotes}
            className="rounded-[14px] border border-border p-3 text-center text-[14px] font-semibold text-accent-dark"
          >
            틀린 단어는 오답 노트에 저장됐어요 · 보러 가기
          </button>
        )}
        <button
          type="button"
          onClick={onHome}
          className="rounded-[14px] border border-border p-3 text-center text-[14px] font-semibold text-ink"
        >
          홈으로 가기
        </button>
      </div>
    </div>
  )
}
