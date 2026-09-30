// 가계부 화면 네비게이션 항목. 좁은 화면에서는 하단 탭바가, 넓은 화면에서는 상단 바가 쓴다.

export interface HouseholdTab {
  to: string
  label: string
  icon: (color: string) => React.ReactNode
}

export const HOUSEHOLD_TABS: HouseholdTab[] = [
  {
    to: '/household',
    label: '요약·입력',
    icon: (color) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5V20H3z" />
      </svg>
    ),
  },
  {
    to: '/household/stats',
    label: '통계',
    icon: (color) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    to: '/household/categories',
    label: '관리',
    icon: (color) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
]
