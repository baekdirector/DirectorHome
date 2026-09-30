import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AppDrawer } from './AppDrawer'

const TABS = [
  { to: '/household', label: '가계부' },
  { to: '/opic', label: 'OPIC' },
]

/**
 * OPIC 화면의 주 메뉴.
 * 좁은 화면에서는 상단 바만 두고, 넓은 화면에서는 왼쪽 검정 사이드바가 된다.
 * 동작하는 항목만 둔다 — 복습함·음성 설정은 그 기능이 생기는 단계에 추가한다.
 */
export function OpicNav() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()
  const onOpic = pathname.startsWith('/opic')

  const brand = (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label="서비스 전환 메뉴 열기"
      className="flex items-center gap-2.5"
    >
      <img src="/icons/icon-192.png" alt="" width={36} height={36} className="h-9 w-9 flex-none rounded-[10px]" />
      <span className="text-[18px] font-bold tracking-tight">OPIC 스크립트</span>
    </button>
  )

  return (
    <>
      <div className="flex items-center justify-between bg-op-bg px-5 pb-2 pt-5 text-op-ink lg:hidden">{brand}</div>

      <nav aria-label="주 메뉴" className="hidden w-[232px] flex-none bg-op-ink text-white lg:block">
        <div className="sticky top-0 flex flex-col gap-8 px-3.5 py-6">
          <div className="px-2 text-white">{brand}</div>
          <div className="flex flex-col gap-1">
            {TABS.map((tab) => {
              const active = tab.to === '/opic' ? onOpic : pathname.startsWith(tab.to)
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-[10px] px-3 py-2.5 text-[15px] no-underline transition-colors ${
                    active ? 'bg-op-accent font-semibold text-white' : 'text-[#C9CCD6] hover:bg-white/10'
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>
          <div className="mt-auto px-3 text-[13px] text-[#9CA1AE]">가계부와 같은 비밀번호</div>
        </div>
      </nav>

      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
