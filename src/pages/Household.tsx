import { useEffect, useMemo, useRef, useState } from 'react'
import { HouseholdGate } from '../components/HouseholdGate'
import { HouseholdNav } from '../components/HouseholdNav'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { ChevronRightIcon } from '../components/icons'
import {
  createEntry,
  deleteEntry,
  formatWon,
  findMonthSummary,
  getCategories,
  getEntries,
  getSettings,
  getSummary,
  parseWonInput,
  putEntry,
  type ExpenseCategory,
  type ExpenseEntry,
  type ExpenseGroup,
  type ExpenseSummary,
} from '../lib/household'

// 단일 값이 아니라 품목(날짜별 항목명+금액)을 여러 줄 쌓아서 합계를 보여주는 카테고리.
const ITEMIZED_CATEGORY_NAMES = new Set(['추가 지출액', '추가 입금액'])

const GROUP_ORDER: ExpenseGroup[] = ['income', 'fixed', 'card', 'utility', 'variable']
const GROUP_LABEL: Record<ExpenseGroup, string> = {
  income: '수입',
  fixed: '고정비',
  card: '카드',
  utility: '통신·공과',
  variable: '기타변동',
}
const GROUP_BAR_CLASS: Record<ExpenseGroup, string> = {
  income: 'bg-hh-gold',
  fixed: 'bg-hh-pine',
  card: 'bg-hh-clay',
  utility: 'bg-primary',
  variable: 'bg-hh-neutral',
}

export function Household() {
  return (
    <HouseholdGate>
      <HouseholdContent />
    </HouseholdGate>
  )
}

function HouseholdContent() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null)
  const [entries, setEntries] = useState<ExpenseEntry[] | null>(null)
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [categoriesFailed, setCategoriesFailed] = useState(false)
  const [entriesLoading, setEntriesLoading] = useState(true)
  const [entriesFailed, setEntriesFailed] = useState(false)
  const [saveError, setSaveError] = useState<{ categoryId: number; message: string } | null>(null)
  const [openingYear, setOpeningYear] = useState<number | null>(null)
  const [yearPickerOpen, setYearPickerOpen] = useState(false)
  // 연도를 빠르게 바꿀 때 이전 연도의 응답이 나중에 도착해 최신 화면을 덮어쓰지 않도록 "마지막 요청만 반영" 가드.
  const entriesRequestIdRef = useRef(0)
  const yearRef = useRef(year)
  const monthStripRef = useRef<HTMLDivElement>(null)
  const selectedMonthRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    yearRef.current = year
  }, [year])

  useEffect(() => {
    getSettings().then((s) => setOpeningYear(s?.openingYear ?? now.getFullYear()))
  }, [])

  // 선택된 월 버튼이 항상 스크롤 영역 가운데에 오도록 맞춘다.
  // categories/entries가 로딩 중일 때는 아직 버튼이 그려지지 않아 ref가 비어있으므로,
  // 로딩이 끝나 실제 버튼이 그려진 뒤에도 다시 맞춰야 한다.
  useEffect(() => {
    selectedMonthRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [month, year, categories, entries])

  const retryCategories = async () => {
    setCategoriesFailed(false)
    try {
      const data = await getCategories()
      setCategories(data)
    } catch (e) {
      setCategoriesFailed(true)
    }
  }

  const retryEntries = async () => {
    const requestId = ++entriesRequestIdRef.current
    setEntriesFailed(false)
    setEntriesLoading(true)
    try {
      const [entriesData, summaryData] = await Promise.all([getEntries(year), getSummary(year)])
      if (entriesRequestIdRef.current !== requestId) return // 더 최신 요청이 이미 나감 -> 이 응답은 버린다
      setEntries(entriesData)
      setSummary(summaryData)
    } catch (e) {
      if (entriesRequestIdRef.current !== requestId) return
      setEntriesFailed(true)
    } finally {
      if (entriesRequestIdRef.current === requestId) setEntriesLoading(false)
    }
  }

  useEffect(() => {
    retryCategories()
  }, [])

  useEffect(() => {
    setEntriesLoading(true)
    setEntriesFailed(false)
    retryEntries()
  }, [year])

  useEffect(() => {
    if (!entries) return
    const sums: Record<number, number> = {}
    for (const e of entries) {
      if (e.month === month) sums[e.categoryId] = (sums[e.categoryId] ?? 0) + e.amount
    }
    const byCategory: Record<number, string> = {}
    for (const cat of categories ?? []) {
      if (cat.id in sums) {
        byCategory[cat.id] = formatWon(sums[cat.id])
        continue
      }
      // 고정비는 이번 달 입력이 아직 없으면, 가장 최근 달 값을 화면에 미리 채워만 둔다.
      // 저장하는 건 아니라서 사용자가 확인(blur)해야 실제로 기록된다.
      if (cat.groupType === 'fixed') {
        for (let m = month - 1; m >= 1; m--) {
          const prior = entries.find((e) => e.categoryId === cat.id && e.month === m)
          if (prior) {
            byCategory[cat.id] = formatWon(prior.amount)
            break
          }
        }
      }
    }
    setInputs(byCategory)
  }, [entries, month, categories])

  const activeByGroup = useMemo(() => {
    const groups: Record<ExpenseGroup, ExpenseCategory[]> = { income: [], fixed: [], card: [], utility: [], variable: [] }
    for (const c of categories ?? []) {
      if (c.archivedAt) continue
      groups[c.groupType].push(c)
    }
    for (const g of GROUP_ORDER) groups[g].sort((a, b) => a.displayOrder - b.displayOrder)
    return groups
  }, [categories])

  const monthSummary = summary ? findMonthSummary(summary, month) : undefined

  // Clear error message after 3 seconds
  useEffect(() => {
    if (!saveError) return
    const timer = setTimeout(() => setSaveError(null), 3000)
    return () => clearTimeout(timer)
  }, [saveError])

  async function saveEntry(categoryId: number, raw: string) {
    const amount = parseWonInput(raw)
    const previousValue = inputs[categoryId] ?? ''
    const entryYear = year
    const entryMonth = month

    setInputs((prev) => ({ ...prev, [categoryId]: formatWon(amount) }))
    setSaveError(null)

    try {
      const { id } = await putEntry({ categoryId, year: entryYear, month: entryMonth, amount })
      // entries 배열에도 반영해야 한다. 그러지 않으면 [entries, month] 이펙트가 저장 전 stale 값으로
      // inputs를 다시 만들어, 다른 달로 갔다가 돌아왔을 때 방금 저장한 값이 빈칸으로 보인다.
      if (yearRef.current === entryYear) {
        setEntries((prev) => {
          const list = prev ?? []
          const idx = list.findIndex(
            (e) => e.categoryId === categoryId && e.year === entryYear && e.month === entryMonth,
          )
          if (idx >= 0) {
            const next = [...list]
            next[idx] = { ...next[idx], id, amount, updatedAt: Date.now() }
            return next
          }
          const synthesized: ExpenseEntry = {
            id,
            categoryId,
            year: entryYear,
            month: entryMonth,
            amount,
            memo: null,
            updatedAt: Date.now(),
          }
          return [...list, synthesized]
        })
      }
      const newSummary = await getSummary(entryYear)
      if (yearRef.current === entryYear) {
        setSummary(newSummary)
      }
    } catch (e) {
      // Rollback: restore the previous value
      setInputs((prev) => ({ ...prev, [categoryId]: previousValue }))
      setSaveError({ categoryId, message: '저장에 실패했습니다.' })
    }
  }

  if (categoriesFailed) {
    return (
      <div className="flex min-h-svh flex-col bg-bg">
        <HouseholdNav />
        <div className="flex-1">
          <LoadError
            screen={false}
            message="항목 정보를 불러오지 못했어요."
            onRetry={retryCategories}
          />
        </div>
      </div>
    )
  }

  if (!categories || entriesFailed) {
    return (
      <div className="flex min-h-svh flex-col bg-bg">
        <HouseholdNav />
        {!categories ? (
          <Loading />
        ) : (
          <div className="flex-1">
            <LoadError
              screen={false}
              message="데이터를 불러오지 못했어요."
              onRetry={retryEntries}
            />
          </div>
        )}
      </div>
    )
  }

  if (!categories || !entries) {
    return (
      <div className="flex min-h-svh flex-col bg-bg">
        <HouseholdNav />
        <Loading />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <HouseholdNav />
      <div className="flex-1 px-[22px] pb-8">
        <div className="flex items-center gap-2 pt-5">
          <div className="relative flex-none">
            <button
              type="button"
              onClick={() => setYearPickerOpen((v) => !v)}
              className="flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-1.5 text-[14px] font-semibold"
            >
              {year}년
              <ChevronRightIcon width={13} height={13} className="rotate-90 text-ink-muted" strokeWidth={2} />
            </button>
            {yearPickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setYearPickerOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-1.5 max-h-[240px] w-[110px] overflow-y-auto rounded-[14px] border border-border bg-surface py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.18)]">
                  {Array.from({ length: now.getFullYear() - (openingYear ?? now.getFullYear()) + 1 }, (_, i) => (openingYear ?? now.getFullYear()) + i)
                    .reverse()
                    .map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          setYear(y)
                          setYearPickerOpen(false)
                        }}
                        className={`block w-full px-3.5 py-2 text-left text-[14px] font-semibold ${
                          y === year ? 'text-hh-pine' : 'text-ink'
                        }`}
                      >
                        {y}년
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
          <div ref={monthStripRef} className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto scroll-px-6 px-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
                ref={m === month ? selectedMonthRef : undefined}
                onClick={() => setMonth(m)}
                className={`flex-none rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                  m === month ? 'bg-hh-pine text-white' : 'bg-surface text-ink-muted'
                }`}
              >
                {m}월
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-[18px] border-t-4 border-hh-gold bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
            {year}년 {month}월
            <span className="h-1.5 w-1.5 rounded-full bg-hh-gold" />
          </div>
          <div className="mt-2 text-[38px] font-extrabold tracking-tight text-hh-pine">
            {formatWon(monthSummary?.balance ?? 0)}
            <span className="ml-1 text-[20px] font-semibold text-ink-muted">원</span>
          </div>
          <div className="mt-1 text-[14px] font-medium text-ink-muted">이번 달 남은 돈</div>
        </div>

        {GROUP_ORDER.map((group) => (
          <div
            key={group}
            className={`mt-5 ${group === 'income' ? 'rounded-[18px] bg-hh-gold-tint px-3.5 pb-1 pt-3.5' : ''}`}
          >
            <div className="mb-1 text-[13px] font-semibold text-ink-muted">{GROUP_LABEL[group]}</div>
            {activeByGroup[group].length === 0 && (
              <p className="m-0 py-2 text-[13px] text-ink-muted">등록된 항목이 없어요.</p>
            )}
            {activeByGroup[group].map((cat) =>
              ITEMIZED_CATEGORY_NAMES.has(cat.name) ? (
                <ItemizedRow
                  key={cat.id}
                  category={cat}
                  year={year}
                  month={month}
                  items={(entries ?? []).filter((e) => e.categoryId === cat.id && e.month === month)}
                  barClass={GROUP_BAR_CLASS[group]}
                  onChanged={retryEntries}
                />
              ) : (
                <div key={cat.id} className="flex items-center gap-3 border-b border-hh-divider py-3.5">
                  <div className={`h-8 w-[3px] flex-none rounded-full ${GROUP_BAR_CLASS[group]}`} />
                  <div className="flex-1 text-[15px] font-medium">{cat.name}</div>
                  <div className="relative w-[124px] mb-4">
                    <input
                      inputMode="numeric"
                      disabled={entriesLoading}
                      value={inputs[cat.id] ?? ''}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => saveEntry(cat.id, e.target.value)}
                      placeholder="0"
                      className="w-full rounded-[10px] border border-border bg-surface-alt px-2.5 py-2 text-right text-[16px] font-semibold tabular-nums outline-none focus:border-hh-pine focus:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {saveError?.categoryId === cat.id && (
                      <div className="absolute top-full right-0 mt-1 text-[12px] text-red-500 whitespace-nowrap">
                        {saveError.message}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** "추가 지출액"처럼 품목(항목명+금액)을 여러 줄 쌓아서 합계를 보여주는 카테고리 한 줄. */
function ItemizedRow({
  category,
  year,
  month,
  items,
  barClass,
  onChanged,
}: {
  category: ExpenseCategory
  year: number
  month: number
  items: ExpenseEntry[]
  barClass: string
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const total = items.reduce((sum, it) => sum + it.amount, 0)

  async function addItem() {
    const parsed = parseWonInput(amount)
    if (!label.trim() || parsed <= 0) return
    setSaving(true)
    try {
      await createEntry({ categoryId: category.id, year, month, amount: parsed, memo: label.trim() })
      setLabel('')
      setAmount('')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function removeItem(id: number) {
    await deleteEntry(id)
    onChanged()
  }

  return (
    <div className="border-b border-hh-divider py-3.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3">
        <div className={`h-8 w-[3px] flex-none rounded-full ${barClass}`} />
        <div className="flex-1 text-left text-[15px] font-medium">{category.name}</div>
        <div className="rounded-[10px] border border-border bg-surface-alt px-2.5 py-2 text-right text-[16px] font-semibold tabular-nums">
          {formatWon(total)}
        </div>
        <ChevronRightIcon
          width={14}
          height={14}
          className={`flex-none text-ink-muted transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 pl-[19px]">
          {items.length === 0 && <p className="m-0 pb-2 text-[13px] text-ink-muted">등록된 품목이 없어요.</p>}
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2 py-1.5 text-[14px]">
              <div className="flex-1 text-ink-muted">{it.memo || '(이름 없음)'}</div>
              <div className="font-medium tabular-nums">{formatWon(it.amount)}원</div>
              <button type="button" onClick={() => removeItem(it.id)} className="px-1 text-ink-muted" aria-label="품목 삭제">
                ✕
              </button>
            </div>
          ))}
          <div className="mt-2 flex gap-1.5">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="항목명"
              className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-2.5 py-2 text-[14px] outline-none focus:border-hh-pine"
            />
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="금액"
              className="w-[90px] flex-none rounded-[10px] border border-border bg-surface px-2.5 py-2 text-right text-[14px] tabular-nums outline-none focus:border-hh-pine"
            />
            <button
              type="button"
              onClick={addItem}
              disabled={saving}
              className="flex-none rounded-[10px] bg-hh-pine px-3.5 text-[14px] font-bold text-white disabled:opacity-50"
            >
              추가
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
