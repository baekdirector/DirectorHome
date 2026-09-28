import { useEffect, useState } from 'react'
import { HouseholdGate } from '../components/HouseholdGate'
import { HouseholdNav } from '../components/HouseholdNav'
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
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [name, setName] = useState('')
  const [groupType, setGroupType] = useState<ExpenseGroup>('variable')

  const reload = () => getCategories().then(setCategories)
  useEffect(() => {
    reload()
  }, [])

  async function add() {
    if (!name.trim()) return
    // displayOrder를 안 넘기면 서버가 항상 0으로 만들어서, 같은 그룹에 0인 항목이 여러 개면
    // move()의 스왑이 눈에 보이는 효과가 없다. 그룹 내 최대값 다음으로 배치한다.
    const siblings = categories.filter((c) => c.groupType === groupType)
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
    const siblings = categories
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

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <HouseholdNav />
      <div className="flex-1 px-[22px] pb-8">
        <h1 className="pt-5 text-[20px] font-extrabold">카테고리 관리</h1>

        <div className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 항목 이름"
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-[14px]"
          />
          <select
            value={groupType}
            onChange={(e) => setGroupType(e.target.value as ExpenseGroup)}
            className="rounded-xl border border-border bg-surface px-2 py-2 text-[14px]"
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
            <div className="mb-1 text-[13px] font-semibold text-ink-muted">{label}</div>
            {categories
              .filter((c) => c.groupType === value)
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((cat) => (
                <div key={cat.id} className="flex items-center gap-2 border-b border-hh-divider py-3">
                  <span className={`flex-1 text-[15px] ${cat.archivedAt ? 'text-ink-muted line-through' : ''}`}>
                    {cat.name}
                  </span>
                  <button onClick={() => move(cat, -1)} className="px-1 text-ink-muted" aria-label="위로">
                    ▲
                  </button>
                  <button onClick={() => move(cat, 1)} className="px-1 text-ink-muted" aria-label="아래로">
                    ▼
                  </button>
                  <button
                    onClick={() => toggleArchive(cat)}
                    className="rounded-lg border border-border px-2.5 py-1 text-[12.5px] font-semibold"
                  >
                    {cat.archivedAt ? '복원' : '숨기기'}
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
