import { Suspense, lazy, type ComponentType } from 'react'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { TextInput } from './pages/TextInput'
import { WordSets } from './pages/WordSets'
import { WordReview } from './pages/WordReview'
import { Quiz } from './pages/Quiz'
import { TestSelect } from './pages/TestSelect'
import { WrongNotes } from './pages/WrongNotes'
import { ParentDashboard } from './pages/ParentDashboard'
import { ParentSessionDetail } from './pages/ParentSessionDetail'
import { Admin } from './pages/Admin'
import { HouseholdBackGuard } from './components/HouseholdBackGuard'
import { ProfileGate } from './components/ProfileGate'
import { Loading } from './components/Loading'

// 가계부와 OPIC은 서로 다른 사용자가 쓰는 화면이다(아이는 JunsVoca만, 어른은 가계부·OPIC).
// 정적으로 묶으면 쓰지 않는 쪽 코드까지 매번 내려받고 파싱하므로 라우트 단위로 쪼갠다.
const page = <T extends string>(load: () => Promise<Record<T, ComponentType>>, name: T) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

const Household = page(() => import('./pages/Household'), 'Household')
const HouseholdCategories = page(() => import('./pages/HouseholdCategories'), 'HouseholdCategories')
const HouseholdStats = page(() => import('./pages/HouseholdStats'), 'HouseholdStats')
const OpicHome = page(() => import('./pages/OpicHome'), 'OpicHome')
const OpicTopic = page(() => import('./pages/OpicTopic'), 'OpicTopic')
const OpicScript = page(() => import('./pages/OpicScript'), 'OpicScript')
const OpicMock = page(() => import('./pages/OpicMock'), 'OpicMock')

function App() {
  return (
    <BrowserRouter>
      <ProfileGate>
        <HouseholdBackGuard />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/input" element={<TextInput />} />
          <Route path="/wordsets" element={<WordSets />} />
          <Route path="/wordsets/review" element={<WordReview />} />
          <Route path="/wordsets/:id" element={<WordReview />} />
          <Route path="/test" element={<TestSelect />} />
          <Route path="/test/start" element={<Quiz />} />
          <Route path="/quiz/homework/:homeworkId" element={<Quiz />} />
          <Route path="/quiz/:wordSetId" element={<Quiz />} />
          <Route path="/wrong" element={<WrongNotes />} />
          <Route path="/wrong/quiz" element={<Quiz />} />
          <Route path="/parent" element={<ParentDashboard />} />
          <Route path="/parent/session/:groupId" element={<ParentSessionDetail />} />
          <Route path="/admin" element={<Admin />} />
          <Route
            element={
              <Suspense fallback={<Loading screen />}>
                <Outlet />
              </Suspense>
            }
          >
            <Route path="/household" element={<Household />} />
            <Route path="/household/stats" element={<HouseholdStats />} />
            <Route path="/household/categories" element={<HouseholdCategories />} />
            <Route path="/opic" element={<OpicHome />} />
            <Route path="/opic/t/:topicId" element={<OpicTopic />} />
            <Route path="/opic/t/:topicId/q/:questionId" element={<OpicScript />} />
            <Route path="/opic/mock" element={<OpicMock />} />
          </Route>
        </Routes>
      </ProfileGate>
    </BrowserRouter>
  )
}

export default App
