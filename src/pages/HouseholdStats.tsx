import { useEffect, useMemo, useRef, useState } from 'react'
import { HouseholdGate } from '../components/HouseholdGate'
import { HouseholdNav } from '../components/HouseholdNav'
import { HouseholdBottomNav } from '../components/HouseholdBottomNav'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import {
  formatWon,
  getCategories,
  getEntries,
  getSettings,
  getSummary,
  type ExpenseCategory,
  type ExpenseEntry,
  type ExpenseMonthSummary,
} from '../lib/household'

const CARD_ORDER = ['현대카드', '신한카드', '우리카드', '삼성카드']
const CARD_PALETTE = ['#9B2D4F', '#2E5FA3', '#5C7A29', '#D68A1F']
const CARD_FALLBACK_COLOR = '#8a8674'
const INCOME_BUCKETS = ['월급', '이자', '추가 입금액']
const INCOME_PALETTE = ['#9B2D4F', '#2E5FA3', '#5C7A29']

type Tab = 'expense' | 'income' | 'balance'

function man(n: number) {
  return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`
}

/** 최근 N개월 비교 막대의 명도: 가장 오래된 달은 흐리게, 이번 달은 진하게. */
function monthOpacity(index: number, total: number) {
  if (total <= 1) return 1
  return 0.45 + (0.55 * index) / (total - 1)
}

export function HouseholdStats() {
  return (
    <HouseholdGate>
      <StatsContent />
    </HouseholdGate>
  )
}

function StatsContent() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [tab, setTab] = useState<Tab>('expense')
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null)
  const [openingYear, setOpeningYear] = useState<number | null>(null)
  const [yearPickerOpen, setYearPickerOpen] = useState(false)
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null)
  const [entries, setEntries] = useState<ExpenseEntry[] | null>(null)
  const [months, setMonths] = useState<ExpenseMonthSummary[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    getSettings().then((s) => setOpeningYear(s?.openingYear ?? now.getFullYear()))
  }, [])

  const load = () => {
    const requestId = ++requestIdRef.current
    setLoadFailed(false)
    Promise.all([getCategories(), getEntries(year), getSummary(year)])
      .then(([cats, ents, sum]) => {
        if (requestIdRef.current !== requestId) return
        setCategories(cats)
        setEntries(ents)
        setMonths(sum.months)
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        setLoadFailed(true)
      })
  }

  useEffect(load, [year])

  const sumsByCategoryMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries ?? []) {
      const key = `${e.categoryId}-${e.month}`
      map.set(key, (map.get(key) ?? 0) + e.amount)
    }
    return map
  }, [entries])
  const sumFor = (categoryId: number, m: number) => sumsByCategoryMonth.get(`${categoryId}-${m}`) ?? 0

  const monthsElapsed = year === now.getFullYear() ? now.getMonth() + 1 : 12
  const currentMonthIdx = monthsElapsed - 1
  // 이번 달을 포함해 최근 3개월(예: 7,8,9월). 연초라 3개월이 안 되면 있는 만큼만.
  const currentMonth = currentMonthIdx + 1
  const recentMonths = [currentMonth - 2, currentMonth - 1, currentMonth].filter((m) => m >= 1)

  const spends = useMemo(() => (months ?? []).map((m) => m.expenseTotal), [months])
  const incomes = useMemo(() => (months ?? []).map((m) => m.income), [months])
  const balances = useMemo(() => (months ?? []).map((m) => m.balance), [months])

  const cardCategories = useMemo(() => {
    const cats = (categories ?? []).filter((c) => c.groupType === 'card' && !c.archivedAt)
    const ordered = [...CARD_ORDER.filter((n) => cats.some((c) => c.name === n)), ...cats.map((c) => c.name).filter((n) => !CARD_ORDER.includes(n))]
    return ordered.map((n, i) => ({ cat: cats.find((c) => c.name === n)!, color: CARD_PALETTE[i] ?? CARD_FALLBACK_COLOR })).filter((x) => x.cat)
  }, [categories])

  if (loadFailed) {
    return (
      <div className="flex min-h-svh flex-col bg-hh-bg">
        <HouseholdNav />
        <div className="flex-1">
          <LoadError screen={false} message="통계를 불러오지 못했어요." onRetry={load} />
        </div>
      </div>
    )
  }

  if (!categories || !entries || !months) {
    return (
      <div className="flex min-h-svh flex-col bg-hh-bg">
        <HouseholdNav />
        <Loading />
      </div>
    )
  }

  const elapsedSpends = spends.slice(0, monthsElapsed)
  const yearSpend = elapsedSpends.reduce((a, b) => a + b, 0)
  const avgSpend = monthsElapsed > 0 ? yearSpend / monthsElapsed : 0
  const maxSpend = Math.max(...elapsedSpends, 0)
  const minSpend = elapsedSpends.length ? Math.min(...elapsedSpends) : 0
  const maxMonthIdx = elapsedSpends.indexOf(maxSpend)
  const minMonthIdx = elapsedSpends.indexOf(minSpend)
  const curSpend = spends[currentMonthIdx] ?? 0
  const prevSpend = currentMonthIdx > 0 ? spends[currentMonthIdx - 1] : null
  const momPct = prevSpend && prevSpend > 0 ? ((curSpend - prevSpend) / prevSpend) * 100 : null
  const barScale = 150 / Math.max(maxSpend, 1)

  return (
    <div className="flex min-h-svh flex-col bg-hh-bg font-hh-sans text-hh-ink">
      <HouseholdNav />
      <div className="flex items-center justify-between px-5 pb-3 pt-1">
        <div className="font-hh-serif text-[24px] font-bold">통계</div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setYearPickerOpen((v) => !v)}
            className="flex h-10 items-center gap-1.5 rounded-full border border-hh-border bg-white px-3.5 text-[14px] font-semibold"
          >
            {year}년
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E2B27" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {yearPickerOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setYearPickerOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1.5 max-h-[240px] w-[110px] overflow-y-auto rounded-[14px] border border-hh-border bg-white py-1.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.18)]">
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
                      className={`block w-full px-3.5 py-2 text-left text-[14px] font-semibold ${y === year ? 'text-hh-pine' : 'text-hh-ink'}`}
                    >
                      {y}년
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="grid grid-cols-3 gap-1 rounded-[16px] bg-[#EAE3D7] p-1">
          {(['expense', 'income', 'balance'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-10 rounded-xl text-[14px] font-semibold ${
                tab === t ? 'bg-white text-hh-pine shadow-[0_2px_8px_-4px_rgba(30,43,39,0.3)]' : 'bg-transparent text-[#5E5D57]'
              }`}
            >
              {t === 'expense' ? '지출' : t === 'income' ? '수입' : '잔액'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 pb-24">
        {tab === 'expense' && (
          <>
            <div className="flex flex-col gap-4 rounded-[24px] bg-white p-5">
              <div className="flex flex-col gap-1">
                <div className="text-[13px] text-hh-ink-muted">올해 총 지출 · 1–{monthsElapsed}월</div>
                <div className="flex items-baseline gap-1">
                  <div className="text-[30px] font-bold tracking-tight">{formatWon(yearSpend)}</div>
                  <div className="text-[15px] text-hh-ink-muted">원</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="월평균" value={man(avgSpend)} />
                <MiniStat label={`최다 · ${maxMonthIdx + 1}월`} value={man(maxSpend)} />
                <MiniStat label={`최소 · ${minMonthIdx + 1}월`} value={man(minSpend)} />
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-[24px] bg-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <div className="font-hh-serif text-[18px] font-bold">월별 지출 비교</div>
                  <div className="text-[12px] text-hh-ink-muted">점선은 월평균</div>
                </div>
                {momPct !== null && (
                  <div
                    className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
                    style={{ color: momPct <= 0 ? 'var(--color-hh-down)' : 'var(--color-hh-up)', background: momPct <= 0 ? 'var(--color-hh-down-tint)' : 'var(--color-hh-up-tint)' }}
                  >
                    {currentMonthIdx + 1}월 {momPct <= 0 ? '▼' : '▲'} {Math.abs(momPct).toFixed(1)}%
                  </div>
                )}
              </div>
              <div className="relative flex h-[170px] items-end gap-2 border-b border-hh-divider">
                <div className="absolute left-0 right-0 border-t-[1.5px] border-dashed border-[#B9B3A7]" style={{ bottom: `${avgSpend * barScale}px` }} />
                {spends.map((v, i) => (
                  <div key={i} className="flex h-[170px] flex-1 flex-col items-center justify-end gap-1.5">
                    {i === currentMonthIdx && v > 0 && (
                      <div className="whitespace-nowrap rounded-lg bg-hh-pine px-1.5 py-0.5 text-[11px] font-bold text-white">{man(v)}</div>
                    )}
                    <div
                      className="w-full rounded-t-lg"
                      style={{ height: `${Math.max(2, v * barScale)}px`, background: i === currentMonthIdx ? 'var(--color-hh-pine)' : '#DCE5DF' }}
                    />
                  </div>
                ))}
              </div>
              <div className="-mt-2.5 flex gap-2">
                {spends.map((_, i) => (
                  <div key={i} className={`flex-1 text-center text-[11px] ${i === currentMonthIdx ? 'font-bold text-hh-ink' : 'text-[#8A877E]'}`}>
                    {i + 1}월
                  </div>
                ))}
              </div>
            </div>

            {cardCategories.length > 0 && (
              <div className="flex flex-col gap-4 rounded-[24px] bg-white p-5">
                <div className="flex items-baseline justify-between">
                  <div className="font-hh-serif text-[18px] font-bold">카드별 월별 지출</div>
                  {selectedCardId !== null && (
                    <button type="button" onClick={() => setSelectedCardId(null)} className="text-[12px] font-semibold text-hh-pine">
                      전체 보기
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3.5 gap-y-2">
                  {cardCategories.map(({ cat, color }) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCardId((prev) => (prev === cat.id ? null : cat.id))}
                      className="flex items-center gap-1.5 text-[12px]"
                      style={{ color: selectedCardId === null || selectedCardId === cat.id ? '#4A4A44' : '#B3AEA3', fontWeight: selectedCardId === cat.id ? 700 : 400 }}
                    >
                      <div className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color, opacity: selectedCardId === null || selectedCardId === cat.id ? 1 : 0.35 }} />
                      {cat.name}
                    </button>
                  ))}
                </div>

                {selectedCardId === null ? (
                  <>
                    <div className="flex h-[170px] items-end gap-2 border-b border-hh-divider">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m, i) => {
                        const total = cardCategories.reduce((s, { cat }) => s + sumFor(cat.id, m), 0)
                        const scale = 150 / Math.max(maxCardStackTotal(cardCategories, sumFor), 1)
                        return (
                          <div key={m} className="flex h-[170px] flex-1 flex-col justify-end gap-0.5" style={{ opacity: i === currentMonthIdx ? 1 : 0.75 }}>
                            {cardCategories.map(({ cat, color }) => {
                              const v = sumFor(cat.id, m)
                              if (v <= 0) return null
                              return <div key={cat.id} style={{ height: `${Math.max(2, v * scale)}px`, background: color }} className="w-full rounded-[3px]" />
                            })}
                            {total === 0 && <div className="w-full" style={{ height: 2 }} />}
                          </div>
                        )
                      })}
                    </div>
                    <div className="-mt-2.5 flex gap-2">
                      {spends.map((_, i) => (
                        <div key={i} className={`flex-1 text-center text-[11px] ${i === currentMonthIdx ? 'font-bold text-hh-ink' : 'text-[#8A877E]'}`}>
                          {i + 1}월
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  (() => {
                    const selected = cardCategories.find(({ cat }) => cat.id === selectedCardId)
                    if (!selected) return null
                    const values = Array.from({ length: 12 }, (_, i) => sumFor(selected.cat.id, i + 1))
                    return <SingleCardLineChart name={selected.cat.name} color={selected.color} values={values} currentMonthIdx={currentMonthIdx} />
                  })()
                )}
              </div>
            )}

            {cardCategories.length > 0 && (
              <div className="flex flex-col gap-4 rounded-[24px] bg-white p-5">
                <div className="flex items-baseline justify-between">
                  <div className="font-hh-serif text-[18px] font-bold">카드별 최근 3개월 비교</div>
                  <div className="flex gap-2.5 text-[11px] text-hh-ink-muted">
                    {recentMonths.map((m, i) => (
                      <div key={m} className="flex items-center gap-1">
                        <div className="h-2.5 w-2.5 rounded-[3px]" style={{ background: '#22433B', opacity: monthOpacity(i, recentMonths.length) }} />
                        {m}월
                      </div>
                    ))}
                  </div>
                </div>
                {cardCategories.map(({ cat, color }) => {
                  const rows = recentMonths.map((m) => ({ month: m, amount: sumFor(cat.id, m) }))
                  const max = Math.max(1, ...rows.map((r) => r.amount))
                  return (
                    <div key={cat.id} className="flex flex-col gap-2">
                      <div className="text-[14px] font-medium">{cat.name}</div>
                      <div className="flex flex-col gap-[3px]">
                        {rows.map((r, i) => (
                          <div key={r.month} className="h-[26px] rounded-[6px] bg-hh-bg">
                            <div
                              className="flex h-full items-center justify-end rounded-[6px] px-2"
                              style={{ width: `${Math.max((r.amount / max) * 100, 6)}%`, background: color, opacity: monthOpacity(i, rows.length) }}
                            >
                              <span
                                className="whitespace-nowrap text-[12px] font-semibold text-white"
                                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
                              >
                                {formatWon(r.amount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {tab === 'income' && (
          <div className="flex flex-col gap-4 rounded-[24px] bg-white p-5">
            <div className="font-hh-serif text-[18px] font-bold">항목별 월별 수입</div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-2">
              {INCOME_BUCKETS.map((name, i) => (
                <div key={name} className="flex items-center gap-1.5 text-[12px] text-[#4A4A44]">
                  <div className="h-2.5 w-2.5 rounded-[3px]" style={{ background: INCOME_PALETTE[i] }} />
                  {name}
                </div>
              ))}
            </div>
            <div className="flex h-[200px] items-end gap-2 border-b border-hh-divider">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const idByName = new Map((categories ?? []).map((c) => [c.name, c.id]))
                const vals = INCOME_BUCKETS.map((n) => {
                  const id = idByName.get(n)
                  return id != null ? sumFor(id, m) : 0
                })
                const total = vals.reduce((a, b) => a + b, 0)
                const scale = 180 / Math.max(...incomes, 1)
                return (
                  <div key={m} className="flex h-[200px] flex-1 flex-col justify-end gap-0.5">
                    {vals.map((v, i) =>
                      v > 0 ? <div key={i} style={{ height: `${Math.max(2, v * scale)}px`, background: INCOME_PALETTE[i] }} className="w-full rounded-[3px]" /> : null,
                    )}
                    {total === 0 && <div className="w-full" style={{ height: 2 }} />}
                  </div>
                )
              })}
            </div>
            <div className="-mt-2.5 flex gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <div key={m} className="flex-1 text-center text-[11px] text-[#8A877E]">
                  {m}월
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'balance' && (
          <BalanceChart balances={balances} currentMonthIdx={currentMonthIdx} />
        )}
      </div>

      <HouseholdBottomNav />
    </div>
  )
}

function maxCardStackTotal(cardCategories: { cat: ExpenseCategory }[], sumFor: (id: number, m: number) => number) {
  let max = 0
  for (let m = 1; m <= 12; m++) {
    const total = cardCategories.reduce((s, { cat }) => s + sumFor(cat.id, m), 0)
    if (total > max) max = total
  }
  return max
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[16px] bg-hh-bg p-3">
      <div className="text-[11px] text-hh-ink-muted">{label}</div>
      <div className="text-[14px] font-bold">{value}</div>
    </div>
  )
}

function SingleCardLineChart({
  name,
  color,
  values,
  currentMonthIdx,
}: {
  name: string
  color: string
  values: number[]
  currentMonthIdx: number
}) {
  const W = 310
  const top = 150
  const maxY = Math.max(...values, 1) * 1.15
  const pts = values.map((v, i) => [i * (W / Math.max(values.length - 1, 1)), top - (v / maxY) * 140] as const)
  let d = pts.length ? `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` : ''
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const mx = (x0 + x1) / 2
    d += ` C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between">
        <div className="text-[14px] font-semibold" style={{ color }}>
          {name} 월별 추이
        </div>
        <div className="text-[16px] font-bold" style={{ color }}>
          {formatWon(values[currentMonthIdx] ?? 0)}
        </div>
      </div>
      <div className="relative">
        <svg width="100%" height="170" viewBox="0 0 310 170" preserveAspectRatio="none" style={{ display: 'block' }}>
          <line x1="0" y1="18.75" x2="310" y2="18.75" stroke="#F1ECE3" strokeWidth="1" />
          <line x1="0" y1="62.5" x2="310" y2="62.5" stroke="#F1ECE3" strokeWidth="1" />
          <line x1="0" y1="106.25" x2="310" y2="106.25" stroke="#F1ECE3" strokeWidth="1" />
          <line x1="0" y1="150" x2="310" y2="150" stroke="#ECE6DC" strokeWidth="1" />
          {d && <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === currentMonthIdx ? 4.5 : 2.5} fill={color} />
          ))}
        </svg>
        <div className="absolute left-0 top-[10px] text-[10px] text-[#8A877E]">{man(0.75 * maxY)}</div>
        <div className="absolute left-0 top-[98px] text-[10px] text-[#8A877E]">{man(0.25 * maxY)}</div>
      </div>
      <div className="flex gap-2">
        {values.map((_, i) => (
          <div key={i} className={`flex-1 text-center text-[11px] ${i === currentMonthIdx ? 'font-bold text-hh-ink' : 'text-[#8A877E]'}`}>
            {i + 1}월
          </div>
        ))}
      </div>
    </div>
  )
}

function BalanceChart({ balances, currentMonthIdx }: { balances: number[]; currentMonthIdx: number }) {
  const W = 310
  const top = 150
  const maxY = Math.max(...balances, 1) * 1.15
  const pts = balances.map((v, i) => [i * (W / Math.max(balances.length - 1, 1)), top - (v / maxY) * 140] as const)
  let d = pts.length ? `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` : ''
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    const mx = (x0 + x1) / 2
    d += ` C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`
  }
  const areaD = d ? `${d} L${W} ${top} L0 ${top} Z` : ''

  return (
    <div className="flex flex-col gap-3.5 rounded-[24px] bg-white p-5">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <div className="font-hh-serif text-[18px] font-bold">누적 잔액 추이</div>
          <div className="text-[12px] text-hh-ink-muted">매달 남은 돈을 쌓아 본 흐름</div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-[17px] font-bold text-hh-pine">{formatWon(balances[currentMonthIdx] ?? 0)}</div>
          <div className="text-[11px] text-hh-ink-muted">{currentMonthIdx + 1}월 말 기준</div>
        </div>
      </div>
      <div className="relative">
        <svg width="100%" height="170" viewBox="0 0 310 170" preserveAspectRatio="none" style={{ display: 'block' }}>
          <line x1="0" y1="18.75" x2="310" y2="18.75" stroke="#F1ECE3" strokeWidth="1" />
          <line x1="0" y1="62.5" x2="310" y2="62.5" stroke="#F1ECE3" strokeWidth="1" />
          <line x1="0" y1="106.25" x2="310" y2="106.25" stroke="#F1ECE3" strokeWidth="1" />
          <line x1="0" y1="150" x2="310" y2="150" stroke="#ECE6DC" strokeWidth="1" />
          {areaD && <path d={areaD} fill="#8FAE9E" fillOpacity="0.22" />}
          {d && <path d={d} fill="none" stroke="#22433B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
        <div className="absolute left-0 top-[10px] text-[10px] text-[#8A877E]">{man(0.75 * Math.max(...balances, 1) * 1.15)}</div>
        <div className="absolute left-0 top-[98px] text-[10px] text-[#8A877E]">{man(0.25 * Math.max(...balances, 1) * 1.15)}</div>
      </div>
      <div className="flex justify-between text-[11px] text-hh-ink-muted">
        {[1, 3, 5, 7, 9, 11].map((m) => (
          <div key={m}>{m}월</div>
        ))}
      </div>
    </div>
  )
}
