import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon, CheckIcon, InfoIcon, XIcon } from '../components/icons'
import { getAttemptDetail, type QuizAnswerRecord, type QuizSessionRecord } from '../lib/db'
import { LoadError } from '../components/LoadError'
import { VerbAnswerCells } from '../components/VerbAnswerCells'
import { Loading } from '../components/Loading'
import { formatDateTime, formatMinSec } from '../lib/quiz'

export function ParentSessionDetail() {
  const { groupId } = useParams<{ groupId: string }>()
  const [data, setData] = useState<{ rounds: QuizSessionRecord[]; answers: QuizAnswerRecord[] } | null>(null)
  const [failed, setFailed] = useState(false)

  function fetchDetail() {
    if (!groupId) return
    getAttemptDetail(groupId)
      .then(setData)
      .catch(() => setFailed(true))
  }

  useEffect(fetchDetail, [groupId])

  function retry() {
    setFailed(false)
    setData(null)
    fetchDetail()
  }

  if (failed) {
    return <LoadError screen message="테스트 결과를 불러오지 못했어요." onRetry={retry} />
  }

  if (!data) {
    return <Loading screen />
  }

  const firstRound = data.rounds.find((r) => r.round === 1)
  if (!firstRound) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-bg text-center">
        <p className="text-ink-muted">기록을 찾을 수 없어요.</p>
        <Link to="/parent" className="font-bold text-primary">
          목록으로
        </Link>
      </div>
    )
  }

  const firstRoundAnswers = data.answers.filter((a) => a.sessionId === firstRound.id)
  const totalDuration = data.rounds.reduce((s, r) => s + r.durationMs, 0)
  const accuracy =
    firstRound.totalQuestions > 0 ? Math.round((firstRound.correctCount / firstRound.totalQuestions) * 100) : 0
  const mastered = data.rounds.some((r) => r.wrongCount === 0)
  const wrongTermsStillLeft = data.rounds.length > 1 && !mastered

  const missedTerms = Array.from(
    new Set(firstRoundAnswers.filter((a) => !a.correct).map((a) => a.term)),
  )

  return (
    <div className="min-h-svh bg-bg pb-8">
      <div className="flex items-center justify-between px-5 pt-5 sm:px-10">
        <Link to="/parent" className="flex items-center gap-2 text-[13.5px] font-semibold text-ink-muted">
          <ArrowLeftIcon width={16} height={16} />
          목록으로
        </Link>
        <span className="rounded-full bg-success-tint px-4.5 py-2 text-[14px] font-extrabold text-success">
          {firstRound.correctCount} / {firstRound.totalQuestions} 정답 · {accuracy}%
        </span>
      </div>

      <div className="px-5 pt-5 sm:px-10">
        <h1 className="m-0 break-keep text-[21px] font-extrabold">{formatDateTime(firstRound.startedAt)} 테스트 결과</h1>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">{firstRound.wordSetTitle}</p>
      </div>

      <div className="grid grid-cols-[1fr_1fr_1fr_1.7fr] gap-2.5 px-5 pt-4.5 sm:px-10">
        <MiniStat value={String(firstRound.totalQuestions)} label="전체 문항" />
        <MiniStat value={String(firstRound.correctCount)} label="정답" tint="bg-success-tint" tintText="text-success" />
        <MiniStat value={String(firstRound.wrongCount)} label="오답" tint="bg-error-tint" tintText="text-error" />
        <MiniStat value={formatMinSec(totalDuration)} label="총 소요 시간" />
      </div>

      <div className="px-5 pt-5 sm:px-10">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <table className="w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              <col className="w-[7.5%]" />
              <col className="w-[31%]" />
              <col className="w-[26%]" />
              <col className="w-[26%]" />
              <col className="w-[9.5%]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-alt text-left text-[11px] font-bold text-ink-muted">
                <th className="whitespace-nowrap px-0.5 py-2.5 text-center">#</th>
                <th className="px-1.5 py-2.5">단어</th>
                <th className="px-0.5 py-2.5">정답</th>
                <th className="px-0.5 py-2.5">쓴 답</th>
                <th className="whitespace-nowrap px-1 py-2.5 text-center">결과</th>
              </tr>
            </thead>
            <tbody>
              {firstRoundAnswers.map((a, i) => (
                <tr key={a.id} className={a.correct ? 'bg-success-tint' : 'bg-error-tint'}>
                  <td className="px-0.5 py-2 text-center text-[11.5px] text-ink-muted">{i + 1}</td>
                  <td className="break-words px-1.5 py-2 font-display text-[12.5px] font-bold">{a.term}</td>
                  <td className="break-words px-0.5 py-2 text-[12px]">
                    {a.questionType === 'verb' ? <VerbAnswerCells value={a.correctAnswer} /> : a.correctAnswer}
                  </td>
                  <td className={`break-words px-0.5 py-2 text-[12px] ${a.correct ? '' : 'text-error'}`}>
                    {a.questionType === 'verb' ? (
                      <VerbAnswerCells value={a.userAnswer} />
                    ) : !a.correct ? (
                      a.userAnswer || '(건너뜀)'
                    ) : (
                      a.userAnswer
                    )}
                  </td>
                  <td className="px-1 py-2 text-center">
                    {a.correct ? (
                      <CheckIcon width={17} height={17} className="inline text-success" strokeWidth={2.2} />
                    ) : (
                      <XIcon width={17} height={17} className="inline text-error" strokeWidth={2.2} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {missedTerms.length > 0 && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-primary-tint p-3.5">
            <InfoIcon width={18} height={18} className="flex-none text-primary-dark" />
            <span className="text-[12.5px] font-semibold text-primary-dark">
              {wrongTermsStillLeft
                ? `틀린 단어(${missedTerms.join(', ')})는 다음 테스트에 우선 출제돼요.`
                : `틀렸던 단어(${missedTerms.join(', ')})는 복습 라운드에서 모두 다시 맞혔어요.`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniStat({
  value,
  label,
  tint = 'bg-surface',
  tintText = 'text-ink',
}: {
  value: string
  label: string
  tint?: string
  tintText?: string
}) {
  return (
    <div className={`min-w-0 rounded-2xl border border-border px-1.5 py-3 text-center ${tint}`}>
      <div className={`whitespace-nowrap text-[17px] font-extrabold ${tintText}`}>{value}</div>
      <div className={`mt-0.5 whitespace-nowrap text-[11px] ${tintText === 'text-ink' ? 'text-ink-muted' : tintText}`}>{label}</div>
    </div>
  )
}
