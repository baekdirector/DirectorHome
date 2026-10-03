import { createContext, useContext, useState, type ReactNode } from 'react'
import { login } from '../lib/auth'
import {
  CHILD_PROFILES,
  PROFILE_LABEL,
  clearProfile,
  isVocaOwner,
  loadProfile,
  saveProfile,
  setViewingOwner,
  viewingOwner,
  type ProfileId,
  type VocaOwner,
} from '../lib/profile'

interface ProfileState {
  /** 로그인한 계정. admin이면 부모 모드다. */
  profile: ProfileId
  /** 지금 보고 있는 아이의 단어장. 아이로 로그인했으면 자기 자신이다. */
  owner: VocaOwner
  isAdmin: boolean
  /** 부모 모드에서 보는 아이를 바꾼다. 아이 계정에서는 아무 일도 하지 않는다. */
  switchOwner: (next: VocaOwner) => void
  logout: () => void
}

const ProfileContext = createContext<ProfileState | null>(null)

/** 로그인한 계정과 지금 보고 있는 아이. ProfileGate 안쪽에서만 쓸 수 있다. */
export function useProfile(): ProfileState {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('useProfile must be used inside ProfileGate')
  return value
}

/**
 * 앱 전체를 감싸는 입구. 로그인하지 않았으면 "너 누구니?" 화면만 보여준다.
 * 가계부·OPIC도 이 안쪽에 있지만 각자의 비밀번호 게이트를 그대로 유지한다.
 */
export function ProfileGate({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileId | null>(loadProfile)
  const [owner, setOwner] = useState<VocaOwner>(() => viewingOwner(loadProfile()))

  if (profile === null) {
    return (
      <LoginScreen
        onSuccess={(id, remember) => {
          saveProfile(id, remember)
          setProfile(id)
          setOwner(viewingOwner(id))
        }}
      />
    )
  }

  const value: ProfileState = {
    profile,
    owner,
    isAdmin: profile === 'admin',
    switchOwner: (next) => {
      if (profile !== 'admin') return
      setViewingOwner(next)
      setOwner(next)
    },
    logout: () => {
      clearProfile()
      setProfile(null)
    },
  }

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

const LOGIN_IDS: { id: ProfileId; hint: string }[] = [
  { id: 'junsvoca', hint: '준이 단어장' },
  { id: 'beensvoca', hint: '빈이 단어장' },
  { id: 'admin', hint: '가계부 · OPIC · 숙제 관리' },
]

function LoginScreen({ onSuccess }: { onSuccess: (id: ProfileId, remember: boolean) => void }) {
  const [id, setId] = useState<ProfileId>('junsvoca')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  async function submit() {
    if (checking || password === '') return
    setChecking(true)
    setError(null)
    try {
      const result = await login(id, password)
      if (result.ok) {
        onSuccess(id, remember)
        return
      }
      setError(
        result.reason === 'unset'
          ? '아직 비밀번호가 정해지지 않았어요. 부모님께 요청해주세요.'
          : '비밀번호가 올바르지 않아요.',
      )
    } catch {
      setError('확인 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-[360px]">
        <div className="flex items-center justify-center gap-2.5">
          <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-[12px]" />
          <span className="font-display text-[20px] font-bold">DirectorHome</span>
        </div>

        <h1 className="mt-7 text-center text-[26px] font-extrabold">너 누구니?</h1>
        <p className="m-0 mt-2 text-center text-[13.5px] text-ink-muted">
          누구인지 고르고 비밀번호를 넣어주세요.
        </p>

        <div role="radiogroup" aria-label="사용자" className="mt-6 flex flex-col gap-2">
          {LOGIN_IDS.map((option) => {
            const selected = option.id === id
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setId(option.id)
                  setError(null)
                }}
                className={`flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left ${
                  selected ? 'border-primary bg-primary-tint/40' : 'border-border bg-surface'
                }`}
              >
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 ${
                    selected ? 'border-primary' : 'border-border'
                  }`}
                >
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] font-bold">{PROFILE_LABEL[option.id]}</span>
                  <span className="block text-[12.5px] text-ink-muted">{option.hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="비밀번호"
          aria-label="비밀번호"
          className="mt-4 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-primary"
        />

        <label className="mt-3 flex items-center gap-2.5 px-1 text-[13.5px] text-ink">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-[18px] w-[18px] accent-[var(--color-primary)]"
          />
          30일 동안 이 기기에서 다시 묻지 않기
        </label>

        {error && <p className="m-0 mt-3 text-[13px] font-semibold text-error">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={checking || password === ''}
          className="mt-5 w-full rounded-2xl bg-primary p-[15px] text-[15.5px] font-bold text-white disabled:opacity-40"
        >
          {checking ? '확인 중...' : '들어가기'}
        </button>
      </div>
    </div>
  )
}

/** 부모 모드에서 보고 있는 아이를 바꾸는 토글. 아이 계정에서는 아무것도 그리지 않는다. */
export function OwnerSwitch({ className = '' }: { className?: string }) {
  const { isAdmin, owner, switchOwner } = useProfile()
  if (!isAdmin) return null

  return (
    <div role="radiogroup" aria-label="보고 있는 아이" className={`flex flex-none gap-1.5 ${className}`}>
      {CHILD_PROFILES.map((child) => {
        const selected = child === owner
        return (
          <button
            key={child}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => isVocaOwner(child) && switchOwner(child)}
            className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold ${
              selected ? 'bg-primary text-white' : 'border border-border bg-surface text-ink-muted'
            }`}
          >
            {PROFILE_LABEL[child]}
          </button>
        )
      })}
    </div>
  )
}
