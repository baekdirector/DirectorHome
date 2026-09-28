import { useEffect, useMemo, useState } from 'react'
import { HouseholdGate } from '../components/HouseholdGate'
import { HouseholdNav } from '../components/HouseholdNav'
import { LoadError } from '../components/LoadError'
import {
  formatWon,
  findMonthSummary,
  getCategories,
  getEntries,
  getSummary,
  parseWonInput,
  putEntry,
  type ExpenseCategory,
  type ExpenseEntry,
  type ExpenseGroup,
  type ExpenseSummary,
} from '../lib/household'

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
    setEntriesFailed(false)
    setEntriesLoading(true)
    try {
      const [entriesData, summaryData] = await Promise.all([getEntries(year), getSummary(year)])
      setEntries(entriesData)
      setSummary(summaryData)
    } catch (e) {
      setEntriesFailed(true)
    } finally {
      setEntriesLoading(false)
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
    const byCategory: Record<number, string> = {}
    for (const e of entries) {
      if (e.month === month) byCategory[e.categoryId] = formatWon(e.amount)
    }
    setInputs(byCategory)
  }, [entries, month])

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

    setInputs((prev) => ({ ...prev, [categoryId]: formatWon(amount) }))
    setSaveError(null)

    try {
      await putEntry({ categoryId, year, month, amount })
      const newSummary = await getSummary(year)
      setSummary(newSummary)
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
          <div className="flex flex-1 items-center justify-center text-ink-muted">불러오는 중...</div>
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
        <div className="flex flex-1 items-center justify-center text-ink-muted">불러오는 중...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <HouseholdNav />
      <div className="flex-1 px-[22px] pb-8">
        <div className="flex items-center gap-2 pt-5">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-border bg-surface px-2 py-1 text-[14px] font-semibold"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
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
          <div key={group} className="mt-5">
            <div className="mb-1 text-[13px] font-semibold text-ink-muted">{GROUP_LABEL[group]}</div>
            {activeByGroup[group].length === 0 && (
              <p className="m-0 py-2 text-[13px] text-ink-muted">등록된 항목이 없어요.</p>
            )}
            {activeByGroup[group].map((cat) => (
              <div key={cat.id} className="flex items-center gap-3 border-b border-hh-divider py-3.5">
                <div className={`h-8 w-[3px] flex-none rounded-full ${GROUP_BAR_CLASS[group]}`} />
                <div className="flex-1 text-[15px] font-medium">{cat.name}</div>
                <div className="relative w-[120px] mb-4">
                  <input
                    inputMode="numeric"
                    disabled={entriesLoading}
                    value={inputs[cat.id] ?? ''}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => saveEntry(cat.id, e.target.value)}
                    placeholder="0"
                    className="w-full bg-transparent text-right text-[16px] font-semibold tabular-nums outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {saveError?.categoryId === cat.id && (
                    <div className="absolute top-full right-0 mt-1 text-[12px] text-red-500 whitespace-nowrap">
                      {saveError.message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
