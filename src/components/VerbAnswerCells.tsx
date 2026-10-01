const LABELS = ['현재', '과거', '과거분사']

/**
 * 동사 3단변화 답안("현재 | 과거 | 과거분사")을 칸별로 보여준다.
 * 세 조각으로 갈라지지 않는 기록(일반 단어, 건너뛴 문항)은 저장된 문자열 그대로 둔다.
 */
export function VerbAnswerCells({
  value,
  layout = 'column',
}: {
  value: string
  layout?: 'row' | 'column'
}) {
  const parts = value.split(' | ')
  if (parts.length !== 3) return <>{value.trim() === '' ? '(건너뜀)' : value}</>
  // 세 칸을 모두 비운 채 넘긴 경우. 파이프만 남은 문자열을 그대로 보여주지 않는다.
  if (parts.every((p) => p.trim() === '')) return <>(건너뜀)</>
  return (
    <span className={layout === 'row' ? 'inline-flex flex-wrap gap-x-2.5' : 'inline-flex flex-col gap-0.5'}>
      {parts.map((p, i) => (
        <span key={i} className="break-words">
          <span className="text-[10.5px] text-ink-muted">{LABELS[i]} </span>
          {p.trim() === '' ? '—' : p}
        </span>
      ))}
    </span>
  )
}
