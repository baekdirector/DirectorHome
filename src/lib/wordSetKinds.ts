// 단어장 "종류"는 아이마다 다르다. 준이는 동사 3단변화를 쓰고, 빈이는 동의/반의를 쓴다.
// 종류를 하나 더 만들 때 고칠 곳이 여기 한 곳이 되도록 목록으로 둔다.
//
// 종류를 추가하려면:
//   1) WordSetKind에 값을 더하고 (서버 word_sets.kind가 받는 값이다)
//   2) KIND_OPTIONS에 설명과 붙여넣기 예시를 적고
//   3) 그 종류를 읽는 파서와 시험 화면을 붙인다.

import type { VocaOwner } from './profile'

export type WordSetKind = 'vocab' | 'verb'

export interface WordSetKindOption {
  kind: WordSetKind
  label: string
  /** 붙여넣기 칸에 흐리게 보여줄 예시 */
  placeholder: string
  /** 한 줄에 무엇을 넣는지 */
  hint: string
}

const VOCAB: WordSetKindOption = {
  kind: 'vocab',
  label: '일반 단어',
  hint: '한 줄에 단어 하나씩 번호 · 영단어 · 뜻 순서로 입력하세요.',
  placeholder: `1 festival 축제
2 national holiday 국경일
3 celebrate 기념하다
4 flea market 벼룩시장`,
}

const VERB: WordSetKindOption = {
  kind: 'verb',
  label: '동사 3단변화',
  hint: '한 줄에 동사 하나씩 번호 · 현재형 · 과거형 · 과거분사형 · 뜻 순서로 입력하세요.',
  placeholder: `1 come came come 오다
2 go went gone 가다
3 be was/were been 이다, 있다`,
}

/** 아이별로 고를 수 있는 단어장 종류. 첫 번째가 기본값이다. */
const KIND_OPTIONS: Record<VocaOwner, WordSetKindOption[]> = {
  junsvoca: [VOCAB, VERB],
  // 빈이는 동사 3단변화를 쓰지 않는다. 동의/반의는 입력 형식이 정해지면 여기에 더한다.
  beensvoca: [VOCAB],
}

export function kindOptionsFor(owner: VocaOwner): WordSetKindOption[] {
  return KIND_OPTIONS[owner] ?? [VOCAB]
}

export function defaultKindFor(owner: VocaOwner): WordSetKind {
  return kindOptionsFor(owner)[0].kind
}

/** 고른 종류가 이 아이에게 없는 종류면 기본값으로 되돌린다(아이를 바꿨을 때). */
export function normalizeKind(owner: VocaOwner, kind: WordSetKind): WordSetKind {
  return kindOptionsFor(owner).some((o) => o.kind === kind) ? kind : defaultKindFor(owner)
}

export function kindOption(owner: VocaOwner, kind: WordSetKind): WordSetKindOption {
  return kindOptionsFor(owner).find((o) => o.kind === kind) ?? VOCAB
}
