import { useEffect, useState } from 'react'
import { HouseholdGate } from '../components/HouseholdGate'
import { HouseholdNav } from '../components/HouseholdNav'
import { HouseholdBottomNav } from '../components/HouseholdBottomNav'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { createCategory, getCategories, updateCategory, type ExpenseCategory, type ExpenseGroup } from '../lib/household'

const GROUP_OPTIONS: { value: ExpenseGroup; label: string }[] = [
  { value: 'income', label: '수입' },
  { value: 'fixed', label: '고정비' },
  { value: 'card', label: '카드' },
  { value: 'utility', label: '통신·공과' },
  { value: 'variable', label: '기타변동' },
]

export function HouseholdCategories() {
  return (
    <HouseholdGate>
      <CategoriesContent />
    </HouseholdGate>
  )
}

function CategoriesContent() {
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [name, setName] = useState('')
  const [groupType, setGroupType] = useState<ExpenseGroup>('variable')

  const reload = () => {
    setLoadFailed(false)
    return getCategories()
      .then(setCategories)
      .catch(() => setLoadFailed(true))
  }
  useEffect(() => {
    reload()
  }, [])

  async function add() {
    if (!name.trim()) return
    // displayOrder를 안 넘기면 서버가 항상 0으로 만들어서, 같은 그룹에 0인 항목이 여러 개면
    // move()의 스왑이 눈에 보이는 효과가 없다. 그룹 내 최대값 다음으로 배치한다.
    const siblings = (categories ?? []).filter((c) => c.groupType === groupType)
    const nextDisplayOrder = siblings.length === 0 ? 0 : Math.max(...siblings.map((c) => c.displayOrder)) + 1
    await createCategory({ name: name.trim(), groupType, displayOrder: nextDisplayOrder })
    setName('')
    reload()
  }

  async function toggleArchive(cat: ExpenseCategory) {
    await updateCategory(cat.id, { archived: !cat.archivedAt })
    reload()
  }

  async function move(cat: ExpenseCategory, direction: -1 | 1) {
    const siblings = (categories ?? [])
      .filter((c) => c.groupType === cat.groupType && !c.archivedAt)
      .sort((a, b) => a.displayOrder - b.displayOrder)
    const index = siblings.findIndex((c) => c.id === cat.id)
    if (index === -1) return
    const target = siblings[index + direction]
    if (!target) return
    await Promise.all([
      updateCategory(cat.id, { displayOrder: target.displayOrder }),
      updateCategory(target.id, { displayOrder: cat.displayOrder }),
    ])
    reload()
  }

  if (loadFailed) {
    return (
      <div className="flex min-h-svh flex-col bg-hh-bg lg:flex-row">
        <HouseholdNav />
        <div className="flex-1">
          <LoadError screen={false} message="항목 정보를 불러오지 못했어요." onRetry={reload} />
        </div>
      </div>
    )
  }

  if (!categories) {
    return (
      <div className="flex min-h-svh flex-col bg-hh-bg lg:flex-row">
        <HouseholdNav />
        <Loading />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-hh-bg font-hh-sans text-hh-ink lg:flex-row">
      <HouseholdNav />
      <main className="min-w-0 flex-1 px-5 pb-24 lg:px-10 lg:pb-10 lg:pt-7">
        <div className="flex flex-wrap items-baseline gap-x-4 pt-3 lg:pt-0">
          <h1 className="m-0 font-hh-serif text-[20px] font-bold lg:text-[26px] lg:font-extrabold lg:tracking-tight">카테고리 관리</h1>
          <span className="hidden text-[14px] text-hh-ink-muted lg:block">입력 내역과 지출 구성 차트의 묶음 단위예요</span>
        </div>
        <div className="lg:mt-5 lg:max-w-[760px] lg:rounded-3xl lg:bg-white lg:px-7 lg:py-6">

        <div className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 항목 이름"
            className="flex-1 rounded-xl border border-hh-border bg-white px-3 py-2 text-[14px] outline-none focus:border-hh-pine"
          />
          <select
            value={groupType}
            onChange={(e) => setGroupType(e.target.value as ExpenseGroup)}
            className="rounded-xl border border-hh-border bg-white px-2 py-2 text-[14px]"
          >
            {GROUP_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <button onClick={add} className="rounded-xl bg-hh-pine px-4 py-2 text-[14px] font-bold text-white">
            추가
          </button>
        </div>

        {GROUP_OPTIONS.map(({ value, label }) => (
          <div key={value} className="mt-5">
            <div className="mb-1 text-[13px] font-semibold text-hh-ink-muted">{label}</div>
            {categories
              .filter((c) => c.groupType === value)
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 border-b border-hh-divider py-3">
                  <span className={`flex-1 text-[15px] ${cat.archivedAt ? 'text-hh-ink-muted line-through' : ''}`}>
                    {cat.name}
                  </span>
                  <button onClick={() => move(cat, -1)} className="px-1 text-hh-ink-muted" aria-label="위로">
                    ▲
                  </button>
                  <button onClick={() => move(cat, 1)} className="px-1 text-hh-ink-muted" aria-label="아래로">
                    ▼
                  </button>
                  <button
                    onClick={() => toggleArchive(cat)}
                    className="rounded-lg border border-hh-border px-2.5 py-1 text-[12.5px] font-semibold"
                  >
                    {cat.archivedAt ? '복원' : '숨기기'}
                  </button>
                </div>
              ))}
          </div>
        ))}
        </div>
      </main>
      <HouseholdBottomNav />
    </div>
  )
}
