import { OPIC_STATE_LABEL, type OpicState } from '../lib/opic'

const STYLE: Record<OpicState, string> = {
  weak: 'text-[#B23A0A] bg-[#FDECE3]',
  ok: 'text-[#8A5A00] bg-[#FDF3D7]',
  done: 'text-op-done bg-[#E3F4E8]',
}

/** 암기 상태 칩. 색만으로 뜻을 전하지 않도록 항상 글자를 함께 보여준다. */
export function OpicStatusChip({ state }: { state: OpicState | null }) {
  if (!state) return <span className="text-[12px] text-op-ink-muted">미설정</span>
  return (
    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${STYLE[state]}`}>
      {OPIC_STATE_LABEL[state]}
    </span>
  )
}
