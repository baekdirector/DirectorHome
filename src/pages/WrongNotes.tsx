import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomNav } from '../components/BottomNav'
import { Loading, Spinner } from '../components/Loading'
import { SpeakButton } from '../components/SpeakButton'
import { getWrongNotes, setWrongNoteResolved, type WrongNote } from '../lib/db'
import { formatDate } from '../lib/quiz'

type Tab = 'active' | 'resolved'

export function WrongNotes() {
  const navigate = useNavigate()
  const [notes, setNotes] = useState<WrongNote[] | null>(null)
  const [tab, setTab] = useState<Tab>('active')
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState<number | null>(null)

  useEffect(() => {
    getWrongNotes()
      .then(setNotes)
      .catch(() => {
        setNotes([])
        setError('오답 노트를 불러오지 못했어요.')
      })
  }, [])

  const active = notes?.filter((n) => n.resolvedAt === null) ?? []
  const resolved = notes?.filter((n) => n.resolvedAt !== null) ?? []
  const shown = tab === 'active' ? active : resolved

  async function toggleResolved(note: WrongNote) {
    if (pendingId !== null) return
    const nextResolved = note.resolvedAt === null
    setError('')
    setPendingId(note.wordId)
    try {
      await setWrongNoteResolved(note.wordId, nextResolved)
      setNotes((prev) =>
        prev?.map((n) => (n.wordId === note.wordId ? { ...n, resolvedAt: nextResolved ? Date.now() : null } : n)) ?? prev,
      )
    } catch {
      setError('저장하지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <div className="flex-1 px-[22px] pb-4 pt-6">
        <h1 className="m-0 text-[22px] font-extrabold">오답 노트</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
          틀린 단어가 자동으로 모여요. 다음 테스트 첫 시도에서 맞히면 &lsquo;외운 단어&rsquo;로 옮겨져요.
        </p>

        <div role="tablist" className="mt-4 flex gap-2">
          <TabButton selected={tab === 'active'} onClick={() => setTab('active')}>
            틀린 단어 {notes ? active.length : ''}
          </TabButton>
          <TabButton selected={tab === 'resolved'} onClick={() => setTab('resolved')}>
            외운 단어 {notes ? resolved.length : ''}
          </TabButton>
        </div>

        {error && <p className="mt-3 text-[13px] font-semibold text-error">{error}</p>}

        <div className="mt-4 flex flex-col gap-2.5">
          {notes === null ? (
            <Loading />
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-ink-muted">
              {tab === 'active'
                ? '틀린 단어가 없어요. 테스트에서 틀린 단어가 여기에 모여요.'
                : '아직 외운 단어로 옮겨진 단어가 없어요.'}
            </p>
          ) : (
            shown.map((n) => (
              <div key={n.wordId} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="break-words font-display text-[19px] font-bold">
                      {n.past ? `${n.term} · ${n.past} · ${n.participle}` : n.term}
                    </span>
                    {n.isIdiom && (
                      <span className="flex-none rounded-md bg-accent-tint px-1.5 py-0.5 text-[10px] font-bold text-accent-dark">
                        숙어
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 break-words text-[13.5px]">{n.meaning}</div>
                  <div className="mt-1.5 text-[11.5px] text-ink-muted">
                    {n.wrongCount}번 틀림 · {formatDate(n.lastWrongAt)} · {n.wordSetTitle}
                  </div>
                </div>
                <div className="flex flex-none flex-col items-stretch gap-1.5">
                  <SpeakButton term={n.term} className="self-end" />
                  <button
                    type="button"
                    onClick={() => toggleResolved(n)}
                    disabled={pendingId !== null}
                    className={`flex min-h-[28px] items-center justify-center rounded-[10px] px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-60 ${
                      n.resolvedAt === null ? 'bg-success-tint text-success' : 'bg-surface-alt text-ink-muted'
                    }`}
                  >
                    {pendingId === n.wordId ? (
                      <Spinner size={14} label="저장 중" />
                    ) : n.resolvedAt === null ? (
                      '외웠어요'
                    ) : (
                      '다시 담기'
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {tab === 'active' && active.length > 0 && (
        <div className="flex-none border-t border-border bg-surface px-[22px] pb-3 pt-3">
          <button
            type="button"
            onClick={() => navigate('/wrong/quiz')}
            className="w-full rounded-2xl bg-accent p-[15px] text-center text-[15.5px] font-bold text-white"
          >
            오답 {active.length}개 테스트 시작
          </button>
        </div>
      )}
      <BottomNav />
    </div>
  )
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`flex-1 rounded-2xl border p-2.5 text-[14px] font-semibold ${
        selected ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-ink'
      }`}
    >
      {children}
    </button>
  )
}
