import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/household', label: '입력' },
  { to: '/household/stats', label: '통계' },
  { to: '/household/categories', label: '관리' },
]

export function HouseholdNav() {
  const { pathname } = useLocation()
  return (
    <div className="flex items-center gap-3 border-b border-hh-divider bg-surface px-[22px] pt-4">
      <Link to="/" className="mr-1 pb-3 text-[13px] font-semibold text-ink-muted">
        ← 홈
      </Link>
      {TABS.map((tab) => {
        const active = pathname === tab.to
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`border-b-2 px-1 pb-3 text-[14px] font-semibold ${
              active ? 'border-hh-pine text-hh-pine' : 'border-transparent text-ink-muted'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
