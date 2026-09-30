import { AccessGate } from '../components/AccessGate'
import { OpicNav } from '../components/OpicNav'

export function OpicHome() {
  return (
    <AccessGate>
      <div className="flex min-h-svh flex-col bg-op-bg font-hh-sans text-op-ink lg:flex-row">
        <OpicNav />
        <main className="min-w-0 flex-1 px-5 pb-10 lg:px-10 lg:pt-7">
          <h1 className="pt-3 text-[22px] font-bold lg:pt-0 lg:text-[26px]">OpicHome</h1>
        </main>
      </div>
    </AccessGate>
  )
}
