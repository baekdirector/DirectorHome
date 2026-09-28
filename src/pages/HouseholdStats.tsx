import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { HouseholdGate } from '../components/HouseholdGate'
import { HouseholdNav } from '../components/HouseholdNav'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import {
  formatWon,
  getCategories,
  getEntries,
  getSummary,
  type ExpenseCategory,
  type ExpenseEntry,
  type ExpenseSummary,
} from '../lib/household'

const GROUP_COLOR = { income: '#B98A3D', fixed: '#123A34', card: '#A2432E', utility: '#1f6f6b', variable: '#8a8674' }

// 그룹 내부(카드사별, 수입 항목별)를 구분할 때 쓰는 보조 팔레트.
// dataviz 스킬 validate_palette.js로 검증 완료 (light, surface #faf7f0 기준 전부 PASS).
const SUB_PALETTE = ['#9B2D4F', '#2E5FA3', '#5C7A29', '#D68A1F']
const FALLBACK_SUB_COLOR = '#8a8674'

const CARD_ORDER = ['현대카드', '신한카드', '우리카드', '삼성카드']
const INCOME_BUCKETS = ['월급', '이자', '추가 입금액']

/** 차트 Y축용 축약 표기: 1억 이상은 "1.6억", 1만 이상은 "500만", 그 미만은 그대로. */
function formatCompactWon(v: number): string {
  if (Math.abs(v) >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 10_000)}만`
  return `${v}`
}

type Tab = 'expense' | 'income' | 'balance'

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
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null)
  const [entries, setEntries] = useState<ExpenseEntry[] | null>(null)
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  // 연도를 빠르게 바꿀 때 이전 연도의 응답이 나중에 도착해 최신 화면을 덮어쓰지 않도록 "마지막 요청만 반영" 가드.
  const requestIdRef = useRef(0)

  const load = () => {
    const requestId = ++requestIdRef.current
    setLoadFailed(false)
    Promise.all([getCategories(), getEntries(year), getSummary(year)])
      .then(([cats, ents, sum]) => {
        if (requestIdRef.current !== requestId) return
        setCategories(cats)
        setEntries(ents)
        setSummary(sum)
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        setLoadFailed(true)
      })
  }

  useEffect(load, [year])

  // categoryId+month -> 합계 (같은 카테고리에 중복 entry는 없지만, 안전하게 합산)
  const byCategoryMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries ?? []) {
      const key = `${e.categoryId}-${e.month}`
      map.set(key, (map.get(key) ?? 0) + e.amount)
    }
    return map
  }, [entries])

  const trendData = useMemo(
    () =>
      (summary?.months ?? []).map((m) => ({
        month: `${m.month}월`,
        고정비: m.fixedTotal,
        카드: m.cardTotal,
        '통신·공과': m.utilityTotal,
        기타변동: m.variableTotal,
      })),
    [summary],
  )

  const cardTrendData = useMemo(() => {
    const cardCategories = (categories ?? []).filter((c) => c.groupType === 'card' && !c.archivedAt)
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1
      const row: Record<string, string | number> = { month: `${month}월` }
      for (const c of cardCategories) row[c.name] = byCategoryMonth.get(`${c.id}-${month}`) ?? 0
      return row
    })
  }, [categories, byCategoryMonth])

  const cardNames = useMemo(() => {
    const names = (categories ?? []).filter((c) => c.groupType === 'card' && !c.archivedAt).map((c) => c.name)
    return [...CARD_ORDER.filter((n) => names.includes(n)), ...names.filter((n) => !CARD_ORDER.includes(n))]
  }, [categories])

  const incomeTrendData = useMemo(() => {
    const idByName = new Map((categories ?? []).map((c) => [c.name, c.id]))
    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1
      const row: Record<string, string | number> = { month: `${month}월` }
      for (const name of INCOME_BUCKETS) {
        const id = idByName.get(name)
        row[name] = id != null ? (byCategoryMonth.get(`${id}-${month}`) ?? 0) : 0
      }
      return row
    })
  }, [categories, byCategoryMonth])

  // "이번 달" 랭킹에 쓸 월을 고른다: 조회 연도가 올해면 이번 달, 아니면 데이터가 있는 가장 최근 달.
  const monthsList = summary?.months ?? []
  let latestMonth = year === now.getFullYear() ? monthsList.find((m) => m.month === now.getMonth() + 1) : undefined
  if (!latestMonth) {
    for (let i = monthsList.length - 1; i >= 0; i--) {
      if (monthsList[i].expenseTotal > 0 || monthsList[i].income > 0) {
        latestMonth = monthsList[i]
        break
      }
    }
  }
  const latestMonthNum = latestMonth?.month ?? 12

  const expenseRanking = useMemo(() => {
    const rows = (categories ?? [])
      .filter((c) => c.groupType !== 'income' && !c.archivedAt)
      .map((c) => ({
        name: c.name,
        amount: byCategoryMonth.get(`${c.id}-${latestMonthNum}`) ?? 0,
        color: GROUP_COLOR[c.groupType],
      }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
    const total = rows.reduce((sum, r) => sum + r.amount, 0)
    return { rows, total }
  }, [categories, byCategoryMonth, latestMonthNum])

  const incomeRanking = useMemo(() => {
    const bucket = incomeTrendData[latestMonthNum - 1] ?? {}
    const rows = INCOME_BUCKETS.map((name, i) => ({
      name,
      amount: Number(bucket[name as keyof typeof bucket] ?? 0),
      color: SUB_PALETTE[i] ?? FALLBACK_SUB_COLOR,
    }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
    const total = rows.reduce((sum, r) => sum + r.amount, 0)
    return { rows, total }
  }, [incomeTrendData, latestMonthNum])

  const balanceData = useMemo(
    () => (summary?.months ?? []).map((m) => ({ month: `${m.month}월`, 잔액: m.balance })),
    [summary],
  )

  if (loadFailed) {
    return (
      <div className="flex min-h-svh flex-col bg-bg">
        <HouseholdNav />
        <div className="flex-1">
          <LoadError screen={false} message="통계를 불러오지 못했어요." onRetry={load} />
        </div>
      </div>
    )
  }

  if (!categories || !entries || !summary) {
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
        <div className="flex items-center justify-between pt-5">
          <div className="flex gap-1 rounded-full bg-surface-alt p-1">
            {(['expense', 'income', 'balance'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold ${
                  tab === t ? 'bg-hh-pine text-white' : 'text-ink-muted'
                }`}
              >
                {t === 'expense' ? '지출' : t === 'income' ? '수입' : '잔액'}
              </button>
            ))}
          </div>
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
        </div>

        {tab === 'expense' && (
          <>
            <section className="mt-4 rounded-[18px] bg-surface p-4">
              <h2 className="m-0 mb-2 text-[15px] font-bold">그룹별 월별 지출</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid stroke="#eee7d6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} width={38} tickFormatter={formatCompactWon} />
                  <Tooltip formatter={(v: number) => `${formatWon(v)}원`} />
                  <Line type="monotone" dataKey="카드" stroke={GROUP_COLOR.card} strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="고정비" stroke={GROUP_COLOR.fixed} strokeWidth={1.5} dot={false} opacity={0.55} />
                  <Line type="monotone" dataKey="통신·공과" stroke={GROUP_COLOR.utility} strokeWidth={1.5} dot={false} opacity={0.55} />
                  <Line type="monotone" dataKey="기타변동" stroke={GROUP_COLOR.variable} strokeWidth={1.5} dot={false} opacity={0.55} />
                </LineChart>
              </ResponsiveContainer>
              <Legend items={[
                { label: '카드', color: GROUP_COLOR.card, bold: true },
                { label: '고정비', color: GROUP_COLOR.fixed },
                { label: '통신·공과', color: GROUP_COLOR.utility },
                { label: '기타변동', color: GROUP_COLOR.variable },
              ]} />
            </section>

            <section className="mt-4 rounded-[18px] bg-surface p-4">
              <h2 className="m-0 mb-2 text-[15px] font-bold">카드별 월별 추이</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={cardTrendData}>
                  <CartesianGrid stroke="#eee7d6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} width={38} tickFormatter={formatCompactWon} />
                  <Tooltip formatter={(v: number) => `${formatWon(v)}원`} />
                  {cardNames.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={SUB_PALETTE[i] ?? FALLBACK_SUB_COLOR}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <Legend items={cardNames.map((name, i) => ({ label: name, color: SUB_PALETTE[i] ?? FALLBACK_SUB_COLOR }))} />
            </section>

            <RankingList title={`${latestMonthNum}월 지출 랭킹`} rows={expenseRanking.rows} total={expenseRanking.total} />
          </>
        )}

        {tab === 'income' && (
          <>
            <section className="mt-4 rounded-[18px] bg-surface p-4">
              <h2 className="m-0 mb-2 text-[15px] font-bold">항목별 월별 수입</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={incomeTrendData}>
                  <CartesianGrid stroke="#eee7d6" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} width={38} tickFormatter={formatCompactWon} />
                  <Tooltip formatter={(v: number) => `${formatWon(v)}원`} />
                  {INCOME_BUCKETS.map((name, i) => (
                    <Bar key={name} dataKey={name} stackId="income" fill={SUB_PALETTE[i] ?? FALLBACK_SUB_COLOR} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <Legend items={INCOME_BUCKETS.map((name, i) => ({ label: name, color: SUB_PALETTE[i] ?? FALLBACK_SUB_COLOR }))} />
            </section>

            <RankingList title={`${latestMonthNum}월 수입 랭킹`} rows={incomeRanking.rows} total={incomeRanking.total} />
          </>
        )}

        {tab === 'balance' && (
          <section className="mt-4 rounded-[18px] border-t-4 border-hh-gold bg-surface p-4">
            <h2 className="m-0 mb-2 text-[15px] font-bold">누적 잔액 추이</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={balanceData}>
                <CartesianGrid stroke="#eee7d6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval={1} />
                <YAxis tick={{ fontSize: 11 }} width={42} tickFormatter={formatCompactWon} />
                <Tooltip formatter={(v: number) => `${formatWon(v)}원`} />
                <Line type="monotone" dataKey="잔액" stroke={GROUP_COLOR.income} strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </section>
        )}
      </div>
    </div>
  )
}

function Legend({ items }: { items: { label: string; color: string; bold?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: it.color }} />
          <span className={`text-[12px] ${it.bold ? 'font-bold text-ink' : 'text-ink-muted'}`}>{it.label}</span>
        </div>
      ))}
    </div>
  )
}

function RankingList({
  title,
  rows,
  total,
}: {
  title: string
  rows: { name: string; amount: number; color: string }[]
  total: number
}) {
  if (rows.length === 0) return null
  return (
    <section className="mt-4 rounded-[18px] bg-surface p-4">
      <h2 className="m-0 mb-1 text-[15px] font-bold">{title}</h2>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-3 border-b border-hh-divider py-3 last:border-b-0">
          <div className="h-8 w-[3px] flex-none rounded-full" style={{ backgroundColor: r.color }} />
          <div className="flex-1 text-[14.5px] font-medium">{r.name}</div>
          <div className="text-right">
            <div className="text-[14.5px] font-semibold tabular-nums">{formatWon(r.amount)}원</div>
            <div className="text-[12px] text-ink-muted">{total > 0 ? Math.round((r.amount / total) * 100) : 0}%</div>
          </div>
        </div>
      ))}
    </section>
  )
}
