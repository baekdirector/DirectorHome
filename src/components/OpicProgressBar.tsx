/** 암기 상태 3색 진도 바. 남는 폭은 미설정이다. 색만으로 뜻을 전하지 않도록 옆에 수치를 함께 쓴다. */
export function OpicProgressBar({
  total,
  done,
  ok,
  weak,
}: {
  total: number
  done: number
  ok: number
  weak: number
}) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-[#ECE8DF]">
      <div className="bg-op-done" style={{ width: `${pct(done)}%` }} />
      <div className="bg-op-ok" style={{ width: `${pct(ok)}%` }} />
      <div className="bg-op-weak" style={{ width: `${pct(weak)}%` }} />
    </div>
  )
}
