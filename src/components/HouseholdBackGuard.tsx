import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from './ConfirmDialog'

/**
 * 가계부(/household*) 화면에서 브라우저/기기 뒤로가기를 눌러 JunsVoca로 넘어가려 할 때
 * 확인 팝업을 띄운다. react-router가 BrowserRouter(선언형) 모드라 useBlocker를 쓸 수 없어서,
 * 히스토리에 더미 엔트리를 하나 심어두고 그게 소비되는 순간(=진짜로 나가려는 뒤로가기)을 잡는다.
 * 가계부 내부 탭 이동은 전부 `replace`로 하고 있어서, 이 더미는 항상 "가계부 진입 지점" 바로
 * 위에 하나만 존재한다.
 */
export function HouseholdBackGuard() {
  const location = useLocation()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const armedRef = useRef(false)

  useEffect(() => {
    const isHousehold = location.pathname.startsWith('/household')
    if (isHousehold && !armedRef.current) {
      window.history.pushState(null, '', window.location.href)
      armedRef.current = true
    } else if (!isHousehold) {
      armedRef.current = false
    }
  }, [location])

  useEffect(() => {
    function onPopState() {
      if (!armedRef.current) return
      armedRef.current = false
      setConfirming(true)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function handleConfirm() {
    setConfirming(false)
    navigate('/', { replace: true })
  }

  function handleCancel() {
    setConfirming(false)
    // 더미를 다시 심어서 다음 뒤로가기도 잡히게 한다.
    window.history.pushState(null, '', window.location.href)
    armedRef.current = true
  }

  return (
    <ConfirmDialog
      open={confirming}
      title="가계부 화면을 나가시겠어요?"
      description="확인을 누르면 JunsVoca 화면으로 이동합니다."
      confirmLabel="나가기"
      cancelLabel="계속 보기"
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )
}
