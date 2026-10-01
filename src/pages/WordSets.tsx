import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/icons'
import { BottomNav } from '../components/BottomNav'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Loading, Spinner } from '../components/Loading'
import { deleteWordSet, getWordSetAttemptCounts, getWordSets, updateWordSetTitle } from '../lib/db'
import { loadWordSetsCache, saveWordSetsCache, type WordSetItem } from '../lib/wordSetsCache'
import { useSlowLoading } from '../lib/useSlowLoading'
import { useProtectedAction } from '../lib/useProtectedAction'

export function WordSets() {
  // 단어장을 막 저장하고 넘어온 경우 그 단어장을 표시한다.
  const savedId = (useLocation().state as { savedId?: number } | null)?.savedId
  const [sets, setSets] = useState<WordSetItem[] | null>(loadWordSetsCache)
  const [refreshing, setRefreshing] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [error, setError] = useState('')
  const [attemptCounts, setAttemptCounts] = useState<Map<number, number>>(new Map())
  const [pendingDelete, setPendingDelete] = useState<WordSetItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const slow = useSlowLoading(refreshing && sets !== null)
  // 이름 수정과 삭제는 비밀번호 뒤에 둔다. 아무나 아이 단어장을 바꾸지 못하게.
  const { run: runProtected, dialog: passwordDialog } = useProtectedAction()

  useEffect(() => {
    getWordSets()
      .then((fresh) => {
        setSets(fresh)
        saveWordSetsCache(fresh)
      })
      .catch(() => setSets((prev) => prev ?? []))
      .finally(() => setRefreshing(false))
    getWordSetAttemptCounts()
      .then((rows) => setAttemptCounts(new Map(rows.map((r) => [r.wordSetId, r.count]))))
      .catch(() => {})
  }, [])

  async function confirmDelete() {
    const target = pendingDelete
    if (!target || deleting) return
    setDeleting(true)
    setError('')
    try {
      await deleteWordSet(target.id)
      const next = (sets ?? []).filter((s) => s.id !== target.id)
      setSets(next)
      saveWordSetsCache(next)
      setPendingDelete(null)
    } catch {
      setError('단어장을 지우지 못했어요. 잠시 후 다시 시도해주세요.')
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  function startEditing(set: WordSetItem) {
    setEditingId(set.id)
    setDraftTitle(set.title)
    setError('')
  }

  async function commitRename(set: WordSetItem) {
    const title = draftTitle.trim()
    if (!title || title === set.title) {
      setEditingId(null)
      return
    }
    setRenaming(true)
    try {
      await updateWordSetTitle(set.id, title)
      const next = (sets ?? []).map((s) => (s.id === set.id ? { ...s, title } : s))
      setSets(next)
      saveWordSetsCache(next)
      setEditingId(null)
    } catch {
      setError('이름을 저장하지 못했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setRenaming(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <div className="flex-1 px-[22px] pb-4 pt-6">
        <h1 className="m-0 text-[22px] font-extrabold">내 단어장</h1>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">저장된 단어장을 확인하고 테스트를 시작해보세요</p>

        <Link
          to="/input"
          className="mt-4 flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-border p-3.5 text-[13.5px] font-semibold text-ink-muted"
        >
          <PlusIcon width={15} height={15} />
          새 단어장 만들기
        </Link>

        {slow && (
          <p className="mb-0 mt-3 text-center text-[12.5px] leading-relaxed text-ink-muted">
            최신 목록을 가져오는 중이에요. 서버가 깨어나는 데 시간이 걸릴 수 있어요.
          </p>
        )}
        {error && <p className="mb-0 mt-3 text-[13px] font-semibold text-error">{error}</p>}

        <div className="mt-4 flex flex-col gap-2.5">
          {sets === null ? (
            <Loading />
          ) : sets.length === 0 ? (
            <p className="py-8 text-center text-[13.5px] text-ink-muted">
              아직 단어장이 없어요. 단어를 입력해서 첫 단어장을 만들어보세요.
            </p>
          ) : (
            sets.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-2 rounded-2xl border p-4 ${
                  s.id === savedId ? 'border-primary bg-primary-tint/40' : 'border-border bg-surface'
                }`}
              >
                {editingId === s.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      runProtected(() => void commitRename(s))
                    }}
                  >
                    <input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      aria-label="단어장 이름"
                      autoFocus
                      className="min-w-0 flex-1 rounded-lg border border-primary px-2.5 py-2 text-[15.5px] font-bold outline-none"
                    />
                    <button
                      type="submit"
                      disabled={renaming}
                      className="flex min-w-[52px] flex-none items-center justify-center rounded-[10px] bg-primary px-3 py-2 text-[13px] font-bold text-white disabled:opacity-70"
                    >
                      {renaming ? <Spinner size={16} tone="light" label="저장 중" /> : '저장'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={renaming}
                      className="flex-none rounded-[10px] bg-surface-alt px-3 py-2 text-[13px] font-semibold text-ink-muted disabled:opacity-50"
                    >
                      취소
                    </button>
                  </form>
                ) : (
                  <>
                    <Link to={`/wordsets/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3.5">
                      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-primary-tint">
                        <BookIcon width={20} height={20} className="text-primary" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* 수정·삭제 버튼이 오른쪽을 차지하므로 제목은 한 줄을 통째로 쓴다.
                            배지를 제목 옆에 두면 좁은 화면에서 제목이 "동사 3단…"으로 잘린다. */}
                        <div className="truncate text-[15.5px] font-bold">{s.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-muted">
                          {s.kind === 'verb' && (
                            <span className="rounded-full bg-accent-tint px-1.5 py-0.5 text-[10.5px] font-bold text-accent-dark">
                              3단변화
                            </span>
                          )}
                          <span>
                            단어 {s.count}개 · {new Date(s.createdAt).toLocaleDateString('ko-KR')}
                            {(attemptCounts.get(s.id) ?? 0) > 0 && ` · 테스트 ${attemptCounts.get(s.id)}회 완료`}
                          </span>
                        </div>
                        {s.id === savedId && (
                          <div className="mt-0.5 text-[12.5px] font-bold text-primary">방금 저장했어요</div>
                        )}
                      </div>
                    </Link>
                    <button
                      type="button"
                      aria-label={`${s.title} 이름 변경`}
                      onClick={() => startEditing(s)}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-surface-alt text-ink-muted"
                    >
                      <PencilIcon width={15} height={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${s.title} 삭제`}
                      onClick={() => runProtected(() => setPendingDelete(s))}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-surface-alt text-error"
                    >
                      <TrashIcon width={15} height={15} />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <BottomNav />
      <ConfirmDialog
        open={pendingDelete !== null}
        title="단어장을 지울까요?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}"와 단어 ${pendingDelete.count}개가 사라져요. 지난 테스트 결과는 그대로 남아요.`
            : ''
        }
        confirmLabel={deleting ? '지우는 중...' : '지우기'}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      {passwordDialog}
    </div>
  )
}
