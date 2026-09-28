import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { HouseholdGate } from '../components/HouseholdGate'
import { HouseholdNav } from '../components/HouseholdNav'
import { LoadError } from '../components/LoadError'
import { getSummary, type ExpenseSummary } from '../lib/household'

const COLOR = { income: '#B98A3D', fixed: '#123A34', card: '#A2432E', utility: '#1f6f6b', variable: '#8a8674' }

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
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [summaryFailed, setSummaryFailed] = useState(false)
  // 연도를 빠르게 바꿀 때 이전 연도의 응답이 나중에 도착해 최신 화면을 덮어쓰지 않도록 "마지막 요청만 반영" 가드.
  const requestIdRef = useRef(0)

  const loadSummary = () => {
    const requestId = ++requestIdRef.current
    setSummaryFailed(false)
    getSummary(year)
      .then((data) => {
        if (requestIdRef.current !== requestId) return // 더 최신 요청이 이미 나감 -> 이 응답은 버린다
        setSummary(data)
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        setSummaryFailed(true)
      })
  }

  useEffect(() => {
    loadSummary()
  }, [year])

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

  // "이번 달 비중" 도넛차트에 쓸 월을 고른다. summary.months는 언제나 1~12월이 다 채워져 있으므로
  // 단순히 마지막 요소를 쓰면 항상 12월(대개 데이터 없음)이 선택된다.
  // 1) 조회 중인 연도가 올해라면 이번 달을 우선한다.
  // 2) 아니라면 12월부터 거슬러 올라가며 지출이 있는 가장 최근 달을 찾는다.
  // 3) 그래도 없으면(연도 전체에 데이터 없음) 마지막 달을 그대로 쓴다.
  const monthsList = summary?.months ?? []
  let latestMonth = year === now.getFullYear() ? monthsList.find((m) => m.month === now.getMonth() + 1) : undefined
  if (!latestMonth) {
    for (let i = monthsList.length - 1; i >= 0; i--) {
      if (monthsList[i].expenseTotal > 0) {
        latestMonth = monthsList[i]
        break
      }
    }
  }
  if (!latestMonth) {
    latestMonth = monthsList[monthsList.length - 1]
  }
  const shareData = latestMonth
    ? [
        { name: '고정비', value: latestMonth.fixedTotal, color: COLOR.fixed },
        { name: '카드', value: latestMonth.cardTotal, color: COLOR.card },
        { name: '통신·공과', value: latestMonth.utilityTotal, color: COLOR.utility },
        { name: '기타변동', value: latestMonth.variableTotal, color: COLOR.variable },
      ].filter((d) => d.value > 0)
    : []

  const flowData = (summary?.months ?? []).map((m) => ({ month: `${m.month}월`, 수입: m.income, 지출: m.expenseTotal }))

  if (summaryFailed) {
    return (
      <div className="flex min-h-svh flex-col bg-bg">
        <HouseholdNav />
        <div className="flex-1">
          <LoadError screen={false} message="통계를 불러오지 못했어요." onRetry={loadSummary} />
        </div>
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
        </div>

        <section className="mt-5 rounded-[18px] bg-surface p-4">
          <h2 className="m-0 mb-2 text-[15px] font-bold">월별 추이</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData}>
              <CartesianGrid stroke="#eee7d6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={48} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="고정비" stroke={COLOR.fixed} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="카드" stroke={COLOR.card} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="통신·공과" stroke={COLOR.utility} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="기타변동" stroke={COLOR.variable} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section className="rounded-[18px] bg-surface p-4">
            <h2 className="m-0 mb-2 text-[15px] font-bold">이번 달 비중</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={shareData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {shareData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </section>

          <section className="rounded-[18px] bg-surface p-4">
            <h2 className="m-0 mb-2 text-[15px] font-bold">수입 vs 지출</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={flowData}>
                <CartesianGrid stroke="#eee7d6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={48} />
                <Tooltip />
                <Legend />
                <Bar dataKey="수입" fill={COLOR.income} radius={[4, 4, 0, 0]} />
                <Bar dataKey="지출" fill={COLOR.card} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
        </div>
      </div>
    </div>
  )
}
