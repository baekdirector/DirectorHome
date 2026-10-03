import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from './icons'
import { OwnerSwitch } from './ProfileGate'

/** 부모 화면 안에서 오갈 섹션들. */
const ADMIN_TABS = [
  { to: '/admin', label: '숙제 관리' },
  { to: '/admin/wordsets', label: '단어장 관리' },
  { to: '/admin/passwords', label: '비밀번호 관리' },
]

/**
 * 부모 화면의 주 메뉴. 가계부·OPIC과 같은 방식이다 --
 * 좁은 화면에서는 상단 가로 탭, 넓은 화면에서는 왼쪽 사이드바.
 * 보고 있는 아이를 바꾸는 전환 버튼도 여기 함께 둔다(모든 섹션이 그 아이 것만 보여준다).
 */
export function AdminNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isActive = (to: string) => (to === '/admin' ? pathname === '/admin' : pathname.startsWith(to))

  const heading = (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        aria-label="홈으로"
        onClick={() => navigate('/')}
        className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full text-ink"
      >
        <ArrowLeftIcon />
      </button>
      <h2 className="m-0 truncate text-[17px] font-bold">부모 화면</h2>
    </div>
  )

  return (
    <>
      {/* 좁은 화면: 상단 제목 + 가로 탭 */}
      <div className="flex flex-col gap-3 px-[18px] pb-1 pt-[18px] lg:hidden">
        <div className="flex items-center justify-between gap-2">
          {heading}
          <OwnerSwitch />
        </div>
        <nav aria-label="부모 화면 메뉴" className="flex gap-1 rounded-xl bg-surface-alt p-1">
          {ADMIN_TABS.map((tab) => {
            const active = isActive(tab.to)
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 rounded-lg py-2 text-center text-[13px] no-underline ${
                  active
                    ? 'bg-surface font-bold text-ink shadow-[0_1px_3px_rgba(31,42,39,0.12)]'
                    : 'font-medium text-ink-muted'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* 넓은 화면: 왼쪽 사이드바. 본문이 길어도 바탕이 끝까지 이어지도록 배경은 nav가 갖는다. */}
      <nav aria-label="부모 화면 메뉴" className="hidden w-60 flex-none border-r border-border bg-surface-alt lg:block">
        <div className="sticky top-0 flex flex-col gap-8 px-4 py-6">
          <div className="px-1">{heading}</div>
          <div className="flex flex-col gap-1">
            {ADMIN_TABS.map((tab) => {
              const active = isActive(tab.to)
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-11 items-center rounded-xl px-4 text-[15px] no-underline transition-colors ${
                    active ? 'bg-primary font-semibold text-white' : 'font-medium text-ink hover:bg-black/5'
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>
          <div className="px-1">
            <div className="mb-1.5 text-[12.5px] font-bold text-ink-muted">보고 있는 아이</div>
            <OwnerSwitch />
          </div>
        </div>
      </nav>
    </>
  )
}
