import { Link, useLocation } from 'react-router-dom'
import { HOUSEHOLD_TABS } from './householdTabs'

/**
 * 좁은 화면(휴대폰)용 하단 탭바. 넓은 화면에서는 같은 항목이 상단 바(HouseholdNav)에
 * 들어가므로 여기서는 숨긴다.
 * 화면 내용이 길어 스크롤이 생기므로 fixed로 하단에 고정하고, 각 페이지는 이 바에 가려지지
 * 않도록 하단 padding을 둔다.
 */
export function HouseholdBottomNav() {
  const { pathname } = useLocation()
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-hh-divider bg-white px-3 pb-6 pt-2 lg:hidden">
      {HOUSEHOLD_TABS.map((tab) => {
        const active = pathname === tab.to
        const color = active ? 'var(--color-hh-pine)' : 'var(--color-hh-ink-muted)'
        return (
          <Link
            key={tab.to}
            to={tab.to}
            replace
            className="flex min-w-16 flex-col items-center gap-1 py-2 no-underline"
            style={{ color }}
          >
            {tab.icon(color)}
            <span className={`text-[11px] ${active ? 'font-bold' : 'font-medium'}`}>{tab.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
