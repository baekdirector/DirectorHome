import { Link, useLocation } from 'react-router-dom'
import { BookIcon, MicIcon, WalletIcon } from './icons'
import { useProfile } from './ProfileGate'
import { PROFILE_LABEL } from '../lib/profile'

/**
 * DirectorHome 산하 서비스를 전환하는 좌측 슬라이드 메뉴.
 * 가계부·OPIC은 부모 모드(admin)에서만 보인다 -- 아이 화면에 어른 메뉴를 늘어놓지 않는다.
 */
export function AppDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useLocation()
  const { owner, isAdmin, logout } = useProfile()
  const onHousehold = pathname.startsWith('/household')
  const onOpic = pathname.startsWith('/opic')
  const onVoca = !onHousehold && !onOpic

  return (
    <div
      role="presentation"
      onClick={onClose}
      aria-hidden={!open}
      className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="서비스 전환"
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-[78%] max-w-[300px] flex-col bg-surface px-4 pt-6 shadow-xl transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-2">
          <img src="/icons/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 rounded-[8px]" />
          <span className="text-[14px] font-bold text-ink-muted">DirectorHome</span>
        </div>

        <nav className="mt-5 flex flex-col gap-2">
          <Link
            to="/"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-[16px] p-3.5 ${onVoca ? 'bg-primary-tint' : ''}`}
          >
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-accent-tint">
              <BookIcon width={19} height={19} className="text-accent-dark" strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <div className={`text-[15px] font-bold ${onVoca ? 'text-primary' : 'text-ink'}`}>
                {PROFILE_LABEL[owner]}
              </div>
              <div className="text-[12.5px] text-ink-muted">자녀 영단어 학습</div>
            </div>
          </Link>

          {isAdmin && (
          <>

          <Link
            to="/household"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-[16px] p-3.5 ${onHousehold ? 'bg-hh-pine-tint' : ''}`}
          >
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-hh-pine-tint">
              <WalletIcon width={19} height={19} className="text-hh-pine" strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <div className={`text-[15px] font-bold ${onHousehold ? 'text-hh-pine' : 'text-ink'}`}>가계부</div>
              <div className="text-[12.5px] text-ink-muted">우리 집 지출 관리</div>
            </div>
          </Link>

          <Link
            to="/opic"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-[16px] p-3.5 ${onOpic ? 'bg-op-accent-tint' : ''}`}
          >
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-op-accent-tint">
              <MicIcon width={19} height={19} className="text-op-accent" strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <div className={`text-[15px] font-bold ${onOpic ? 'text-op-accent' : 'text-ink'}`}>OPIC</div>
              <div className="text-[12.5px] text-ink-muted">스크립트 암기장</div>
            </div>
          </Link>
          </>
          )}
        </nav>

        <div className="mt-auto border-t border-border py-4">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-[14px] border border-border p-3 text-[13.5px] font-semibold text-ink-muted"
          >
            로그아웃 (다른 사람으로 들어가기)
          </button>
        </div>
      </div>
    </div>
  )
}
