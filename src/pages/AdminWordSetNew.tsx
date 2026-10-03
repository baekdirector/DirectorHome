import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryPicker } from '../components/CategoryPicker'
import { useProfile } from '../components/ProfileGate'
import { createWordSet, getWordSetCategories, type WordSetCategory } from '../lib/db'
import { parseWordsDetailed } from '../lib/parseWords'
import { PROFILE_LABEL } from '../lib/profile'
import { parseVerbsDetailed } from '../lib/verbs'
import { clearWordSetsCache } from '../lib/wordSetsCache'
import { defaultKindFor, kindOption, kindOptionsFor, type WordSetKind } from '../lib/wordSetKinds'

function defaultTitle(): string {
  const d = new Date()
  return `${d.getMonth() + 1}월 ${d.getDate()}일 단어장`
}

/**
 * 부모 화면 안에서 단어장을 만든다. 아이 화면의 입력(/input -> 검토 -> 저장)과 달리
 * 한 화면에서 끝내고 메뉴(LNB)를 벗어나지 않는다. 단어를 고치는 일은 저장한 뒤
 * 단어장 화면에서 하면 된다.
 */
export function AdminWordSetNew() {
  const navigate = useNavigate()
  const { owner } = useProfile()
  const kindOptions = kindOptionsFor(owner)

  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<WordSetKind>(() => defaultKindFor(owner))
  const [categories, setCategories] = useState<WordSetCategory[]>([])
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // 응답이 늦을 때 다시 눌러 단어장이 두 번 만들어지지 않게 한다.
  const savingRef = useRef(false)

  // 아이를 바꾸면 그 아이에게 없는 종류가 선택된 채로 남지 않게 하고, 분류도 다시 받는다.
  useEffect(() => {
    setKind(defaultKindFor(owner))
    setCategoryId(null)
    getWordSetCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [owner])

  const selected = kindOption(owner, kind)
  const parsed = useMemo(
    () => (kind === 'verb' ? parseVerbsDetailed(text) : parseWordsDetailed(text)),
    [text, kind],
  )
  const words = 'verbs' in parsed ? parsed.verbs : parsed.words
  const skipped = parsed.skipped

  async function save() {
    if (savingRef.current || words.length === 0) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const cleaned = words.map((w) =>
        'past' in w
          ? { term: w.term, meaning: w.meaning, isIdiom: false, past: w.past, participle: w.participle }
          : { term: w.term, meaning: w.meaning, isIdiom: w.isIdiom, partOfSpeech: w.partOfSpeech },
      )
      await createWordSet(title.trim() || defaultTitle(), cleaned, kind, categoryId)
      clearWordSetsCache() // 목록을 다시 불러와 방금 만든 단어장이 보이게 한다
      navigate('/admin/wordsets')
    } catch {
      setError('저장하지 못했어요. 잠시 후 다시 시도해주세요.')
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <section>
      <h3 className="m-0 text-[15px] font-extrabold">{PROFILE_LABEL[owner]} 새 단어장</h3>
      <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-ink-muted">
        붙여넣고 저장하면 {PROFILE_LABEL[owner]} 것으로 만들어져요. 단어를 고치는 건 저장한 뒤
        단어장 화면에서 할 수 있어요.
      </p>

      <label className="mt-4 block">
        <span className="text-[13px] font-bold text-ink-muted">단어장 이름</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultTitle()}
          className="mt-1.5 block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[15px] font-bold outline-none focus:border-primary"
        />
      </label>

      {kindOptions.length > 1 && (
        <div className="mt-4">
          <span className="text-[13px] font-bold text-ink-muted">종류</span>
          <div
            className="mt-1.5 grid gap-1 rounded-xl bg-surface-alt p-1"
            style={{ gridTemplateColumns: `repeat(${kindOptions.length}, minmax(0, 1fr))` }}
          >
            {kindOptions.map((option) => (
              <button
                key={option.kind}
                type="button"
                onClick={() => setKind(option.kind)}
                aria-pressed={kind === option.kind}
                className={`h-10 rounded-lg text-[14px] font-semibold ${
                  kind === option.kind ? 'bg-surface text-primary shadow-sm' : 'text-ink-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <span className="text-[13px] font-bold text-ink-muted">분류</span>
        <div className="mt-1.5">
          <CategoryPicker
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCategoryCreated={(created) => setCategories((prev) => [...prev, created])}
          />
        </div>
      </div>

      <div className="mt-4">
        <span className="text-[13px] font-bold text-ink-muted">단어</span>
        <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-ink-muted">
          {selected.hint}
          <br />
          번호는 없어도 되고, 메모장이나 엑셀에서 붙여넣어도 돼요.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={selected.placeholder}
          rows={10}
          spellCheck={false}
          autoCapitalize="none"
          aria-label="단어 붙여넣기"
          className="mt-1.5 block w-full rounded-xl border border-border bg-surface p-3 font-display text-[14px] leading-relaxed outline-none focus:border-primary"
        />
      </div>

      <p className="m-0 mt-2 text-[13px] text-ink-muted">
        인식된 단어 <b className="text-ink">{words.length}개</b>
        {skipped.length > 0 && ` · 읽지 못한 줄 ${skipped.length}개`}
      </p>
      {skipped.length > 0 && (
        <ul className="m-0 mt-1 list-none p-0 text-[12.5px] text-ink-muted">
          {skipped.slice(0, 5).map((line, i) => (
            <li key={i} className="truncate">
              · {line}
            </li>
          ))}
          {skipped.length > 5 && <li>· 외 {skipped.length - 5}줄</li>}
        </ul>
      )}

      {error && <p className="m-0 mt-2 text-[12.5px] font-semibold text-error">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => navigate('/admin/wordsets')}
          className="flex-none rounded-xl border border-border bg-surface px-4 py-3 text-[14px] font-semibold text-ink-muted"
        >
          취소
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || words.length === 0}
          className="flex-1 rounded-xl bg-primary py-3 text-[15px] font-bold text-white disabled:opacity-40"
        >
          {saving ? '저장 중...' : words.length === 0 ? '단어를 입력해주세요' : `${words.length}개 저장`}
        </button>
      </div>
    </section>
  )
}
