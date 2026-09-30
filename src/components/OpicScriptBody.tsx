import { parseAnnotations, splitAnswerLines } from '../lib/opicParse'

export type FontSize = 'sm' | 'md' | 'lg'

const SIZE: Record<FontSize, string> = {
  sm: 'text-[18px] lg:text-[20px]',
  md: 'text-[20px] lg:text-[22px]',
  lg: 'text-[23px] lg:text-[25px]',
}

/**
 * 답변 본문. 한 줄이 한 문장이고 빈 줄은 문단 간격이다.
 * 여러 주제에 반복되는 만능 패턴 줄에는 파란 밑줄을, 한글 괄호 주석에는 노란 칩을 붙인다.
 */
export function OpicScriptBody({
  answer,
  patterns,
  size = 'md',
}: {
  answer: string
  patterns: Set<string>
  size?: FontSize
}) {
  const blocks = splitAnswerLines(answer)

  return (
    <div
      className={`rounded-2xl border border-op-border bg-white px-4 py-4 font-op-serif leading-[1.75] ${SIZE[size]}`}
    >
      {blocks.map((b, i) =>
        b.kind === 'gap' ? (
          <div key={i} className="h-4" />
        ) : (
          <p
            key={i}
            className={`m-0 px-3 py-0.5 ${
              patterns.has(b.text) ? 'rounded-md border-b-2 border-op-accent bg-op-accent-tint' : ''
            }`}
          >
            {parseAnnotations(b.text).map((part, j) => {
              if (part.type === 'text') return <span key={j}>{part.value} </span>
              if (part.type === 'label') {
                return (
                  <span
                    key={j}
                    className="mr-1.5 rounded bg-op-border px-1.5 align-[3px] font-hh-sans text-[12px] font-semibold text-op-ink-muted"
                  >
                    {part.value}
                  </span>
                )
              }
              return (
                <span key={j} className="whitespace-nowrap">
                  {part.pron && (
                    <span className="mx-0.5 rounded-full border border-[#E3C8A0] bg-[#FBF0E0] px-1.5 align-[3px] font-hh-sans text-[12px] font-semibold text-[#8A5A00]">
                      {part.pron}
                    </span>
                  )}
                  <span className="mx-0.5 rounded-full border border-[#F0D36B] bg-[#FFF4C7] px-1.5 align-[3px] font-hh-sans text-[12px] font-semibold text-[#6B4E00]">
                    {part.meaning}
                  </span>
                </span>
              )
            })}
          </p>
        ),
      )}
    </div>
  )
}
