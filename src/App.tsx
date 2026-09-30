import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { TextInput } from './pages/TextInput'
import { WordSets } from './pages/WordSets'
import { WordReview } from './pages/WordReview'
import { Quiz } from './pages/Quiz'
import { TestSelect } from './pages/TestSelect'
import { WrongNotes } from './pages/WrongNotes'
import { ParentDashboard } from './pages/ParentDashboard'
import { ParentSessionDetail } from './pages/ParentSessionDetail'
import { Household } from './pages/Household'
import { HouseholdCategories } from './pages/HouseholdCategories'
import { HouseholdStats } from './pages/HouseholdStats'
import { OpicHome } from './pages/OpicHome'
import { OpicTopic } from './pages/OpicTopic'
import { OpicScript } from './pages/OpicScript'
import { HouseholdBackGuard } from './components/HouseholdBackGuard'

function App() {
  return (
    <BrowserRouter>
      <HouseholdBackGuard />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/input" element={<TextInput />} />
        <Route path="/wordsets" element={<WordSets />} />
        <Route path="/wordsets/review" element={<WordReview />} />
        <Route path="/wordsets/:id" element={<WordReview />} />
        <Route path="/test" element={<TestSelect />} />
        <Route path="/test/start" element={<Quiz />} />
        <Route path="/quiz/:wordSetId" element={<Quiz />} />
        <Route path="/wrong" element={<WrongNotes />} />
        <Route path="/wrong/quiz" element={<Quiz />} />
        <Route path="/parent" element={<ParentDashboard />} />
        <Route path="/parent/session/:groupId" element={<ParentSessionDetail />} />
        <Route path="/household" element={<Household />} />
        <Route path="/household/stats" element={<HouseholdStats />} />
        <Route path="/household/categories" element={<HouseholdCategories />} />
        <Route path="/opic" element={<OpicHome />} />
        <Route path="/opic/t/:topicId" element={<OpicTopic />} />
        <Route path="/opic/t/:topicId/q/:questionId" element={<OpicScript />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
