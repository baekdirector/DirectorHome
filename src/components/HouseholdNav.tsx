import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AppDrawer } from './AppDrawer'
import { HOUSEHOLD_TABS } from './householdTabs'

/**
 * 가계부 화면 상단 바. 좌측 아이콘을 누르면 JunsVoca/가계부 전환 드로우어가 열린다.
 * 넓은 화면에서는 하단 탭바 대신 이 바 오른쪽에 화면 전환 메뉴가 들어간다.
 */
export function HouseholdNav() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <header className="bg-hh-bg lg:sticky lg:top-0 lg:z-30 lg:border-b lg:border-hh-divider lg:bg-hh-bg/90 lg:backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 pb-2 pt-5 lg:px-8 lg:py-3.5">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="서비스 전환 메뉴 열기"
          className="flex items-center gap-2.5"
        >
          <img src="/icons/icon-192.png" alt="" width={36} height={36} className="h-9 w-9 flex-none rounded-[10px]" />
          <span className="font-hh-serif text-[19px] font-bold tracking-tight text-hh-ink">우리집 가계부</span>
        </button>

        <nav className="hidden items-center gap-1 lg:flex">
          {HOUSEHOLD_TABS.map((tab) => {
            const active = pathname === tab.to
            return (
              <Link
                key={tab.to}
                to={tab.to}
                replace
                aria-current={active ? 'page' : undefined}
                className={`rounded-full px-4 py-2 text-[14px] no-underline transition-colors ${
                  active ? 'bg-hh-pine font-bold text-white' : 'font-medium text-hh-ink-muted hover:bg-black/5'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </header>
  )
}
