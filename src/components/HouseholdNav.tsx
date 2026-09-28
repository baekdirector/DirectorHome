import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AppDrawer } from './AppDrawer'

const TABS = [
  { to: '/household', label: '입력' },
  { to: '/household/stats', label: '통계' },
  { to: '/household/categories', label: '관리' },
]

export function HouseholdNav() {
  const { pathname } = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  return (
    <div className="flex items-center gap-3 border-b border-hh-divider bg-surface px-[22px] pt-4">
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="서비스 전환 메뉴 열기"
        className="mr-1 flex items-center gap-1.5 pb-3"
      >
        <img src="/icons/icon-192.png" alt="" width={22} height={22} className="h-[22px] w-[22px] rounded-[6px]" />
        <span className="text-[15px] font-bold text-hh-pine">가계부</span>
      </button>
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
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
