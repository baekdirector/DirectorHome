import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// 배포한 뒤에도 이미 열려 있던 앱이 예전 화면에 머무는 일을 막는다.
// autoUpdate는 새 서비스워커를 설치하고 활성화까지 해 주지만, 그때 떠 있던 페이지는
// 이미 읽어들인 예전 JS를 계속 쓴다. 홈 화면에 설치해 두고 며칠씩 켜 두는 사용 방식에서는
// 새 기능을 올려도 보이지 않아 앱이 고장 난 것처럼 보인다.
if ('serviceWorker' in navigator) {
  // 처음 설치하는 방문인지 기억해 둔다. 첫 설치 때도 controllerchange가 한 번 일어나는데
  // 그때는 이미 최신이라 새로고침할 이유가 없다.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })
}

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    // 설치형 앱은 탭을 닫지 않으므로 브라우저가 스스로 새 버전을 찾아보기까지 오래 걸린다.
    // 앱이 화면으로 돌아올 때마다 직접 확인한다.
    // visibilitychange와 focus가 같은 복귀에 둘 다 발화하므로, 짧은 간격의 중복 호출은 건너뛴다.
    // registration.update()는 HTTP 캐시를 우회해 sw.js를 매번 새로 받아온다.
    const MIN_INTERVAL_MS = 15 * 60 * 1000
    let lastCheckedAt = 0
    const checkForUpdate = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastCheckedAt < MIN_INTERVAL_MS) return
      lastCheckedAt = now
      void registration.update()
    }
    document.addEventListener('visibilitychange', checkForUpdate)
    window.addEventListener('focus', checkForUpdate)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
