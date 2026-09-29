// 가계부 화면에서 현재 열려있는 오버레이(금액 수정 팝업, 월 선택 팝오버 등)를 등록해두면,
// 뒤로가기를 눌렀을 때 가계부를 나가는 대신 그 오버레이부터 닫을 수 있다.
// (모달이 여러 개 동시에 열릴 일은 없는 화면 구조라 스택 없이 단일 슬롯으로 충분하다.)
let closeCurrentOverlay: (() => void) | null = null

/** 오버레이가 열릴 때 호출한다. 반환값은 닫힐 때(또는 언마운트 시) 호출할 해제 함수. */
export function registerHouseholdOverlay(close: () => void): () => void {
  closeCurrentOverlay = close
  return () => {
    if (closeCurrentOverlay === close) closeCurrentOverlay = null
  }
}

/** 열려있는 오버레이가 있으면 닫고 true를 반환한다. 없으면 false. */
export function closeTopHouseholdOverlay(): boolean {
  if (closeCurrentOverlay) {
    closeCurrentOverlay()
    return true
  }
  return false
}
