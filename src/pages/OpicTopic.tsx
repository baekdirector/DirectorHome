import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AccessGate } from '../components/AccessGate'
import { OpicNav } from '../components/OpicNav'
import { OpicQuestionList } from '../components/OpicQuestionList'
import { Loading } from '../components/Loading'
import { LoadError } from '../components/LoadError'
import {
  getTopicQuestions,
  getTopics,
  type OpicQuestionSummary,
  type OpicTopic as Topic,
} from '../lib/opic'

export function OpicTopic() {
  return (
    <AccessGate>
      <OpicTopicContent />
    </AccessGate>
  )
}

function OpicTopicContent() {
  const { topicId } = useParams()
  const id = Number(topicId)
  const { topic, questions, failed, notFound, reload } = useTopicData(id)

  return (
    <div className="flex min-h-svh flex-col bg-op-bg font-hh-sans text-op-ink lg:flex-row">
      <OpicNav />

      {/* 넓은 화면은 스크립트 뷰어와 같은 3단을 쓴다. 문항을 고르기 전에는 본문 자리가 빈 상태다. */}
      {topic && questions && (
        <aside className="hidden w-[330px] flex-none border-r border-op-border bg-op-surface px-4 py-6 lg:block lg:h-svh lg:overflow-y-auto">
          <OpicQuestionList topic={topic} questions={questions} />
        </aside>
      )}

      <main className="min-w-0 flex-1 px-5 pb-12 pt-3 lg:px-10 lg:pt-7">
        {failed && <LoadError screen={false} message="문항을 불러오지 못했어요." onRetry={reload} />}
        {notFound && <OpicNotFound what="주제" />}
        {!failed && !notFound && !topic && <Loading />}
        {topic && questions && (
          <>
            <div className="lg:hidden">
              <OpicQuestionList topic={topic} questions={questions} />
            </div>
            <div className="hidden h-full items-center justify-center lg:flex">
              <p className="m-0 text-[15px] text-op-ink-muted">왼쪽에서 문항을 고르세요.</p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

/** 없는 id로 직접 들어온 경우. 에러 화면 대신 돌아갈 길을 준다. */
export function OpicNotFound({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-start gap-3 pt-6">
      <p className="m-0 text-[15px] text-op-ink-muted">{what}를 찾을 수 없어요.</p>
      <Link
        to="/opic"
        className="rounded-xl bg-op-ink px-4 py-2.5 text-[14px] font-semibold text-white no-underline"
      >
        주제 목록으로
      </Link>
    </div>
  )
}

/** 주제 정보와 문항 목록을 함께 받아온다. 스크립트 뷰어의 PC 3단에서도 쓴다. */
export function useTopicData(id: number) {
  const [topic, setTopic] = useState<Topic | null>(null)
  const [questions, setQuestions] = useState<OpicQuestionSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const reload = async () => {
    setFailed(false)
    setNotFound(false)
    if (!Number.isFinite(id)) {
      setNotFound(true)
      return
    }
    try {
      const [topics, qs] = await Promise.all([getTopics(), getTopicQuestions(id)])
      const found = topics.find((t) => t.id === id)
      if (!found) {
        setNotFound(true)
        return
      }
      setTopic(found)
      setQuestions(qs)
    } catch {
      setFailed(true)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return { topic, questions, failed, notFound, reload }
}
