import type { ReactNode } from 'react'

import { authConnectionClasses } from '../primitives/ProviderSettingsPrimitives'

interface AuthConnectionSlotsLayoutProps {
  children: ReactNode
}

export default function AuthConnectionSlotsLayout({ children }: AuthConnectionSlotsLayoutProps) {
  return (
    <section className="shrink-0 space-y-4">
      <div className="flex flex-col gap-3">
        <div className={authConnectionClasses.shell}>
          <div className={authConnectionClasses.body}>{children}</div>
        </div>
      </div>
    </section>
  )
}
