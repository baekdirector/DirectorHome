import { Link, useLocation } from 'react-router-dom'

const TABS = [
  {
    to: '/household',
    label: '요약·입력',
    icon: (color: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5V20H3z" />
      </svg>
    ),
  },
  {
    to: '/household/stats',
    label: '통계',
    icon: (color: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    to: '/household/categories',
    label: '관리',
    icon: (color: string) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
]

/** 가계부 화면 하단 탭바(요약·입력/통계/관리). 상단 좌측 드로우어 트리거(HouseholdNav)와는 별개다. */
export function HouseholdBottomNav() {
  const { pathname } = useLocation()
  return (
    <div className="mt-auto flex justify-around border-t border-hh-divider bg-white px-3 pb-6 pt-2">
      {TABS.map((tab) => {
        const active = pathname === tab.to
        const color = active ? 'var(--color-hh-pine)' : 'var(--color-hh-ink-muted)'
        return (
          <Link
            key={tab.to}
            to={tab.to}
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
