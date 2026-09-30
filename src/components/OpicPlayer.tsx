import { useState } from 'react'
import { RATES, type Rate } from '../lib/useOpicPlayer'

/**
 * 스크립트 하단 재생 바. 질문은 여성, 답변은 남성 음성으로 읽는다.
 * 기기마다 실린 음성이 달라 성별 추정이 틀릴 수 있으므로 직접 고르는 자리를 함께 둔다.
 */
export function OpicPlayer({
  supported,
  playing,
  position,
  total,
  rate,
  onToggle,
  onPrev,
  onNext,
  onRate,
  voices,
  maleVoice,
  femaleVoice,
  onVoice,
  onRefreshVoices,
}: {
  supported: boolean
  playing: boolean
  /** 지금 읽는 문장 번호(1부터). 재생 중이 아니면 0. */
  position: number
  total: number
  rate: Rate
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onRate: (r: Rate) => void
  voices: SpeechSynthesisVoice[]
  maleVoice: SpeechSynthesisVoice | null
  femaleVoice: SpeechSynthesisVoice | null
  onVoice: (gender: 'male' | 'female', name: string) => void
  onRefreshVoices: () => void
}) {
  const [showVoices, setShowVoices] = useState(false)

  if (!supported) {
    return (
      <p className="m-0 rounded-xl bg-[#FDECE3] px-4 py-2.5 text-[13px] text-[#B23A0A]">
        이 브라우저는 음성 읽기를 지원하지 않아요. 크롬이나 사파리에서 열어 주세요.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-op-border bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="flex-none text-[12px] font-semibold text-op-ink-muted">답변</span>
        <button
          type="button"
          onClick={onPrev}
          aria-label="이전 문장"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-op-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 5h2v14H6z" />
            <path d="M19 5.5v13a1 1 0 0 1-1.5.9L9 13a1.2 1.2 0 0 1 0-2l8.5-6.4a1 1 0 0 1 1.5.9z" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? '정지' : '재생'}
          className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-op-accent text-white"
        >
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 8 5.5z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={onNext}
          aria-label="다음 문장"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-op-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 5h2v14h-2z" />
            <path d="M5 5.5v13a1 1 0 0 0 1.5.9L15 13a1.2 1.2 0 0 0 0-2L6.5 4.6A1 1 0 0 0 5 5.5z" />
          </svg>
        </button>

        <div className="mx-1 h-1 flex-1 overflow-hidden rounded-full bg-[#ECE8DF]">
          <div
            className="h-1 rounded-full bg-op-accent transition-[width]"
            style={{ width: total > 0 ? `${(position / total) * 100}%` : '0%' }}
          />
        </div>

        <span className="flex-none tabular-nums text-[13px] text-op-ink-muted">
          {position} / {total}
        </span>

        <div className="flex flex-none gap-1">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onRate(r)}
              aria-pressed={rate === r}
              className={`h-8 rounded-lg border px-2 text-[12px] font-bold ${
                rate === r
                  ? 'border-op-accent bg-op-accent text-white'
                  : 'border-op-border bg-white text-op-ink-muted'
              }`}
            >
              {r}x
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12px] text-op-ink-muted">
        <span>답변 음성 {maleVoice?.name ?? '기기 기본'}</span>
        <button
          type="button"
          onClick={() => {
            onRefreshVoices()
            setShowVoices((v) => !v)
          }}
          className="font-semibold text-op-accent"
        >
          {showVoices ? '닫기' : '목소리 바꾸기'}
        </button>
      </div>

      {showVoices && (
        <div className="flex flex-col gap-2 rounded-xl bg-op-bg p-3">
          {voices.length === 0 ? (
            <>
              <p className="m-0 text-[12px] leading-relaxed text-op-ink-muted">
                이 기기에서 고를 수 있는 음성 목록을 아직 받지 못했어요. 안드로이드는 한 번 읽어본
                뒤에야 목록이 채워지기도 합니다. <b className="text-op-ink">재생을 한 번 눌러 본 뒤</b>{' '}
                다시 열어 보세요.
              </p>
              <button
                type="button"
                onClick={onRefreshVoices}
                className="self-start rounded-lg border border-op-border bg-white px-3 py-1.5 text-[12px] font-semibold text-op-ink"
              >
                목록 다시 찾기
              </button>
            </>
          ) : (
            <>
              {(['female', 'male'] as const).map((g) => (
                <label key={g} className="flex items-center gap-2 text-[13px]">
                  <span className="w-20 flex-none text-op-ink-muted">
                    {g === 'female' ? '질문(여)' : '답변(남)'}
                  </span>
                  <select
                    value={(g === 'female' ? femaleVoice?.name : maleVoice?.name) ?? ''}
                    onChange={(e) => onVoice(g, e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-op-border bg-white px-2 py-1.5 text-[13px]"
                  >
                    {voices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <p className="m-0 text-[11px] text-op-ink-muted">
                기기에 실린 목소리만 고를 수 있어요. 남성·여성 구분이 어긋나면 여기서 바꾸세요.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
