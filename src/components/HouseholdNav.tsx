import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AppDrawer } from './AppDrawer'
import { HOUSEHOLD_TABS } from './householdTabs'

/**
 * 가계부 화면의 주 메뉴.
 * 좁은 화면에서는 상단 바만 두고 화면 전환은 하단 탭바가 맡는다.
 * 넓은 화면에서는 왼쪽 사이드바가 되어 브랜드와 화면 전환을 함께 갖는다.
 * 어느 쪽이든 브랜드를 누르면 JunsVoca/가계부 전환 드로우어가 열린다.
 */
export function HouseholdNav() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()

  const brand = (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label="서비스 전환 메뉴 열기"
      className="flex items-center gap-3"
    >
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-9 w-9 flex-none rounded-[10px] lg:h-10 lg:w-10 lg:rounded-xl" />
      <span className="font-hh-serif text-[19px] font-bold tracking-tight text-hh-ink lg:text-[18px]">우리집 가계부</span>
    </button>
  )

  return (
    <>
      <div className="flex items-center justify-between bg-hh-bg px-5 pb-2 pt-5 lg:hidden">{brand}</div>

      {/* 본문이 길어도 사이드바 바탕이 끝까지 이어지도록, 배경은 늘어나는 nav가 갖고
          내용만 붙여 둔다. */}
      <nav aria-label="주 메뉴" className="hidden w-60 flex-none border-r border-hh-border bg-hh-sidebar lg:block">
        <div className="sticky top-0 flex flex-col gap-9 px-5 py-7">
        <div className="px-2">{brand}</div>
        <div className="flex flex-col gap-1">
          {HOUSEHOLD_TABS.map((tab) => {
            const active = pathname === tab.to
            return (
              <Link
                key={tab.to}
                to={tab.to}
                replace
                aria-current={active ? 'page' : undefined}
                className={`flex h-12 items-center gap-3 rounded-xl px-4 text-[15px] no-underline transition-colors ${
                  active ? 'bg-hh-pine font-semibold text-white' : 'font-medium text-[#3F4743] hover:bg-black/5'
                }`}
              >
                {tab.icon(active ? '#FFFFFF' : '#3F4743')}
                {tab.label}
              </Link>
            )
          })}
        </div>
        </div>
      </nav>

      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
