import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccessGate } from '../components/AccessGate'
import { HouseholdNav } from '../components/HouseholdNav'
import { HouseholdBottomNav } from '../components/HouseholdBottomNav'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { EditEntryModal } from '../components/EditEntryModal'
import { StatementImportModal } from '../components/StatementImportModal'
import { registerHouseholdOverlay } from '../lib/householdOverlay'
import {
  createEntry,
  deleteEntry,
  formatWon,
  getCategories,
  getEntries,
  getSummary,
  parseWonInput,
  putEntry,
  updateEntry,
  type ExpenseCategory,
  type ExpenseEntry,
  type ExpenseGroup,
  type ExpenseMonthSummary,
} from '../lib/household'

const GROUP_ORDER: ExpenseGroup[] = ['income', 'fixed', 'card', 'utility', 'variable']
const GROUP_LABEL: Record<ExpenseGroup, string> = {
  income: '수입',
  fixed: '고정비',
  card: '카드',
  utility: '통신·공과',
  variable: '기타변동',
}
const GROUP_COLOR: Record<ExpenseGroup, string> = {
  income: 'var(--color-hh-sage)',
  fixed: 'var(--color-hh-clay)',
  card: 'var(--color-hh-pine)',
  utility: 'var(--color-hh-tan)',
  variable: 'var(--color-hh-neutral)',
}
// 카드사 개별 구분용(그룹 색과 겹치지 않도록 별도 팔레트 — dataviz 스킬 validate_palette.js로 검증됨).
const CARD_ORDER = ['현대카드', '신한카드', '우리카드', '삼성카드']
const CARD_PALETTE = ['#9B2D4F', '#2E5FA3', '#5C7A29', '#D68A1F']
const CARD_FALLBACK_COLOR = '#8a8674'
const ITEMIZED_CATEGORY_NAMES = new Set(['추가 지출액', '추가 입금액'])

export function Household() {
  return (
    <AccessGate>
      <HouseholdContent />
    </AccessGate>
  )
}

function HouseholdContent() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null)
  const [entries, setEntries] = useState<ExpenseEntry[] | null>(null)
  const [summary, setSummary] = useState<ExpenseMonthSummary[] | null>(null)
  const [openingBalance, setOpeningBalance] = useState(0)
  const [categoriesFailed, setCategoriesFailed] = useState(false)
  const [entriesFailed, setEntriesFailed] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseCategory | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const entriesRequestIdRef = useRef(0)

  // 뒤로가기를 눌렀을 때 가계부를 나가는 대신 열려있는 팝업부터 닫히게 등록한다.
  useEffect(() => {
    if (!editing) return
    return registerHouseholdOverlay(() => setEditing(null))
  }, [editing])
  useEffect(() => {
    if (!pickerOpen) return
    return registerHouseholdOverlay(() => setPickerOpen(false))
  }, [pickerOpen])
  useEffect(() => {
    if (!importOpen) return
    return registerHouseholdOverlay(() => setImportOpen(false))
  }, [importOpen])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const retryCategories = async () => {
    setCategoriesFailed(false)
    try {
      setCategories(await getCategories())
    } catch {
      setCategoriesFailed(true)
    }
  }

  const retryEntries = async () => {
    const requestId = ++entriesRequestIdRef.current
    setEntriesFailed(false)
    try {
      const [entriesData, summaryData] = await Promise.all([getEntries(year), getSummary(year)])
      if (entriesRequestIdRef.current !== requestId) return
      setEntries(entriesData)
      setSummary(summaryData.months)
      setOpeningBalance(summaryData.openingBalance)
    } catch {
      if (entriesRequestIdRef.current !== requestId) return
      setEntriesFailed(true)
    }
  }

  useEffect(() => {
    retryCategories()
  }, [])

  useEffect(() => {
    retryEntries()
  }, [year])

  const categoryById = useMemo(() => {
    const map = new Map<number, ExpenseCategory>()
    for (const c of categories ?? []) map.set(c.id, c)
    return map
  }, [categories])

  // categoryId-month -> 합계 (품목별로 여러 줄인 카테고리도 정확히 더해진다)
  const sumsByCategoryMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries ?? []) {
      const key = `${e.categoryId}-${e.month}`
      map.set(key, (map.get(key) ?? 0) + e.amount)
    }
    return map
  }, [entries])

  const sumFor = (categoryId: number, m: number) => sumsByCategoryMonth.get(`${categoryId}-${m}`) ?? 0

  const activeByGroup = useMemo(() => {
    const groups: Record<ExpenseGroup, ExpenseCategory[]> = { income: [], fixed: [], card: [], utility: [], variable: [] }
    for (const c of categories ?? []) {
      if (c.archivedAt) continue
      groups[c.groupType].push(c)
    }
    for (const g of GROUP_ORDER) groups[g].sort((a, b) => a.displayOrder - b.displayOrder)
    return groups
  }, [categories])

  const monthSummary = summary ? findMonthSummaryArr(summary, month) : undefined
  const prevMonthSummary = summary && month > 1 ? findMonthSummaryArr(summary, month - 1) : undefined

  const income = monthSummary?.income ?? 0
  const expenseTotal = monthSummary?.expenseTotal ?? 0
  const netThisMonth = monthSummary?.net ?? 0
  // 이번 달이 시작될 때(=전달 말) 갖고 있던 잔액. balance는 이번 달 순증감까지 반영된 값이라 빼서 구한다.
  const carriedIn = monthSummary ? monthSummary.balance - monthSummary.net : openingBalance
  const savingsRate = income > 0 ? (netThisMonth / income) * 100 : 0
  const prevSavingsRate =
    prevMonthSummary && prevMonthSummary.income > 0 ? (prevMonthSummary.net / prevMonthSummary.income) * 100 : null
  const rateDelta = prevSavingsRate !== null ? savingsRate - prevSavingsRate : null
  const spendPct = income > 0 ? Math.min(100, (expenseTotal / income) * 100) : 0
  const momAmt = prevMonthSummary ? prevMonthSummary.expenseTotal - expenseTotal : null
  const momPct = prevMonthSummary && prevMonthSummary.expenseTotal > 0 ? ((momAmt ?? 0) / prevMonthSummary.expenseTotal) * 100 : null
  // 올해 1월 시작 전(=작년 12월 말) 잔액. 1월 요약의 balance에서 1월 순증감을 빼면 나온다.
  const yearOpeningBalance = useMemo(() => {
    const jan = summary?.find((m) => m.month === 1)
    return jan ? jan.balance - jan.net : 0
  }, [summary])
  const ytdIncome = useMemo(() => {
    if (!summary) return 0
    let sum = yearOpeningBalance
    for (const m of summary) if (m.month <= month) sum += m.income
    return sum
  }, [summary, month, yearOpeningBalance])
  const ytdExpense = useMemo(() => {
    if (!summary) return 0
    let sum = 0
    for (const m of summary) if (m.month <= month) sum += m.expenseTotal
    return sum
  }, [summary, month])

  const topSpend = useMemo(() => {
    let best: { name: string; amount: number } | null = null
    for (const c of categories ?? []) {
      if (c.groupType === 'income') continue
      const amt = sumFor(c.id, month)
      if (amt > 0 && (!best || amt > best.amount)) best = { name: c.name, amount: amt }
    }
    return best
  }, [categories, sumsByCategoryMonth, month])

  const donutGroups = useMemo(() => {
    const totals: Record<ExpenseGroup, number> = { income: 0, fixed: 0, card: 0, utility: 0, variable: 0 }
    for (const c of categories ?? []) {
      if (c.groupType === 'income') continue
      totals[c.groupType] += sumFor(c.id, month)
    }
    const groups = (['card', 'fixed', 'utility', 'variable'] as ExpenseGroup[])
      .map((g) => ({ group: g, name: GROUP_LABEL[g], color: GROUP_COLOR[g], amount: totals[g] }))
      .filter((g) => g.amount > 0)
    const total = groups.reduce((s, g) => s + g.amount, 0)
    let acc = 0
    const stops: string[] = []
    for (const g of groups) {
      const pct = total > 0 ? (g.amount / total) * 100 : 0
      stops.push(`${g.color} ${acc.toFixed(2)}% ${(acc + pct).toFixed(2)}%`)
      acc += pct
    }
    return { groups, total, donutBg: stops.length ? `conic-gradient(${stops.join(', ')})` : 'var(--color-hh-divider)' }
  }, [categories, sumsByCategoryMonth, month])

  const cardStats = useMemo(() => {
    const cardCats = (categories ?? []).filter((c) => c.groupType === 'card' && !c.archivedAt)
    const ordered = [...CARD_ORDER.filter((n) => cardCats.some((c) => c.name === n)), ...cardCats.map((c) => c.name).filter((n) => !CARD_ORDER.includes(n))]
    const rows = ordered
      .map((name) => cardCats.find((c) => c.name === name))
      .filter((c): c is ExpenseCategory => !!c)
      .map((c, i) => {
        const amt = sumFor(c.id, month)
        const prev = sumFor(c.id, month - 1)
        const delta = prev > 0 ? ((amt - prev) / prev) * 100 : null
        return { id: c.id, name: c.name, amount: amt, delta, color: CARD_PALETTE[i] ?? CARD_FALLBACK_COLOR }
      })
    const max = Math.max(1, ...rows.map((r) => r.amount))
    return rows.map((r) => ({ ...r, bar: (r.amount / max) * 100 }))
  }, [categories, sumsByCategoryMonth, month])

  // 현대카드+우리카드는 와이프가 같이 쓰고 있어서 합산해서 보여주고 복사할 수 있게 한다.
  const wifeCardsTotal = useMemo(() => {
    const names = new Set(['현대카드', '우리카드'])
    return cardStats.filter((c) => names.has(c.name)).reduce((sum, c) => sum + c.amount, 0)
  }, [cardStats])
  const [copied, setCopied] = useState(false)
  async function copyWifeCardsTotal() {
    try {
      await navigator.clipboard.writeText(formatWon(wifeCardsTotal))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 클립보드 API를 못 쓰는 환경이면 조용히 무시한다.
    }
  }

  const sections = useMemo(() => {
    return GROUP_ORDER.map((group) => {
      const cats = activeByGroup[group]
      const total = cats.reduce((s, c) => s + sumFor(c.id, month), 0)
      return { group, title: GROUP_LABEL[group], color: GROUP_COLOR[group], total, categories: cats }
    })
  }, [activeByGroup, sumsByCategoryMonth, month])

  async function saveSingleEntry(categoryId: number, amount: number) {
    setSaving(true)
    try {
      await putEntry({ categoryId, year, month, amount })
      await retryEntries()
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  function goMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m > 12) {
      m = 1
      y += 1
    } else if (m < 1) {
      m = 12
      y -= 1
    }
    setYear(y)
    setMonth(m)
  }

  if (categoriesFailed) {
    return (
      <div className="flex min-h-svh flex-col bg-hh-bg lg:flex-row">
        <HouseholdNav />
        <div className="flex-1">
          <LoadError screen={false} message="항목 정보를 불러오지 못했어요." onRetry={retryCategories} />
        </div>
      </div>
    )
  }

  if (entriesFailed) {
    return (
      <div className="flex min-h-svh flex-col bg-hh-bg lg:flex-row">
        <HouseholdNav />
        <div className="flex-1">
          <LoadError screen={false} message="데이터를 불러오지 못했어요." onRetry={retryEntries} />
        </div>
      </div>
    )
  }

  if (!categories || !entries || !summary) {
    return (
      <div className="flex min-h-svh flex-col bg-hh-bg lg:flex-row">
        <HouseholdNav />
        <Loading />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-hh-bg font-hh-sans text-hh-ink lg:flex-row" style={{ fontVariantNumeric: 'tabular-nums' }}>
      <HouseholdNav />

      <main className="flex min-w-0 flex-1 flex-col lg:gap-5 lg:px-10 lg:pb-10 lg:pt-7">
      {/* 월 전환 + 화면 단위 동작 */}
      <div className="flex items-center justify-between px-3 pb-3 pt-1 lg:px-0 lg:pb-0 lg:pt-0">
        <div className="contents lg:flex lg:items-center lg:gap-2">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => goMonth(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full lg:order-first lg:h-11 lg:w-11 lg:rounded-xl lg:border lg:border-hh-border lg:bg-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="stroke-hh-ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6" />
            </svg>
          </button>
          <button type="button" onClick={() => setPickerOpen(true)} className="relative flex flex-col items-center gap-0.5 lg:flex-row lg:items-baseline lg:gap-1.5 lg:px-3">
            <span className="text-[12px] text-hh-ink-muted lg:text-[26px] lg:font-extrabold lg:tracking-tight lg:text-hh-ink">
              {year}
              <span className="hidden lg:inline">년</span>
            </span>
            <span className="font-hh-serif text-[24px] font-bold lg:text-[26px] lg:font-extrabold lg:tracking-tight">{month}월</span>
            {pickerOpen && (
              <MonthYearPicker year={year} month={month} onPick={(y, m) => { setYear(y); setMonth(m); setPickerOpen(false) }} onClose={() => setPickerOpen(false)} />
            )}
          </button>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => goMonth(1)}
            className="flex h-11 w-11 items-center justify-center rounded-full lg:h-11 lg:w-11 lg:rounded-xl lg:border lg:border-hh-border lg:bg-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="stroke-hh-ink" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="hidden h-11 items-center gap-2 rounded-xl border border-hh-border bg-white px-4 text-[14px] font-semibold text-hh-ink lg:flex"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
          </svg>
          PDF 가져오기
        </button>
      </div>

      <div className="flex flex-col gap-4 px-5 pb-24 lg:grid lg:grid-cols-12 lg:items-start lg:gap-5 lg:px-0 lg:pb-0">
        {/* 히어로 */}
        <div className="flex flex-col gap-[18px] rounded-[28px] bg-hh-pine p-6 text-white shadow-[0_18px_40px_-24px_rgba(34,67,59,0.7)] lg:col-span-7 lg:h-full lg:justify-between lg:rounded-3xl lg:px-8 lg:py-7">
          <div className="flex items-center justify-between">
            <div className="text-[14px] text-[#CFDDD5]">이번 달 남은 돈</div>
            <div className="text-[12px] text-[#CFDDD5]">전달 이월 {formatWon(carriedIn)}원</div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <div className="text-[40px] font-bold tracking-tight lg:text-[52px] lg:font-extrabold lg:leading-none">
              {formatWon(monthSummary?.balance ?? openingBalance)}
            </div>
            <div className="text-[18px] text-[#CFDDD5] lg:text-[20px] lg:font-semibold">원</div>
          </div>
          {income > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
                <div className="rounded-full bg-hh-clay" style={{ width: `${spendPct}%` }} />
                <div className="flex-1 rounded-full bg-hh-sage" />
              </div>
              <div className="flex justify-between text-[12px] text-[#CFDDD5]">
                <div>수입의 {spendPct.toFixed(1)}% 사용</div>
                {rateDelta !== null && (
                  <div>지난달보다 저축률 {rateDelta >= 0 ? '+' : '−'}{Math.abs(rateDelta).toFixed(1)}%p</div>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 rounded-[18px] bg-white/10 p-3.5 lg:rounded-2xl lg:px-[18px] lg:py-4">
              <div className="text-[12px] text-[#CFDDD5] lg:text-[13px]">수입</div>
              <div className="text-[17px] font-semibold lg:text-[22px] lg:font-bold">{formatWon(income)}</div>
            </div>
            <div className="flex flex-col gap-1 rounded-[18px] bg-white/10 p-3.5 lg:rounded-2xl lg:px-[18px] lg:py-4">
              <div className="text-[12px] text-[#CFDDD5] lg:text-[13px]">지출</div>
              <div className="text-[17px] font-semibold lg:text-[22px] lg:font-bold">{formatWon(expenseTotal)}</div>
            </div>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 lg:col-span-5 lg:gap-5">
          <KpiCard
            label="전월 대비 지출"
            value={momAmt !== null ? `${momAmt >= 0 ? '−' : '+'}${formatWon(Math.abs(momAmt))}` : '—'}
            chip={momPct !== null ? `${momPct >= 0 ? '▼' : '▲'} ${Math.abs(momPct).toFixed(1)}%` : undefined}
            chipBad={momPct !== null && momPct < 0}
          />
          <KpiCard label={`올해 가용 자금 · 1–${month}월`} value={formatWon(ytdIncome)} sub={`이월 ${formatWon(yearOpeningBalance)}원 포함`} />
          <KpiCard label="가장 큰 지출" value={topSpend ? formatWon(topSpend.amount) : '—'} sub={topSpend?.name ?? '등록된 지출 없음'} />
          <KpiCard label={`올해 누적 지출 · 1–${month}월`} value={formatWon(ytdExpense)} />
        </div>

        {/* 지출 구성 */}
        {donutGroups.total > 0 && (
          <div className="flex flex-col gap-4 rounded-[24px] bg-white p-5 lg:col-span-5 lg:gap-5 lg:px-7 lg:py-6">
            <div className="flex items-baseline justify-between">
              <div className="font-hh-serif text-[18px] font-bold">지출 구성</div>
              <Link to="/household/stats" replace className="text-[13px] font-semibold no-underline text-hh-pine">
                통계 보기
              </Link>
            </div>
            <div className="flex items-center gap-5 lg:gap-8">
              <div
                className="flex h-[124px] w-[124px] flex-none items-center justify-center rounded-full lg:h-[150px] lg:w-[150px]"
                style={{ background: donutGroups.donutBg }}
              >
                <div className="flex h-[84px] w-[84px] flex-col items-center justify-center rounded-full bg-white lg:h-[102px] lg:w-[102px]">
                  <div className="text-[11px] text-hh-ink-muted lg:text-[12px]">총 지출</div>
                  <div className="text-[14px] font-bold lg:text-[17px]">{(expenseTotal / 10000).toFixed(0)}만</div>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3">
                {donutGroups.groups.map((g) => (
                  <div key={g.group} className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 flex-none rounded-[4px]" style={{ background: g.color }} />
                    <div className="flex-1 text-[13px]">{g.name}</div>
                    <div className="flex flex-col items-end">
                      <div className="text-[13px] font-semibold">{formatWon(g.amount)}</div>
                      <div className="text-[11px] text-hh-ink-muted">{((g.amount / donutGroups.total) * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 카드별 사용액 */}
        {cardStats.length > 0 && (
          <div className="flex flex-col gap-4 rounded-[24px] bg-white p-5 lg:col-span-7 lg:gap-[18px] lg:px-7 lg:py-6">
            <div className="flex items-baseline justify-between">
              <div className="font-hh-serif text-[18px] font-bold">카드별 사용액</div>
              <div className="text-[12px] text-hh-ink-muted">지난달 대비</div>
            </div>
            {cardStats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEditing(categoryById.get(c.id) ?? null)}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-none bg-transparent p-0 text-left lg:flex-nowrap lg:gap-4"
              >
                {/* 좁은 화면에서는 막대가 줄바꿈되어 이름 줄 아래에 깔리고,
                    넓은 화면에서는 order로 이름과 금액 사이에 들어간다. */}
                <div className="order-1 h-[22px] w-8 flex-none rounded-[5px] lg:h-3 lg:w-3 lg:rounded" style={{ background: c.color }} />
                <div className="order-2 flex-1 text-[14px] font-medium text-hh-ink lg:w-[84px] lg:flex-none">{c.name}</div>
                <div className="order-3 text-[14px] font-semibold text-hh-ink lg:order-5 lg:w-[96px] lg:flex-none lg:text-right lg:text-[15px] lg:font-bold">
                  {formatWon(c.amount)}
                </div>
                {c.delta !== null && (
                  <div
                    className="order-4 min-w-[52px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold lg:order-6 lg:min-w-[60px] lg:flex-none lg:text-[12px]"
                    style={{
                      color: c.delta > 0 ? 'var(--color-hh-up)' : 'var(--color-hh-down)',
                      background: c.delta > 0 ? 'var(--color-hh-up-tint)' : 'var(--color-hh-down-tint)',
                    }}
                  >
                    {c.delta > 0 ? '▲' : '▼'} {Math.abs(c.delta).toFixed(1)}%
                  </div>
                )}
                <div className="order-5 h-1.5 w-full overflow-hidden rounded-full bg-hh-divider lg:order-4 lg:h-2.5 lg:w-auto lg:flex-1">
                  <div className="h-1.5 rounded-full lg:h-2.5" style={{ width: `${c.bar}%`, background: c.color }} />
                </div>
              </button>
            ))}

            {wifeCardsTotal > 0 && (
              <div className="flex items-center gap-2.5 rounded-[14px] bg-hh-bg px-3 py-3">
                <div className="flex-1 text-[13px] font-semibold text-hh-ink-muted">현대카드+우리카드 (와이프)</div>
                <div className="text-[15px] font-bold text-hh-ink">{formatWon(wifeCardsTotal)}</div>
                <button
                  type="button"
                  onClick={copyWifeCardsTotal}
                  className="flex-none rounded-full border border-hh-border bg-white px-2.5 py-1 text-[12px] font-semibold text-hh-pine"
                >
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 입력 내역 */}
        <div className="flex items-center justify-between pt-1 lg:col-span-12 lg:pt-3">
          <div className="font-hh-serif text-[18px] font-bold lg:text-[19px] lg:font-extrabold">{month}월 입력 내역</div>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="rounded-full border border-hh-border bg-white px-3 py-1.5 text-[12px] font-semibold text-hh-pine lg:hidden"
          >
            PDF 가져오기
          </button>
          <span className="hidden text-[13px] text-hh-ink-muted lg:block">항목을 클릭하면 바로 수정할 수 있어요</span>
        </div>
        {/* 그룹 카드는 길이가 제각각이라 그리드로 놓으면 행 높이에 묶여 빈칸이 생긴다.
            넓은 화면에서는 다단으로 흘려 빈틈 없이 채운다. */}
        <div className="flex flex-col gap-4 lg:col-span-12 lg:block lg:columns-4 lg:gap-5">
        {sections.map((s) => (
          <div key={s.group} className="flex flex-col rounded-[24px] bg-white px-2 pb-1.5 pt-1 lg:mb-5 lg:break-inside-avoid lg:rounded-[20px] lg:px-5 lg:pb-3 lg:pt-[18px]">
            <div className="flex items-center justify-between px-3 py-2.5 lg:border-b lg:border-hh-divider lg:px-0 lg:pt-0">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <div className="text-[13px] font-semibold text-hh-ink-soft lg:text-[14px] lg:font-bold lg:text-hh-ink">{s.title}</div>
              </div>
              <div className="text-[13px] font-semibold lg:text-[14px] lg:font-bold" style={{ color: s.group === 'income' ? 'var(--color-hh-down)' : 'var(--color-hh-ink)' }}>
                {s.group === 'income' ? '+' : '−'}
                {formatWon(s.total)}
              </div>
            </div>
            {s.categories.length === 0 && <p className="m-0 px-3 pb-2 text-[13px] text-hh-ink-muted">등록된 항목이 없어요.</p>}
            {s.categories.map((cat) =>
              ITEMIZED_CATEGORY_NAMES.has(cat.name) ? (
                <ItemizedRow
                  key={cat.id}
                  category={cat}
                  year={year}
                  month={month}
                  items={(entries ?? []).filter((e) => e.categoryId === cat.id && e.month === month)}
                  onChanged={retryEntries}
                />
              ) : (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setEditing(cat)}
                  className="flex min-h-[52px] items-center justify-between rounded-[14px] border-none bg-transparent px-3 text-left text-hh-ink lg:min-h-[46px] lg:rounded-none lg:border-b lg:border-[#F4F0EA] lg:px-1"
                >
                  <div className="text-[15px] lg:text-[14px]">{cat.name}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-[15px] font-semibold lg:text-[14px]">{formatWon(sumFor(cat.id, month))}</div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-hh-neutral lg:hidden">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </div>
                </button>
              ),
            )}
          </div>
        ))}
        </div>
      </div>
      </main>

      <HouseholdBottomNav />

      <EditEntryModal
        open={!!editing}
        categoryName={editing?.name ?? ''}
        initialAmount={editing ? sumFor(editing.id, month) : 0}
        saving={saving}
        onConfirm={(amount) => editing && saveSingleEntry(editing.id, amount)}
        onCancel={() => setEditing(null)}
      />

      {importOpen && (
        <StatementImportModal
          categories={categories ?? []}
          entries={entries ?? []}
          onClose={() => setImportOpen(false)}
          onSaved={(message) => {
            setImportOpen(false)
            setToast(message)
            retryEntries()
          }}
        />
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-5">
          <div className="rounded-full bg-hh-ink px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}

function findMonthSummaryArr(months: ExpenseMonthSummary[], month: number) {
  return months.find((m) => m.month === month)
}

function KpiCard({
  label,
  value,
  sub,
  chip,
  chipBad,
}: {
  label: string
  value: string
  sub?: string
  chip?: string
  chipBad?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[22px] bg-white p-4">
      <div className="text-[12px] text-hh-ink-muted">{label}</div>
      <div className="text-[22px] font-bold tabular-nums">{value}</div>
      {chip && (
        <div
          className="self-start rounded-full px-2 py-0.5 text-[12px] font-semibold"
          style={{
            color: chipBad ? 'var(--color-hh-up)' : 'var(--color-hh-down)',
            background: chipBad ? 'var(--color-hh-up-tint)' : 'var(--color-hh-down-tint)',
          }}
        >
          {chip}
        </div>
      )}
      {sub && <div className="text-[12px] text-hh-ink-muted">{sub}</div>}
    </div>
  )
}

function MonthYearPicker({
  year,
  month,
  onPick,
  onClose,
}: {
  year: number
  month: number
  onPick: (year: number, month: number) => void
  onClose: () => void
}) {
  const [y, setY] = useState(year)
  return (
    <div role="presentation" onClick={(e) => e.stopPropagation()} className="absolute left-1/2 top-full z-30 mt-2 w-[280px] -translate-x-1/2 rounded-[20px] bg-white p-4 text-left shadow-[0_12px_32px_-8px_rgba(0,0,0,0.25)]">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => setY((v) => v - 1)} className="flex h-8 w-8 items-center justify-center rounded-full" aria-label="이전 연도">‹</button>
        <div className="text-[15px] font-bold">{y}년</div>
        <button type="button" onClick={() => setY((v) => v + 1)} className="flex h-8 w-8 items-center justify-center rounded-full" aria-label="다음 연도">›</button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onPick(y, m)}
            className={`rounded-[10px] py-2 text-[13px] font-semibold ${
              y === year && m === month ? 'bg-hh-pine text-white' : 'bg-hh-bg text-hh-ink'
            }`}
          >
            {m}월
          </button>
        ))}
      </div>
      <button type="button" onClick={onClose} className="mt-3 w-full rounded-[10px] border border-hh-border bg-white py-2 text-[13px] font-semibold text-hh-ink-muted">
        닫기
      </button>
    </div>
  )
}

/** "추가 지출액"처럼 품목(항목명+금액)을 여러 줄 쌓아서 합계를 보여주는 카테고리 한 줄. */
function ItemizedRow({
  category,
  year,
  month,
  items,
  onChanged,
}: {
  category: ExpenseCategory
  year: number
  month: number
  items: ExpenseEntry[]
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editAmount, setEditAmount] = useState('')
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

  function startEdit(it: ExpenseEntry) {
    setEditingId(it.id)
    setEditLabel(it.memo ?? '')
    setEditAmount(formatWon(it.amount))
  }

  async function saveEdit(id: number) {
    const parsed = parseWonInput(editAmount)
    setSaving(true)
    try {
      await updateEntry(id, { amount: parsed, memo: editLabel.trim() })
      setEditingId(null)
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
    <div className="flex flex-col rounded-[14px]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-[52px] w-full items-center justify-between border-none bg-transparent px-3 text-left text-hh-ink">
        <div className="text-[15px]">{category.name}</div>
        <div className="flex items-center gap-2">
          <div className="text-[15px] font-semibold">{formatWon(total)}</div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="stroke-hh-neutral"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: open ? 'rotate(90deg)' : undefined }}
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          {items.length === 0 && <p className="m-0 pb-1 text-[13px] text-hh-ink-muted">등록된 품목이 없어요.</p>}
          {items.map((it) =>
            editingId === it.id ? (
              <div key={it.id} className="flex gap-1.5 py-1">
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="항목명"
                  className="min-w-0 flex-1 rounded-[10px] border border-hh-pine bg-white px-2.5 py-1.5 text-[14px] outline-none"
                />
                <input
                  inputMode="numeric"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-[90px] flex-none rounded-[10px] border border-hh-pine bg-white px-2.5 py-1.5 text-right text-[14px] tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => saveEdit(it.id)}
                  disabled={saving}
                  className="flex-none rounded-[10px] bg-hh-pine px-3 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  저장
                </button>
              </div>
            ) : (
              <div key={it.id} className="flex items-center gap-2 py-1 text-[14px]">
                <button
                  type="button"
                  onClick={() => startEdit(it)}
                  className="flex min-w-0 flex-1 items-center gap-2 border-none bg-transparent p-0 text-left"
                >
                  <div className="flex-1 truncate text-hh-ink-muted">{it.memo || '(이름 없음)'}</div>
                  <div className="font-medium tabular-nums">{formatWon(it.amount)}원</div>
                </button>
                <button type="button" onClick={() => removeItem(it.id)} className="px-1 text-hh-ink-muted" aria-label="품목 삭제">
                  ✕
                </button>
              </div>
            ),
          )}
          <div className="mt-1 flex gap-1.5">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="항목명"
              className="min-w-0 flex-1 rounded-[10px] border border-hh-border bg-hh-bg px-2.5 py-2 text-[14px] outline-none focus:border-hh-pine"
            />
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="금액"
              className="w-[90px] flex-none rounded-[10px] border border-hh-border bg-hh-bg px-2.5 py-2 text-right text-[14px] tabular-nums outline-none focus:border-hh-pine"
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
