import { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    getSummary(year).then(setSummary)
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

  const latestMonth = summary?.months[summary.months.length - 1]
  const shareData = latestMonth
    ? [
        { name: '고정비', value: latestMonth.fixedTotal, color: COLOR.fixed },
        { name: '카드', value: latestMonth.cardTotal, color: COLOR.card },
        { name: '통신·공과', value: latestMonth.utilityTotal, color: COLOR.utility },
        { name: '기타변동', value: latestMonth.variableTotal, color: COLOR.variable },
      ].filter((d) => d.value > 0)
    : []

  const flowData = (summary?.months ?? []).map((m) => ({ month: `${m.month}월`, 수입: m.income, 지출: m.expenseTotal }))

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
