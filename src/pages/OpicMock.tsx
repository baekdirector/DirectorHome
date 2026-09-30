import { AccessGate } from '../components/AccessGate'
import { OpicNav } from '../components/OpicNav'

/**
 * 사전 모의테스트. 아직 기획 단계라 무엇을 만들 것인지만 적어 둔다.
 * 지금 동작하는 것이 없으므로 조작할 수 있는 척하는 버튼은 두지 않는다.
 */
export function OpicMock() {
  return (
    <AccessGate>
      <div className="flex min-h-svh flex-col bg-op-bg font-hh-sans text-op-ink lg:flex-row">
        <OpicNav />
        <main className="min-w-0 flex-1 px-5 pb-12 pt-3 lg:px-10 lg:pt-7">
          <div className="lg:max-w-[720px]">
            <h1 className="m-0 text-[22px] font-bold tracking-tight lg:text-[26px]">사전 모의테스트</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-op-ink-muted">
              실제 OPIc처럼 에바가 질문하고 답변을 연습하는 화면입니다. 아직 준비 중이에요.
            </p>

            <section className="mt-5 rounded-2xl border border-op-border bg-white p-5">
              <h2 className="m-0 text-[15px] font-bold">이렇게 만들 예정이에요</h2>
              <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-[14px] leading-relaxed text-op-ink">
                <li>
                  Background Survey에서 고른 항목에 해당하는 주제만 골라 보여주고, 그 주제의 질문으로
                  시험을 구성합니다.
                </li>
                <li>에바가 여성 음성으로 질문을 읽고, 답변할 시간을 줍니다.</li>
                <li>끝난 뒤 문항마다 스크립트를 펼쳐 보며 암기 상태를 남길 수 있게 합니다.</li>
              </ul>
            </section>
          </div>
        </main>
      </div>
    </AccessGate>
  )
}
