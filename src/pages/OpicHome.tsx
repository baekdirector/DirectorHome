import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccessGate } from '../components/AccessGate'
import { OpicNav } from '../components/OpicNav'
import { OpicProgressBar } from '../components/OpicProgressBar'
import { Loading } from '../components/Loading'
import { LoadError } from '../components/LoadError'
import { getTopics, type OpicTopic } from '../lib/opic'

type StarFilter = 0 | 1 | 2 | 3

export function OpicHome() {
  return (
    <AccessGate>
      <OpicHomeContent />
    </AccessGate>
  )
}

function OpicHomeContent() {
  const [topics, setTopics] = useState<OpicTopic[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [stars, setStars] = useState<StarFilter>(0)

  const load = async () => {
    setFailed(false)
    try {
      setTopics(await getTopics())
    } catch {
      setFailed(true)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const totals = useMemo(() => {
    const t = topics ?? []
    return {
      total: t.reduce((s, x) => s + x.total, 0),
      done: t.reduce((s, x) => s + x.done, 0),
      ok: t.reduce((s, x) => s + x.ok, 0),
      weak: t.reduce((s, x) => s + x.weak, 0),
    }
  }, [topics])

  const shown = (topics ?? []).filter((t) => t.kind === 'topic' && (stars === 0 || t.stars === stars))
  const roleplays = (topics ?? []).filter((t) => t.kind === 'roleplay')

  return (
    <div className="flex min-h-svh flex-col bg-op-bg font-hh-sans text-op-ink lg:flex-row">
      <OpicNav />
      <main className="min-w-0 flex-1 px-5 pb-12 lg:px-10 lg:pt-7">
        <h1 className="pt-3 text-[22px] font-bold tracking-tight lg:pt-0 lg:text-[26px]">주제별 스크립트</h1>

        {failed && <LoadError screen={false} message="스크립트를 불러오지 못했어요." onRetry={load} />}
        {!failed && !topics && <Loading />}

        {topics && (
          <>
            <section className="mt-4 rounded-2xl border border-op-border bg-white p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-op-ink-muted">전체 진도</span>
                <span className="text-[13px] text-op-ink-muted">{totals.total}문항</span>
              </div>
              <div className="mt-3">
                <OpicProgressBar {...totals} />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                <span className="font-semibold text-op-done">암기완료 {totals.done}</span>
                <span className="font-semibold text-op-ok">그럭저럭 {totals.ok}</span>
                <span className="font-semibold text-op-weak">아직 부족 {totals.weak}</span>
                <span className="text-op-ink-muted">
                  미설정 {totals.total - totals.done - totals.ok - totals.weak}
                </span>
              </div>
            </section>

            <div className="mt-5 flex gap-1.5">
              {([0, 3, 2, 1] as StarFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStars(s)}
                  className={`h-9 rounded-full px-3.5 text-[13px] font-semibold ${
                    stars === s ? 'bg-op-ink text-white' : 'border border-op-border bg-white text-op-ink-muted'
                  }`}
                >
                  {s === 0 ? '전체' : '★'.repeat(s)}
                </button>
              ))}
            </div>

            <TopicGrid topics={shown} />

            {roleplays.length > 0 && stars === 0 && (
              <>
                <h2 className="mt-8 text-[17px] font-bold">롤플레이</h2>
                <TopicGrid topics={roleplays} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function TopicGrid({ topics }: { topics: OpicTopic[] }) {
  if (topics.length === 0) {
    return <p className="mt-4 text-[14px] text-op-ink-muted">해당하는 주제가 없어요.</p>
  }
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map((t) => (
        <Link
          key={t.id}
          to={`/opic/t/${t.id}`}
          className="flex flex-col gap-3 rounded-2xl border border-op-border bg-white p-4 text-op-ink no-underline"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[17px] font-bold">{t.name}</span>
            <span className="flex-none text-[13px] text-[#B7791F]">
              {t.stars > 0 ? '★'.repeat(t.stars) + ' · ' : ''}
              {t.total}문항
            </span>
          </div>
          <OpicProgressBar total={t.total} done={t.done} ok={t.ok} weak={t.weak} />
          <div className="flex flex-wrap gap-x-3 text-[12px]">
            <span className="text-op-done">완료 {t.done}</span>
            <span className="text-op-ok">그럭저럭 {t.ok}</span>
            <span className="text-op-weak">부족 {t.weak}</span>
            <span className="text-op-ink-muted">미설정 {t.total - t.done - t.ok - t.weak}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
