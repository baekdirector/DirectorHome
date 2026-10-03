import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Loading } from '../components/Loading'
import { PlusIcon, TrashIcon } from '../components/icons'
import { useProfile } from '../components/ProfileGate'
import { deleteWordSet, getWordSets } from '../lib/db'
import { PROFILE_LABEL } from '../lib/profile'
import type { WordSetItem } from '../lib/wordSetsCache'

function createdLabel(createdAt: number): string {
  const d = new Date(createdAt)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

/**
 * 고른 아이의 단어장을 부모가 훑어보고 지우는 자리.
 * 이름 수정과 단어 편집은 아이 화면(/wordsets/:id)이 이미 갖고 있으므로 그리로 보낸다.
 */
export function AdminWordSets() {
  const { owner } = useProfile()
  const [sets, setSets] = useState<WordSetItem[] | null>(null)
  const [pendingDelete, setPendingDelete] = useState<WordSetItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSets(null)
    setError('')
    getWordSets()
      .then(setSets)
      .catch(() => {
        setSets([])
        setError('단어장을 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
      })
  }, [owner])

  async function confirmDelete() {
    const target = pendingDelete
    if (!target || deleting) return
    setDeleting(true)
    setError('')
    try {
      await deleteWordSet(target.id)
      setSets((prev) => (prev ?? []).filter((s) => s.id !== target.id))
    } catch {
      setError('단어장을 지우지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  const totalWords = (sets ?? []).reduce((n, s) => n + s.count, 0)

  return (
    <section>
      <h3 className="m-0 text-[15px] font-extrabold">{PROFILE_LABEL[owner]} 단어장</h3>
      <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-ink-muted">
        위에서 아이를 바꾸면 그 아이의 단어장이 보여요. 새로 만든 단어장은 지금 고른 아이 것으로
        저장돼요.
      </p>

      <Link
        to="/input"
        className="mt-3 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-3.5 text-[14px] font-bold text-primary no-underline"
      >
        <PlusIcon width={16} height={16} />새 단어장 만들기 ({PROFILE_LABEL[owner]})
      </Link>

      {error && <p className="m-0 mt-2 text-[12.5px] font-semibold text-error">{error}</p>}

      {sets === null ? (
        <Loading />
      ) : sets.length === 0 ? (
        <p className="m-0 py-6 text-center text-[13.5px] text-ink-muted">
          아직 단어장이 없어요. 위 버튼으로 만들어주세요.
        </p>
      ) : (
        <>
          <p className="m-0 mt-4 text-[12.5px] font-bold text-ink-muted">
            단어장 {sets.length}개 · 단어 {totalWords}개
          </p>
          <div className="mt-1.5 flex flex-col gap-2">
            {sets.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
              >
                <Link to={`/wordsets/${s.id}`} className="min-w-0 flex-1 no-underline">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-words text-[14px] font-bold text-ink">{s.title}</span>
                    {s.kind === 'verb' && (
                      <span className="rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-bold text-accent-dark">
                        3단변화
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink-muted">
                    단어 {s.count}개 · {createdLabel(s.createdAt)}
                  </div>
                </Link>
                <button
                  type="button"
                  aria-label={`${s.title} 삭제`}
                  onClick={() => setPendingDelete(s)}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-surface-alt text-error"
                >
                  <TrashIcon width={15} height={15} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="단어장을 지울까요?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}"의 단어 ${pendingDelete.count}개와 그 단어의 오답 노트가 함께 사라져요. 시험 기록은 남아요.`
            : undefined
        }
        confirmLabel={deleting ? '지우는 중...' : '지우기'}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  )
}
