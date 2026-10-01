import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, CheckCircleIcon } from '../components/icons'
import { parseWordsDetailed } from '../lib/parseWords'
import { parseVerbsDetailed } from '../lib/verbs'

const DRAFT_KEY = 'junsvoca_draft_words'

type Kind = 'vocab' | 'verb'

const PLACEHOLDER = `1 festival 축제
2 national holiday 국경일
3 celebrate 기념하다
4 flea market 벼룩시장`

const VERB_PLACEHOLDER = `1 come came come 오다
2 go went gone 가다
3 be was/were been 이다, 있다`

function defaultTitle() {
  const d = new Date()
  return `${d.getMonth() + 1}월 ${d.getDate()}일 단어장`
}

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveDraft(text: string) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text)
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    // 저장 공간을 못 쓰는 환경에서는 임시 저장만 건너뛴다.
  }
}

export function TextInput() {
  const navigate = useNavigate()
  const [text, setText] = useState(loadDraft)
  const [title, setTitle] = useState(defaultTitle)
  const [kind, setKind] = useState<Kind>('vocab')

  const vocab = useMemo(() => parseWordsDetailed(text), [text])
  const verb = useMemo(() => parseVerbsDetailed(text), [text])
  const isVerb = kind === 'verb'
  const count = isVerb ? verb.verbs.length : vocab.words.length
  const skipped = isVerb ? verb.skipped : vocab.skipped

  function handleChange(value: string) {
    setText(value)
    saveDraft(value)
  }

  function goToReview() {
    saveDraft('')
    navigate('/wordsets/review', {
      state: {
        kind,
        words: vocab.words,
        verbs: verb.verbs,
        title: title.trim() || defaultTitle(),
      },
    })
  }

  return (
    <div className="flex min-h-svh flex-col bg-bg">
      <div className="flex flex-none items-center gap-3 px-[18px] pt-[18px]">
        <button
          type="button"
          aria-label="홈으로"
          onClick={() => navigate('/')}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-ink"
        >
          <ArrowLeftIcon />
        </button>
        <h2 className="m-0 text-[17px] font-bold">단어 입력하기</h2>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-[22px] py-5">
        <label className="block">
          <span className="text-[13px] font-bold text-ink-muted">단어장 이름</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={defaultTitle()}
            className="mt-1.5 block w-full rounded-2xl border-[1.5px] border-border bg-surface p-3.5 text-[16px] font-bold outline-none focus:border-primary"
          />
        </label>

        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-alt p-1">
          {(['vocab', 'verb'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`h-10 rounded-xl text-[14px] font-semibold ${
                kind === k ? 'bg-surface text-primary shadow-sm' : 'text-ink-muted'
              }`}
            >
              {k === 'vocab' ? '일반 단어' : '동사 3단변화'}
            </button>
          ))}
        </div>

        <div>
          <p className="m-0 text-[13px] leading-relaxed text-ink-muted">
            {isVerb ? (
              <>
                한 줄에 하나씩 <b className="text-ink">번호 · 현재형 · 과거형 · 과거분사형 · 뜻</b>{' '}
                순서로 입력하세요.
                <br />
                번호는 없어도 되고, 뜻에 띄어쓰기나 쉼표가 있어도 괜찮아요. 예) come came come 오다
              </>
            ) : (
              <>
                한 줄에 단어 하나씩 <b className="text-ink">번호 · 영단어 · 뜻</b> 순서로 입력하세요.
                <br />
                번호는 없어도 되고, 메모장이나 엑셀에서 붙여넣어도 돼요.
              </>
            )}
          </p>
          <textarea
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={isVerb ? VERB_PLACEHOLDER : PLACEHOLDER}
            rows={9}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="mt-2.5 block w-full resize-y rounded-2xl border-[1.5px] border-border bg-surface p-3.5 text-[15px] leading-relaxed outline-none focus:border-primary"
          />
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            <CheckCircleIcon width={15} height={15} className={count > 0 ? 'text-success' : ''} />
            <span>
              {isVerb ? '인식된 동사' : '인식된 단어'} <b className="text-ink">{count}개</b>
            </span>
          </div>

          {count > 0 && (
            <ol className="m-0 mt-2 max-h-[280px] list-none overflow-y-auto rounded-2xl border border-border bg-surface p-0">
              {isVerb
                ? verb.verbs.map((v, i) => (
                    <li
                      key={v.term}
                      className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <span className="text-xs text-ink-muted">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="break-words font-display text-[15.5px] font-bold">
                          {v.term} · {v.past} · {v.participle}
                        </div>
                        <div className="break-words text-[12.5px] text-ink-muted">{v.meaning}</div>
                      </div>
                    </li>
                  ))
                : vocab.words.map((w, i) => (
                    <li
                      key={w.term}
                      className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-2 border-b border-border px-3 py-2 last:border-b-0"
                    >
                      <span className="text-xs text-ink-muted">{i + 1}</span>
                      <span className="break-words font-display text-[16.5px] font-bold">
                        {w.term}
                        {w.isIdiom && (
                          <span className="ml-1.5 rounded-md bg-accent-tint px-1.5 py-0.5 align-middle font-kr text-[10px] font-bold text-accent-dark">
                            숙어
                          </span>
                        )}
                      </span>
                      <span className="break-words text-[13px]">{w.meaning}</span>
                    </li>
                  ))}
            </ol>
          )}
        </div>

        {skipped.length > 0 && (
          <div className="rounded-2xl border border-error/40 bg-error-tint p-3.5">
            <p className="m-0 text-[13px] font-bold text-error">
              {skipped.length}줄은 {isVerb ? '동사로' : '단어로'} 읽지 못해서 빠졌어요
            </p>
            <p className="m-0 mt-0.5 text-[12px] text-ink-muted">
              {isVerb
                ? '현재형·과거형·과거분사형과 한글 뜻이 모두 있는지, 같은 동사가 두 번 들어가지 않았는지 확인해주세요.'
                : '영단어와 한글 뜻이 모두 있는지, 같은 단어가 두 번 들어가지 않았는지 확인해주세요.'}
            </p>
            <ul className="m-0 mt-2 list-disc break-words pl-4 text-[12.5px]">
              {skipped.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-none flex-col gap-2 border-t border-border bg-surface px-[22px] pb-5 pt-3.5">
        <button
          type="button"
          disabled={count === 0}
          onClick={goToReview}
          className="rounded-2xl bg-primary p-[15px] text-center text-[15.5px] font-bold text-white disabled:opacity-40"
        >
          {count > 0
            ? `${isVerb ? '동사' : '단어'} ${count}개 확인하러 가기`
            : `${isVerb ? '동사를' : '단어를'} 입력해주세요`}
        </button>
      </div>
    </div>
  )
}
