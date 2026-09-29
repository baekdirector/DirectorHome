import { useMemo, useState } from 'react'
import {
  checkStatement,
  readStatementPdf,
  type Statement,
  type StatementTx,
} from '../lib/statementPdf'
import { mapTransactions } from '../lib/statementMapping'
import {
  createEntry,
  formatWon,
  parseWonInput,
  putEntry,
  type ExpenseCategory,
  type ExpenseEntry,
} from '../lib/household'

interface DraftCategory {
  key: string
  category: string
  amount: string
  sourceCount: number
}

interface DraftItem {
  key: string
  category: string
  memo: string
  amount: string
}

type Phase = 'pick' | 'reading' | 'review' | 'saving'

/**
 * 거래내역 PDF를 읽어 그 달의 가계부 항목을 채우는 팝업.
 * 인식 결과를 바로 저장하지 않고, 사용자가 고치거나 지운 뒤 확정하게 한다.
 * PDF는 브라우저 메모리에서만 다루고 서버로 보내거나 저장하지 않는다.
 */
export function StatementImportModal({
  categories,
  entries,
  onClose,
  onSaved,
}: {
  categories: ExpenseCategory[]
  /** 이미 들어있는 항목. 다시 올려도 같은 품목이 중복 생기지 않게 비교한다. */
  entries: ExpenseEntry[]
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [error, setError] = useState<string | null>(null)
  const [statement, setStatement] = useState<Statement | null>(null)
  const [draftCategories, setDraftCategories] = useState<DraftCategory[]>([])
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [manual, setManual] = useState<StatementTx[]>([])

  const categoryByName = useMemo(() => {
    const map = new Map<string, ExpenseCategory>()
    for (const c of categories) map.set(c.name, c)
    return map
  }, [categories])

  async function handleFile(file: File) {
    setPhase('reading')
    setError(null)
    try {
      const parsed = await readStatementPdf(await file.arrayBuffer())
      if (parsed.transactions.length === 0) {
        setError('거래내역을 찾지 못했어요. 새마을금고 거래내역조회 PDF가 맞는지 확인해 주세요.')
        setPhase('pick')
        return
      }
      const mapped = mapTransactions(parsed.transactions)
      setStatement(parsed)
      setDraftCategories(
        mapped.categories.map((c) => ({
          key: c.category,
          category: c.category,
          amount: formatWon(c.amount),
          sourceCount: c.sources.length,
        })),
      )
      setDraftItems(
        mapped.items.map((it, i) => ({
          key: `${it.source.id}-${i}`,
          category: it.category,
          memo: it.memo,
          amount: formatWon(it.amount),
        })),
      )
      setManual(mapped.manual)
      setPhase('review')
    } catch {
      setError('PDF를 읽지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.')
      setPhase('pick')
    }
  }

  async function save() {
    if (!statement) return
    setPhase('saving')
    setError(null)

    const { year, month } = statement
    const monthEntries = entries.filter((e) => e.year === year && e.month === month)
    let written = 0
    const skipped: string[] = []

    try {
      for (const draft of draftCategories) {
        const category = categoryByName.get(draft.category)
        if (!category) {
          skipped.push(draft.category)
          continue
        }
        await putEntry({ categoryId: category.id, year, month, amount: parseWonInput(draft.amount) })
        written++
      }

      for (const draft of draftItems) {
        const category = categoryByName.get(draft.category)
        if (!category) {
          skipped.push(draft.category)
          continue
        }
        const amount = parseWonInput(draft.amount)
        const memo = draft.memo.trim()
        // 같은 품목이 이미 있으면 건너뛴다. 같은 PDF를 다시 올려도 중복되지 않는다.
        const duplicate = monthEntries.some(
          (e) => e.categoryId === category.id && e.amount === amount && (e.memo ?? '') === memo,
        )
        if (duplicate) continue
        await createEntry({ categoryId: category.id, year, month, amount, memo })
        written++
      }
    } catch {
      setError('저장 중 문제가 생겼어요. 다시 시도해 주세요.')
      setPhase('review')
      return
    }

    const note = skipped.length > 0 ? ` (없는 카테고리 ${[...new Set(skipped)].join(', ')}는 건너뜀)` : ''
    onSaved(`${month}월에 ${written}건을 반영했어요.${note}`)
  }

  const check = statement ? checkStatement(statement) : null
  const checksOk = check ? check.depositOk && check.withdrawalOk : true

  return (
    <div
      role="presentation"
      onClick={phase === 'saving' ? undefined : onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6 sm:items-center sm:pb-0"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="거래내역 PDF 가져오기"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[86svh] w-full max-w-[420px] flex-col rounded-[22px] bg-white shadow-lg"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h3 className="m-0 font-hh-serif text-[17px] font-bold text-hh-ink">거래내역 PDF 가져오기</h3>
            {statement && (
              <p className="m-0 pt-1 text-[13px] text-hh-ink-muted">
                {statement.year}년 {statement.month}월 · 거래 {statement.transactions.length}건
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'saving'}
            aria-label="닫기"
            className="-mr-1 -mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-full border-none bg-transparent text-[18px] text-hh-ink-muted disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="m-0 mb-3 rounded-[14px] bg-hh-up-tint px-4 py-3 text-[13px] text-hh-up">{error}</p>
          )}

          {(phase === 'pick' || phase === 'reading') && (
            <>
              <p className="m-0 text-[13px] leading-relaxed text-hh-ink-muted">
                새마을금고 앱에서 받은 <b className="text-hh-ink">거래내역조회 PDF</b>를 올려주세요. 한 달치를
                자동으로 읽어 항목을 채웁니다. 파일은 휴대폰 안에서만 처리되고 서버에 올라가거나 저장되지
                않아요.
              </p>
              <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-[18px] border border-dashed border-hh-border bg-hh-bg px-5 py-8 text-center">
                <span className="text-[15px] font-semibold text-hh-pine">
                  {phase === 'reading' ? '읽는 중…' : 'PDF 파일 선택'}
                </span>
                <span className="text-[12px] text-hh-ink-muted">거래내역조회 PDF</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={phase === 'reading'}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) handleFile(file)
                  }}
                  className="hidden"
                />
              </label>
            </>
          )}

          {statement && (phase === 'review' || phase === 'saving') && (
            <>
              <div
                className={`rounded-[14px] px-4 py-3 text-[13px] ${
                  checksOk ? 'bg-hh-down-tint text-hh-down' : 'bg-hh-up-tint text-hh-up'
                }`}
              >
                {checksOk ? (
                  <>
                    검산 통과 — 입금 {formatWon(check?.sumDeposit ?? 0)}원, 출금{' '}
                    {formatWon(check?.sumWithdrawal ?? 0)}원이 PDF에 적힌 총액과 일치해요.
                  </>
                ) : (
                  <>합계가 PDF에 적힌 총액과 달라요. 금액을 한 번 더 확인해 주세요.</>
                )}
              </div>

              <Section title="카테고리" hint="기존 값을 이 금액으로 바꿉니다">
                {draftCategories.length === 0 && <Empty />}
                {draftCategories.map((draft) => (
                  <Row
                    key={draft.key}
                    label={draft.category}
                    sub={draft.sourceCount > 1 ? `${draft.sourceCount}건 합산` : undefined}
                    amount={draft.amount}
                    onAmountChange={(v) =>
                      setDraftCategories((prev) =>
                        prev.map((d) => (d.key === draft.key ? { ...d, amount: v } : d)),
                      )
                    }
                    onRemove={() =>
                      setDraftCategories((prev) => prev.filter((d) => d.key !== draft.key))
                    }
                  />
                ))}
              </Section>

              <Section title="추가 지출액 · 입금액" hint="품목으로 한 줄씩 추가됩니다">
                {draftItems.length === 0 && <Empty />}
                {draftItems.map((draft) => (
                  <Row
                    key={draft.key}
                    label={draft.memo}
                    sub={draft.category}
                    editableLabel
                    onLabelChange={(v) =>
                      setDraftItems((prev) => prev.map((d) => (d.key === draft.key ? { ...d, memo: v } : d)))
                    }
                    amount={draft.amount}
                    onAmountChange={(v) =>
                      setDraftItems((prev) => prev.map((d) => (d.key === draft.key ? { ...d, amount: v } : d)))
                    }
                    onRemove={() => setDraftItems((prev) => prev.filter((d) => d.key !== draft.key))}
                  />
                ))}
              </Section>

              {manual.length > 0 && (
                <Section title="직접 입력 필요" hint="자동으로 넣지 않아요">
                  {manual.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between gap-2 rounded-[12px] bg-hh-up-tint px-3 py-2.5 text-[13px]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-hh-ink">
                          {tx.name} {formatWon(tx.withdrawal)}원
                        </div>
                        <div className="pt-0.5 text-[12px] text-hh-ink-muted">
                          현대카드+우리카드 합산이라 두 카드로 나눠 넣어주세요
                        </div>
                      </div>
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}
        </div>

        {statement && (phase === 'review' || phase === 'saving') && (
          <div className="flex gap-2.5 border-t border-hh-divider px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={phase === 'saving'}
              className="flex-1 rounded-2xl border border-hh-border bg-white p-3 text-[14px] font-semibold text-hh-ink disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={save}
              disabled={phase === 'saving' || draftCategories.length + draftItems.length === 0}
              className="flex-[1.4] rounded-2xl bg-hh-pine p-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {phase === 'saving'
                ? '저장 중…'
                : `${draftCategories.length + draftItems.length}건 저장`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="pt-5">
      <div className="flex items-baseline justify-between gap-2 pb-1.5">
        <div className="text-[13px] font-semibold text-hh-ink">{title}</div>
        <div className="text-[11px] text-hh-ink-muted">{hint}</div>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

const Empty = () => <p className="m-0 py-1 text-[13px] text-hh-ink-muted">해당하는 항목이 없어요.</p>

function Row({
  label,
  sub,
  editableLabel,
  onLabelChange,
  amount,
  onAmountChange,
  onRemove,
}: {
  label: string
  sub?: string
  editableLabel?: boolean
  onLabelChange?: (value: string) => void
  amount: string
  onAmountChange: (value: string) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        {editableLabel ? (
          <input
            value={label}
            onChange={(e) => onLabelChange?.(e.target.value)}
            aria-label="항목명"
            className="w-full rounded-[10px] border border-hh-border bg-hh-bg px-2.5 py-1.5 text-[14px] text-hh-ink outline-none focus:border-hh-pine"
          />
        ) : (
          <div className="truncate px-1 text-[14px] text-hh-ink">{label}</div>
        )}
        {sub && <div className="px-1 pt-0.5 text-[11px] text-hh-ink-muted">{sub}</div>}
      </div>
      <input
        inputMode="numeric"
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
        onFocus={(e) => e.target.select()}
        aria-label="금액"
        className="w-[104px] flex-none rounded-[10px] border border-hh-border bg-hh-bg px-2.5 py-1.5 text-right text-[14px] tabular-nums text-hh-ink outline-none focus:border-hh-pine"
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${label} 제외`}
        className="flex-none border-none bg-transparent px-1 text-hh-ink-muted"
      >
        ✕
      </button>
    </div>
  )
}
