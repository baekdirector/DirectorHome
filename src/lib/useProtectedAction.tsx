import { useCallback, useRef, useState } from 'react'
import { PasswordGateDialog } from '../components/PasswordGateDialog'
import { isAccessTokenValid, verifyPassword } from './household'

const TOKEN_KEY = 'hh_access_until'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function hasValidAccess(): boolean {
  try {
    return isAccessTokenValid(localStorage.getItem(TOKEN_KEY), Date.now())
  } catch {
    return false
  }
}

function rememberAccess() {
  try {
    localStorage.setItem(TOKEN_KEY, String(Date.now() + THIRTY_DAYS_MS))
  } catch {
    // 저장 공간을 못 쓰는 환경에서는 이번 동작만 통과시키고 다음에 다시 묻는다.
  }
}

/**
 * 단어장을 바꾸는 동작(저장·이름 수정·삭제)을 비밀번호 뒤에 둔다.
 *
 * 가계부·OPIC이 쓰는 토큰을 그대로 쓰므로, 한 기기에서 한 번 풀면 30일간 다시 묻지 않는다.
 * 잠겨 있으면 팝업을 띄우고 맞았을 때만 동작을 실행한다. 틀리거나 취소하면 아무 일도
 * 일어나지 않는다.
 *
 * 쓰는 쪽은 `run(fn)`으로 감싸고 `dialog`를 어딘가 한 번 렌더하면 된다.
 */
export function useProtectedAction() {
  const [asking, setAsking] = useState(false)
  // 비밀번호를 맞힌 뒤 실행할 동작. 렌더와 무관하므로 ref에 둔다.
  const pendingRef = useRef<(() => void) | null>(null)

  const run = useCallback((action: () => void) => {
    if (hasValidAccess()) {
      action()
      return
    }
    pendingRef.current = action
    setAsking(true)
  }, [])

  const dialog = asking ? (
    <PasswordGateDialog
      title="비밀번호 확인"
      description="단어장을 바꾸려면 비밀번호가 필요해요."
      confirmLabel="확인"
      verify={verifyPassword}
      onSuccess={() => {
        rememberAccess()
        setAsking(false)
        const action = pendingRef.current
        pendingRef.current = null
        action?.()
      }}
      onCancel={() => {
        pendingRef.current = null
        setAsking(false)
      }}
    />
  ) : null

  return { run, dialog }
}
