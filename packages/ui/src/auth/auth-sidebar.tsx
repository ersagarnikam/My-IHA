const FEATURES = [
  {
    title: 'Global Hospitals',
    description: 'Access top medical specialists worldwide.',
  },
  {
    title: 'Virtual Consultations',
    description: 'Easy doctor meetings via Zoom.',
  },
  {
    title: 'Secure Payments',
    description: 'Hassle-free transactions for treatments.',
  },
  {
    title: 'Visa & Travel Support',
    description: 'End-to-end assistance for international patients.',
  },
] as const

export type AuthSidebarProps = {
  illustrationSrc?: string
}

export function AuthSidebar({
  illustrationSrc = '/auth-illustration.png',
}: AuthSidebarProps) {
  return (
    <aside className="relative hidden flex-col overflow-hidden rounded-3xl bg-[#eef4f8] px-8 pt-12 lg:flex lg:w-[48%] xl:w-[50%]">
      <div className="mx-auto text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-black xl:text-[1.65rem]">
          Seamless Healthcare Access, Anytime, Anywhere
        </h2>
        <p className="mt-3 text-md leading-relaxed text-black">
          Join our platform to connect with top hospitals and specialists effortlessly.
        </p>
      </div>

      <div className="mx-auto mt-8 grid grid-cols-2 gap-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-white/60 bg-white px-4 py-6 text-center shadow-sm"
          >
            <p className="text-md font-semibold text-black">{feature.title}</p>
            <p className="mt-1 text-md leading-snug text-black">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex min-h-0 flex-1 items-end justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={illustrationSrc}
          alt=""
          className="h-auto max-h-full w-full max-w-[420px] object-contain object-bottom"
        />
      </div>
    </aside>
  )
}
