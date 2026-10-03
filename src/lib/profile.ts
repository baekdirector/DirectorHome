// 이 기기가 지금 누구로 들어와 있는지. 단어장·숙제·오답 노트는 아이마다 따로 쌓이므로,
// 모든 /api 요청은 이 값을 X-Voca-Owner 헤더로 함께 보낸다(src/lib/api.ts).

/** 단어장을 따로 쓰는 아이 계정. 서버의 CHILD_IDS와 같은 값이어야 한다. */
export type VocaOwner = 'junsvoca' | 'beensvoca'

/** 로그인할 수 있는 계정. admin은 부모 모드로, 두 아이 화면을 모두 볼 수 있다. */
export type ProfileId = VocaOwner | 'admin'

export const PROFILE_LABEL: Record<ProfileId, string> = {
  junsvoca: 'JunsVoca',
  beensvoca: 'BeensVoca',
  admin: '부모님',
}

export const CHILD_PROFILES: VocaOwner[] = ['junsvoca', 'beensvoca']

export function isVocaOwner(value: string | null): value is VocaOwner {
  return value === 'junsvoca' || value === 'beensvoca'
}

export function isProfileId(value: string | null): value is ProfileId {
  return isVocaOwner(value) || value === 'admin'
}

const PROFILE_KEY = 'dh_profile'
const UNTIL_KEY = 'dh_profile_until'
/** admin이 부모 모드에서 "지금 보고 있는 아이". 로그인과 별개라 만료를 두지 않는다. */
const VIEWING_KEY = 'dh_viewing_owner'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // 사파리 프라이빗 모드처럼 저장소 접근 자체가 던지는 환경이 있다.
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 저장이 막혀 있으면 이번 세션만 유지된다(메모리 상태는 그대로 돈다).
  }
}

function remove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // 지울 수 없으면 아래 만료 검사가 어차피 걸러낸다.
  }
}

/** 저장된 로그인이 아직 유효한지. 만료됐으면 지우고 null을 준다. */
export function loadProfile(): ProfileId | null {
  const id = read(PROFILE_KEY)
  if (!isProfileId(id)) return null
  const until = read(UNTIL_KEY)
  // until이 없으면 이 브라우저 세션 동안만 유효한 로그인이다(새로고침까지는 유지된다).
  if (until !== null) {
    const expiry = Number(until)
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      clearProfile()
      return null
    }
  }
  return id
}

/** `remember`면 30일간 기억한다. 아니면 이 브라우저를 닫을 때까지만. */
export function saveProfile(id: ProfileId, remember: boolean) {
  write(PROFILE_KEY, id)
  if (remember) write(UNTIL_KEY, String(Date.now() + THIRTY_DAYS_MS))
  else remove(UNTIL_KEY)
}

export function clearProfile() {
  remove(PROFILE_KEY)
  remove(UNTIL_KEY)
  remove(VIEWING_KEY)
}

/**
 * 지금 어느 아이의 단어장을 보고 있는지. 아이로 로그인했으면 자기 자신이고,
 * admin이면 부모 모드에서 고른 아이(기본값 junsvoca)다.
 */
export function viewingOwner(profile: ProfileId | null): VocaOwner {
  if (isVocaOwner(profile)) return profile
  const picked = read(VIEWING_KEY)
  return isVocaOwner(picked) ? picked : 'junsvoca'
}

export function setViewingOwner(owner: VocaOwner) {
  write(VIEWING_KEY, owner)
}
