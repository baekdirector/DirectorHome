import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppDrawer } from '../components/AppDrawer'
import { BottomNav } from '../components/BottomNav'
import { Spinner } from '../components/Loading'
import { BookIcon, ChartIcon, ChevronRightIcon, CheckCircleIcon, ClipboardIcon, PencilIcon, StarIcon, XCircleIcon } from '../components/icons'
import { getHomeStats, getPendingHomework, type HomeStats, type PendingHomework } from '../lib/db'
import { HomeworkCard } from '../components/HomeworkCard'
import { localDateString } from '../lib/homework'
import { useSlowLoading } from '../lib/useSlowLoading'
import { OwnerSwitch, useProfile } from '../components/ProfileGate'
import { PROFILE_LABEL } from '../lib/profile'

function todayLabel(date: string) {
  const [y, m, day] = date.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`
}

export function Home() {
  const { owner, isAdmin } = useProfile()
  const [stats, setStats] = useState<HomeStats | null>(null)
  const [statsFailed, setStatsFailed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [homework, setHomework] = useState<PendingHomework | null>(null)
  const [today, setToday] = useState(localDateString)

  // owner가 바뀌면(부모 모드에서 아이 전환) 통계를 그 아이 것으로 다시 받는다.
  useEffect(() => {
    setStats(null)
    setStatsFailed(false)
    getHomeStats()
      .then(setStats)
      .catch(() => setStatsFailed(true))
  }, [owner])

  useEffect(() => {
    getPendingHomework(today)
      .then(setHomework)
      // 숙제는 홈의 일부일 뿐이다. 못 불러와도 통계·오답노트·단어장은 보여준다.
      .catch(() => setHomework({ today: [], overdue: [] }))
  }, [today, owner])

  // 홈 화면을 띄워 둔 채 자정을 넘기면(설치형 앱에서는 흔하다) 어제 숙제가 "오늘의 숙제"로
  // 남는다. 화면으로 돌아올 때마다 날짜를 다시 재고, 바뀌었으면 위 effect가 다시 돈다.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState !== 'visible') return
      setToday((prev) => {
        const now = localDateString()
        return now === prev ? prev : now
      })
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
    }
  }, [])

  // 통계가 오기 전에는 숫자 대신 스피너를 보여준다. (불러오기에 실패하면 스피너 대신 '–')
  const loadingStats = stats === null && !statsFailed
  const slow = useSlowLoading(loadingStats)

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <div className="flex flex-1 flex-col px-[22px] pb-6">
        <div className="flex items-center justify-between pt-5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="서비스 전환 메뉴 열기"
            className="flex items-center gap-2"
          >
            <img src="/icons/icon-192.png" alt="" width={36} height={36} className="h-9 w-9 rounded-[10px]" />
            <span className="font-display text-[19px] font-bold">{PROFILE_LABEL[owner]}</span>
          </button>
          <div className="flex items-center gap-2">
            <OwnerSwitch className="mr-1" />
            {isAdmin && (
              <>
            <Link
              to="/admin"
              aria-label="숙제 관리"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-primary"
            >
              <ClipboardIcon width={20} height={20} />
            </Link>
            <Link
              to="/parent"
              aria-label="부모 결과 리포트 보기"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-primary"
            >
              <ChartIcon width={20} height={20} />
            </Link>
              </>
            )}
          </div>
        </div>

        <div className="pt-6">
          <p className="m-0 text-[13px] text-ink-muted">{todayLabel(today)}</p>
          <h1 className="mt-1.5 text-[27px] font-extrabold leading-snug">
            안녕!
            <br />
            오늘도 단어 정복하러 가볼까?
          </h1>
        </div>

        <div className="flex gap-2.5 pt-5">
          <StatChip icon={<StarIcon width={14} height={14} className="text-gold" />} label="연속 학습" value={stats ? `${stats.streakDays}일` : loadingStats ? null : '–'} />
          <StatChip icon={<CheckCircleIcon width={14} height={14} className="text-success" />} label="주간 정답률" value={stats ? `${stats.weeklyAccuracy}%` : loadingStats ? null : '–'} />
          <StatChip icon={<BookIcon width={14} height={14} className="text-primary" />} label="학습 단어" value={stats ? `${stats.totalWords}개` : loadingStats ? null : '–'} />
        </div>
        {slow && (
          <p className="m-0 pt-2 text-center text-[12px] text-ink-muted">서버가 깨어나는 중이라 조금 걸려요. 잠시만 기다려 주세요.</p>
        )}

        <div className="flex flex-col gap-3 pt-6">
          {homework?.today.map((hw) => (
            <HomeworkCard key={hw.id} homework={hw} today={today} />
          ))}
          {homework?.overdue.map((hw) => (
            <HomeworkCard key={hw.id} homework={hw} today={today} />
          ))}

          <Link
            to="/test"
            className="flex items-center gap-3.5 rounded-[20px] border-2 border-primary bg-surface p-4.5"
          >
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-primary-tint">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-primary">
                <path d="M8 5l11 7-11 7Z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-[17px] font-bold text-primary-dark">직접 테스트하기</div>
              <div className="mt-0.5 text-[12.5px] text-ink-muted">단어장을 골라서 시험 보기</div>
            </div>
            <ChevronRightIcon width={18} height={18} className="text-primary" />
          </Link>

          <Link to="/wrong" className="flex items-center gap-3.5 rounded-[20px] border border-border bg-surface p-4.5">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-error-tint">
              <XCircleIcon width={20} height={20} className="text-error" strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <div className="text-[16px] font-bold">오답 노트</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                {loadingStats ? (
                  <>
                    <Spinner size={12} />
                    불러오는 중...
                  </>
                ) : stats && stats.wrongNoteCount > 0 ? (
                  `다시 도전할 틀린 단어 ${stats.wrongNoteCount}개`
                ) : (
                  '틀린 단어가 자동으로 모여요'
                )}
              </div>
            </div>
            <ChevronRightIcon width={18} height={18} className="text-ink-muted" />
          </Link>

          <Link to="/wordsets" className="flex items-center gap-3.5 rounded-[20px] border border-border bg-surface p-4.5">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-accent-tint">
              <BookIcon width={20} height={20} className="text-accent-dark" strokeWidth={1.8} />
            </div>
            <div className="flex-1">
              <div className="text-[16px] font-bold">내 단어장 보기</div>
              <div className="mt-0.5 text-[12.5px] text-ink-muted">저장된 단어장 확인하고 수정하기</div>
            </div>
            <ChevronRightIcon width={18} height={18} className="text-ink-muted" />
          </Link>

          <Link
            to="/input"
            className="mt-1 flex items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed border-border p-4 text-[14px] font-semibold text-ink-muted"
          >
            <PencilIcon width={16} height={16} />새 단어장 만들기 (단어 입력)
          </Link>
        </div>
      </div>
      <BottomNav />
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="flex-1 rounded-[14px] border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1 whitespace-nowrap text-[11.5px] text-ink-muted">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 flex h-[30px] items-center text-[20px] font-extrabold">
        {value === null ? <Spinner size={20} /> : value}
      </div>
    </div>
  )
}
