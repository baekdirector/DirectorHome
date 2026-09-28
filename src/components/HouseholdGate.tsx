import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PasswordGateDialog } from './PasswordGateDialog'
import { isAccessTokenValid, verifyPassword } from '../lib/household'

const TOKEN_KEY = 'hh_access_until'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function hasValidAccess(): boolean {
  return isAccessTokenValid(localStorage.getItem(TOKEN_KEY), Date.now())
}

/** 가계부 화면을 감싸는 접근 게이트. 유효한 토큰이 없으면 비밀번호 팝업을 띄운다. */
export function HouseholdGate({ children }: { children: ReactNode }) {
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
