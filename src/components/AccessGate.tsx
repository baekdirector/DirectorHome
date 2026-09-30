import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PasswordGateDialog } from './PasswordGateDialog'
import { isAccessTokenValid, verifyPassword } from '../lib/household'

const TOKEN_KEY = 'hh_access_until'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function hasValidAccess(): boolean {
  return isAccessTokenValid(localStorage.getItem(TOKEN_KEY), Date.now())
}

/** 비밀번호로 보호되는 화면(가계부·OPIC)을 감싸는 접근 게이트.
 *  두 메뉴가 같은 토큰을 쓰므로 한쪽에서 로그인하면 다른 쪽도 바로 열린다. */
export function AccessGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(hasValidAccess)
  const navigate = useNavigate()

  if (unlocked) return <>{children}</>

  return (
    <PasswordGateDialog
      verify={verifyPassword}
      onSuccess={() => {
        localStorage.setItem(TOKEN_KEY, String(Date.now() + THIRTY_DAYS_MS))
        setUnlocked(true)
      }}
      onCancel={() => navigate('/')}
    />
  )
}
