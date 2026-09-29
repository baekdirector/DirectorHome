import { useState } from 'react'
import { AppDrawer } from './AppDrawer'

/** 가계부 화면 상단 바. 좌측 아이콘을 누르면 JunsVoca/가계부 전환 드로우어가 열린다(기존 동작 유지). */
export function HouseholdNav() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  return (
    <div className="flex items-center justify-between bg-hh-bg px-5 pb-2 pt-5">
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="서비스 전환 메뉴 열기"
        className="flex items-center gap-2.5"
      >
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-hh-pine">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F5F1EA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20h14V9.5" />
            <path d="M10 20v-5h4v5" />
          </svg>
        </div>
        <span className="font-hh-serif text-[19px] font-bold tracking-tight text-hh-ink">우리집 가계부</span>
      </button>
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
