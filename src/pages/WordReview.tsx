import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '../components/icons'
import { BlockingOverlay } from '../components/BlockingOverlay'
import { Loading, Spinner } from '../components/Loading'
import { CategoryPicker } from '../components/CategoryPicker'
import { SpeakButton } from '../components/SpeakButton'
import {
  addWord as dbAddWord,
  createWordSet,
  getWordSetCategories,
  updateWordSetCategory,
  type WordSetCategory,
  deleteWord as dbDeleteWord,
  getWordSet,
  getWordsBySet,
  updateWord as dbUpdateWord,
  updateWordSetTitle,
  type WordRecord,
} from '../lib/db'
import type { ParsedWord } from '../lib/parseWords'
import type { ParsedVerb } from '../lib/verbs'
import { clearWordSetsCache } from '../lib/wordSetsCache'
import { useProtectedAction } from '../lib/useProtectedAction'

type Kind = 'vocab' | 'verb'

interface Row {
  key: string
  id?: number
  term: string
  meaning: string
  /** 동사 단어장에서만 쓴다. */
  past: string
  participle: string
}

/** 저장·시험에 쓸 수 있는 줄인지. 동사는 세 변화형이 모두 있어야 한 문항이 된다. */
function isComplete(row: Row, kind: Kind): boolean {
  if (!row.term.trim() || !row.meaning.trim()) return false
  return kind === 'vocab' || (!!row.past.trim() && !!row.participle.trim())
}

function isIdiom(term: string) {
  return term.trim().includes(' ')
}

function defaultTitle() {
  const d = new Date()
  return `${d.getMonth() + 1}월 ${d.getDate()}일 단어장`
}

export function WordReview() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation() as {
    state?: { words?: ParsedWord[]; verbs?: ParsedVerb[]; title?: string; kind?: Kind }
  }
  const navigate = useNavigate()

  const wordSetId = id ? Number(id) : undefined
  const isExisting = wordSetId !== undefined

  const [title, setTitle] = useState(() => location.state?.title || defaultTitle())
  // 새 단어장은 입력 화면이 정한 형식을 그대로 쓰고, 기존 단어장은 불러올 때 알게 된다.
  const [kind, setKind] = useState<Kind>(location.state?.kind === 'verb' ? 'verb' : 'vocab')
  const [categories, setCategories] = useState<WordSetCategory[]>([])
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [rows, setRows] = useState<Row[]>(() => {
    if (isExisting) return []
    if (location.state?.kind === 'verb') {
      return (location.state?.verbs ?? []).map((v, i) => ({
        key: `new-${i}`,
        term: v.term,
        meaning: v.meaning,
        past: v.past,
        participle: v.participle,
      }))
    }
    return (location.state?.words ?? []).map((w, i) => ({
      key: `new-${i}`,
      term: w.term,
      meaning: w.meaning,
      past: '',
      participle: '',
    }))
  })
  const [loaded, setLoaded] = useState(!isExisting)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // 이미 저장된 단어장을 고치는 중에 서버로 나가는 요청 수, 그리고 그 요청이 실패했는지.
  const [pending, setPending] = useState(0)
  const [syncError, setSyncError] = useState('')
  const savingRef = useRef(false)
  // 저장과 삭제는 비밀번호 뒤에 둔다. 아무나 아이 단어장을 바꾸지 못하게.
  const { run: runProtected, dialog: passwordDialog } = useProtectedAction()

  useEffect(() => {
    if (!isExisting) return
    let cancelled = false
    ;(async () => {
      const set = await getWordSet(wordSetId!)
      const words = await getWordsBySet(wordSetId!)
      if (cancelled) return
      setTitle(set?.title ?? defaultTitle())
      setKind(set?.kind === 'verb' ? 'verb' : 'vocab')
      setCategoryId(set?.categoryId ?? null)
      setRows(
        words.map((w) => ({
          key: `db-${w.id}`,
          id: w.id,
          term: w.term,
          meaning: w.meaning,
          past: w.past ?? '',
          participle: w.participle ?? '',
        })),
      )
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [isExisting, wordSetId])

  useEffect(() => {
    getWordSetCategories()
      .then(setCategories)
      // 분류는 단어 입력의 곁다리다. 못 불러와도 "미분류"로 저장할 수 있어야 한다.
      .catch(() => setCategories([]))
  }, [])

  const validCount = useMemo(() => rows.filter((r) => isComplete(r, kind)).length, [rows, kind])

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  /** 서버로 나가는 요청이 끝날 때까지 상단에 스피너를 보여주고, 실패하면 알려준다. */
  async function track(request: Promise<unknown>) {
    setPending((n) => n + 1)
    setSyncError('')
    try {
      await request
    } catch {
      setSyncError('변경 내용을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.')
    } finally {
      setPending((n) => n - 1)
    }
  }

  async function commitRow(row: Row) {
    if (!isExisting || row.id === undefined) return
    const patch: Partial<Omit<WordRecord, 'id' | 'wordSetId'>> = {
      term: row.term,
      meaning: row.meaning,
      isIdiom: kind === 'verb' ? false : isIdiom(row.term),
    }
    if (kind === 'verb') {
      patch.past = row.past
      patch.participle = row.participle
    }
    await track(dbUpdateWord(row.id, patch))
  }

  async function removeRow(row: Row) {
    setRows((prev) => prev.filter((r) => r.key !== row.key))
    if (isExisting && row.id !== undefined) {
      await track(dbDeleteWord(row.id))
    }
  }

  async function addRow() {
    if (isExisting) {
      setPending((n) => n + 1)
      setSyncError('')
      try {
        const newId = await dbAddWord({ wordSetId: wordSetId!, term: '', meaning: '', isIdiom: false })
        setRows((prev) => [
          ...prev,
          { key: `db-${newId}`, id: newId, term: '', meaning: '', past: '', participle: '' },
        ])
      } catch {
        setSyncError('단어를 추가하지 못했어요. 인터넷 연결을 확인해 주세요.')
      } finally {
        setPending((n) => n - 1)
      }
    } else {
      setRows((prev) => [
        ...prev,
        { key: `new-${Date.now()}`, term: '', meaning: '', past: '', participle: '' },
      ])
    }
  }

  async function save() {
    if (savingRef.current) return // 응답이 늦을 때 다시 눌러 단어장이 두 번 만들어지지 않게
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    try {
      const cleaned = rows
        .filter((r) => isComplete(r, kind))
        .map((r) => ({
          term: r.term.trim(),
          meaning: r.meaning.trim(),
          isIdiom: kind === 'verb' ? false : isIdiom(r.term),
          past: kind === 'verb' ? r.past.trim() : undefined,
          participle: kind === 'verb' ? r.participle.trim() : undefined,
        }))
      const newId = await createWordSet(title.trim() || defaultTitle(), cleaned, kind, categoryId)
      clearWordSetsCache() // 목록을 다시 불러와서 방금 저장한 단어장이 보이게 한다
      navigate('/wordsets', { state: { savedId: newId } })
    } catch {
      setSaveError('저장하지 못했어요. 잠시 후 다시 시도해주세요.')
      savingRef.current = false
      setSaving(false)
    }
  }

  if (!loaded) {
    return <Loading screen />
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <div className="flex flex-none items-center gap-3 px-[18px] pt-[18px]">
        <button
          type="button"
          aria-label="뒤로가기"
          onClick={() => navigate(isExisting ? '/' : '/input')}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-ink"
        >
          <ArrowLeftIcon />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (isExisting) track(updateWordSetTitle(wordSetId!, title))
          }}
          className="m-0 min-w-0 flex-1 bg-transparent text-[17px] font-bold outline-none"
        />
        {pending > 0 && <Spinner size={18} label="저장 중" />}
      </div>

      <div className="flex-none px-[22px] pt-3.5">
        <div className="mb-1.5 text-[13px] font-bold text-ink-muted">분류</div>
        <CategoryPicker
          categories={categories}
          value={categoryId}
          onChange={(next) => {
            setCategoryId(next)
            // 이미 저장된 단어장이면 고르는 즉시 반영한다(새 단어장은 저장할 때 함께 간다).
            if (isExisting) track(updateWordSetCategory(wordSetId!, next))
          }}
          onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
        />
      </div>

      <div className="flex flex-none items-center justify-between px-[22px] pb-1.5 pt-3.5">
        <span className="text-[13px] text-ink-muted">
          총 <b className="text-ink">{rows.length}개</b> 단어 · 수정 후 저장하세요
        </span>
      </div>
      {syncError && <p className="m-0 px-[22px] pb-1.5 text-[12.5px] font-semibold text-error">{syncError}</p>}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-[22px] pb-3.5">
        {rows.map((row, idx) => (
          <div
            key={row.key}
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
          >
            <span className="w-4 text-xs text-ink-muted">{idx + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {kind === 'verb' ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {(['term', 'past', 'participle'] as const).map((field) => (
                    <input
                      key={field}
                      value={row[field]}
                      aria-label={
                        field === 'term' ? '현재형' : field === 'past' ? '과거형' : '과거분사형'
                      }
                      placeholder={
                        field === 'term' ? '현재형' : field === 'past' ? '과거형' : '과거분사형'
                      }
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      onChange={(e) => patchRow(row.key, { [field]: e.target.value })}
                      onBlur={() => commitRow(row)}
                      className="min-w-0 rounded-lg border border-border px-2 py-1.5 font-display text-[15px] font-bold outline-none focus:border-primary"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={row.term}
                    placeholder="영어 단어"
                    onChange={(e) => patchRow(row.key, { term: e.target.value })}
                    onBlur={() => commitRow(row)}
                    className="min-w-0 flex-1 rounded-lg border border-border px-2 py-1.5 font-display text-[17.5px] font-bold outline-none focus:border-primary"
                  />
                  {isIdiom(row.term) && (
                    <span className="flex-none rounded-md bg-accent-tint px-1.5 py-0.5 text-[10px] font-bold text-accent-dark">
                      숙어
                    </span>
                  )}
                </div>
              )}
              <input
                value={row.meaning}
                placeholder="한글 뜻"
                onChange={(e) => patchRow(row.key, { meaning: e.target.value })}
                onBlur={() => commitRow(row)}
                className="rounded-lg border border-border px-2 py-1.5 text-[13px] outline-none focus:border-primary"
              />
            </div>
            {row.term.trim() && <SpeakButton term={row.term} />}
            <button
              type="button"
              aria-label="삭제"
              onClick={() => runProtected(() => void removeRow(row))}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-surface-alt text-error"
            >
              <TrashIcon width={15} height={15} />
            </button>
          </div>
        ))}

        {rows.length === 0 && (
          <p className="py-6 text-center text-[13px] text-ink-muted">
            아직 단어가 없어요. 아래 버튼으로 직접 추가해보세요.
          </p>
        )}

        <button
          type="button"
          onClick={addRow}
          className="flex items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-border p-3.5 text-[13.5px] font-semibold text-ink-muted"
        >
          <PlusIcon width={15} height={15} />
          단어 직접 추가하기
        </button>
      </div>

      <div className="flex flex-none flex-col gap-2 border-t border-border bg-surface px-[22px] pb-5 pt-3.5">
        {isExisting ? (
          <button
            type="button"
            disabled={validCount === 0}
            onClick={() => navigate(`/quiz/${wordSetId}`)}
            className="rounded-2xl bg-primary p-[15px] text-center text-[15.5px] font-bold text-white disabled:opacity-40"
          >
            테스트 시작
          </button>
        ) : (
          <>
            {saveError && <p className="m-0 text-center text-[13px] font-semibold text-error">{saveError}</p>}
            <button
              type="button"
              disabled={validCount === 0 || saving}
              onClick={() => runProtected(() => void save())}
              className="rounded-2xl bg-primary p-[15px] text-center text-[15.5px] font-bold text-white disabled:opacity-40"
            >
              {saving ? '저장 중...' : '저장하기'}
            </button>
          </>
        )}
      </div>
      <BlockingOverlay open={saving} message="단어장을 저장하고 있어요..." />
      {passwordDialog}
    </div>
  )
}
