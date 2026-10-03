import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Loading } from '../components/Loading'
import { PencilIcon, PlusIcon, TrashIcon } from '../components/icons'
import { useProfile } from '../components/ProfileGate'
import { CategoryPicker } from '../components/CategoryPicker'
import {
  createWordSetCategory,
  deleteWordSet,
  deleteWordSetCategory,
  getWordSetCategories,
  getWordSets,
  renameWordSetCategory,
  updateWordSetCategory,
  type WordSetCategory,
} from '../lib/db'
import { PROFILE_LABEL } from '../lib/profile'
import { groupByCategory } from '../lib/wordSetGroups'
import type { WordSetItem } from '../lib/wordSetsCache'

function createdLabel(createdAt: number): string {
  const d = new Date(createdAt)
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`
}

/**
 * 고른 아이의 단어장을 분류별로 묶어 보여주고, 분류를 만들고 고치고 지우는 자리.
 * 이름 수정과 단어 편집은 아이 화면(/wordsets/:id)이 이미 갖고 있으므로 그리로 보낸다.
 */
export function AdminWordSets() {
  const { owner } = useProfile()
  const [sets, setSets] = useState<WordSetItem[] | null>(null)
  const [categories, setCategories] = useState<WordSetCategory[]>([])
  const [pendingDelete, setPendingDelete] = useState<WordSetItem | null>(null)
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState<WordSetCategory | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function reload() {
    const [freshSets, freshCategories] = await Promise.all([getWordSets(), getWordSetCategories()])
    setSets(freshSets)
    setCategories(freshCategories)
  }

  useEffect(() => {
    setSets(null)
    setError('')
    Promise.all([getWordSets(), getWordSetCategories()])
      .then(([freshSets, freshCategories]) => {
        setSets(freshSets)
        setCategories(freshCategories)
      })
      .catch(() => {
        setSets([])
        setError('단어장을 불러오지 못했어요. 잠시 후 다시 시도해주세요.')
      })
  }, [owner])

  /** 성공했으면 true. 실패했을 때 입력값을 지우지 않으려고 결과를 돌려준다. */
  async function run(action: () => Promise<unknown>, failure: string): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    setError('')
    try {
      await action()
      await reload()
      return true
    } catch {
      setError(failure)
      return false
    } finally {
      setBusy(false)
    }
  }

  const totalWords = (sets ?? []).reduce((n, s) => n + s.count, 0)
  const groups = sets === null ? [] : groupByCategory(sets, categories, { includeEmpty: true })

  return (
    <>
      <section>
        <h3 className="m-0 text-[15px] font-extrabold">{PROFILE_LABEL[owner]} 분류</h3>
        <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          분류를 지워도 단어장은 사라지지 않고 미분류로 돌아가요.
        </p>

        <div className="mt-2.5 flex gap-2">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || newCategory.trim() === '') return
              void run(() => createWordSetCategory(newCategory.trim()), '분류를 만들지 못했어요.').then(
                (ok) => ok && setNewCategory(''),
              )
            }}
            placeholder="새 분류 이름 (예: Listening)"
            aria-label="새 분류 이름"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={busy || newCategory.trim() === ''}
            onClick={() =>
              void run(() => createWordSetCategory(newCategory.trim()), '분류를 만들지 못했어요.').then(
                (ok) => ok && setNewCategory(''),
              )
            }
            className="flex-none rounded-xl bg-primary px-4 text-[14px] font-bold text-white disabled:opacity-40"
          >
            추가
          </button>
        </div>

        <div className="mt-2.5 flex flex-col gap-2">
          {categories.length === 0 ? (
            <p className="m-0 py-3 text-center text-[13px] text-ink-muted">아직 분류가 없어요.</p>
          ) : (
            categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-3">
                {renamingId === c.id ? (
                  <>
                    <input
                      value={draftName}
                      autoFocus
                      onChange={(e) => setDraftName(e.target.value)}
                      aria-label="분류 이름"
                      className="min-w-0 flex-1 rounded-lg border border-primary px-2.5 py-1.5 text-[14px] font-bold outline-none"
                    />
                    <button
                      type="button"
                      disabled={busy || draftName.trim() === ''}
                      onClick={() =>
                        void run(
                          () => renameWordSetCategory(c.id, draftName.trim()),
                          '이름을 바꾸지 못했어요.',
                        ).then((ok) => ok && setRenamingId(null))
                      }
                      className="flex-none rounded-[10px] bg-primary px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-40"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="flex-none rounded-[10px] bg-surface-alt px-3 py-1.5 text-[13px] font-semibold text-ink-muted"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{c.name}</span>
                    <span className="flex-none text-[12.5px] text-ink-muted">단어장 {c.setCount}개</span>
                    <button
                      type="button"
                      aria-label={`${c.name} 이름 바꾸기`}
                      onClick={() => {
                        setRenamingId(c.id)
                        setDraftName(c.name)
                      }}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-surface-alt text-ink-muted"
                    >
                      <PencilIcon width={14} height={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${c.name} 분류 삭제`}
                      onClick={() => setPendingCategoryDelete(c)}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-surface-alt text-error"
                    >
                      <TrashIcon width={14} height={14} />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </section>

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
            <div className="mt-1.5 flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-2">
                  <div className="flex items-baseline gap-2">
                    <h4 className="m-0 text-[13.5px] font-extrabold text-ink">{group.name}</h4>
                    <span className="text-[12px] text-ink-muted">{group.sets.length}개</span>
                  </div>
                  {group.sets.length === 0 ? (
                    <p className="m-0 text-[12.5px] text-ink-muted">여기에 담긴 단어장이 없어요.</p>
                  ) : (
                    group.sets.map((s) => (
                      <div key={s.id} className="rounded-2xl border border-border bg-surface p-3.5">
                        <div className="flex items-center gap-3">
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
                        <div className="mt-2.5">
                          <CategoryPicker
                            categories={categories}
                            value={s.categoryId}
                            disabled={busy}
                            onChange={(next) =>
                              void run(
                                () => updateWordSetCategory(s.id, next),
                                '분류를 바꾸지 못했어요.',
                              )
                            }
                            onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="단어장을 지울까요?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}"의 단어 ${pendingDelete.count}개와 그 단어의 오답 노트가 함께 사라져요. 시험 기록은 남아요.`
            : undefined
        }
        confirmLabel={busy ? '지우는 중...' : '지우기'}
        danger
        onConfirm={() => {
          const target = pendingDelete
          if (!target) return
          setPendingDelete(null)
          void run(() => deleteWordSet(target.id), '단어장을 지우지 못했어요.')
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingCategoryDelete !== null}
        title="분류를 지울까요?"
        description={
          pendingCategoryDelete
            ? `"${pendingCategoryDelete.name}"에 담긴 단어장 ${pendingCategoryDelete.setCount}개는 사라지지 않고 미분류로 돌아가요.`
            : undefined
        }
        confirmLabel={busy ? '지우는 중...' : '지우기'}
        danger
        onConfirm={() => {
          const target = pendingCategoryDelete
          if (!target) return
          setPendingCategoryDelete(null)
          void run(() => deleteWordSetCategory(target.id), '분류를 지우지 못했어요.')
        }}
        onCancel={() => setPendingCategoryDelete(null)}
      />
    </>
  )
}
