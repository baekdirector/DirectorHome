import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AppDrawer } from './AppDrawer'

/** OPIC 안에서 오갈 화면들. 서비스 전환(JunsVoca·가계부)은 브랜드를 눌러 여는 드로우어가 맡는다. */
const TABS = [
  { to: '/opic', label: 'OPIC 스크립트', exact: true },
  { to: '/opic/mock', label: '사전 모의테스트', exact: false },
]

export function OpicNav() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()

  const isActive = (to: string, exact: boolean) =>
    exact ? pathname === to || pathname.startsWith('/opic/t/') : pathname.startsWith(to)

  const brand = (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label="서비스 전환 메뉴 열기"
      className="flex items-center gap-2.5"
    >
      <img src="/icons/icon-192.png" alt="" width={36} height={36} className="h-9 w-9 flex-none rounded-[10px]" />
      <span className="text-[19px] font-bold tracking-tight">OPIC</span>
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
              const active = isActive(tab.to, tab.exact)
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
        </div>
      </nav>

      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
