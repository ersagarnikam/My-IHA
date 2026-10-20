import { CheckCircle2, ExternalLink } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

const SECTION_IDS = ['visa', 'documents', 'flights', 'accommodation', 'airport', 'checklist'] as const

const AIRPORTS = [
  { city: 'Sydney',      airport: 'Kingsford Smith (SYD)' },
  { city: 'Melbourne',   airport: 'Tullamarine (MEL)' },
  { city: 'Brisbane',    airport: 'Brisbane Airport (BNE)' },
  { city: 'Perth',       airport: 'Perth Airport (PER)' },
  { city: 'Adelaide',    airport: 'Adelaide Airport (ADL)' },
  { city: 'Gold Coast',  airport: 'Gold Coast Airport (OOL)' },
]

export async function TravelGuide() {
  const t = await getTranslations('visaTravel.guide')

  const docChecklistKeys = ['item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'item7'] as const
  const arrivalChecklistKeys = ['item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6', 'item7', 'item8'] as const
  const visaInfoCards = [
    { labelKey: 'whoItIsFor' as const,    bodyKey: 'whoBody' as const    },
    { labelKey: 'processingTime' as const, bodyKey: 'processingBody' as const },
    { labelKey: 'lengthOfStay' as const,  bodyKey: 'lengthBody' as const  },
    { labelKey: 'companions' as const,    bodyKey: 'companionsBody' as const  },
  ]

  return (
    <div className="flex gap-8">
      {/* Sticky sidebar — desktop only */}
      <nav className="hidden shrink-0 lg:block">
        <div className="sticky top-24 w-44 space-y-0.5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t('contents')}</p>
          {SECTION_IDS.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              className="block rounded-md px-2.5 py-1.5 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            >
              {t(`sectionLabels.${id}`)}
            </a>
          ))}
        </div>
      </nav>

      <div className="min-w-0 flex-1 space-y-10">
        {/* 1. Visa */}
        <section id="visa" className="scroll-mt-24">
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('visa.title')}</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 text-sm text-slate-700 leading-relaxed">
            <p>
              {t.rich('visa.intro', {
                visaName: (chunks) => <span className="font-medium">{chunks}</span>,
              })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {visaInfoCards.map(({ labelKey, bodyKey }) => (
                <div key={labelKey} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{t(`visa.${labelKey}`)}</p>
                  <p className="text-sm text-slate-700">{t(`visa.${bodyKey}`)}</p>
                </div>
              ))}
            </div>
            <a
              href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/medical-treatment-602"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-cyan-600 hover:text-cyan-800 font-medium"
            >
              {t('visa.officialPage')}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </section>

        {/* 2. Documents */}
        <section id="documents" className="scroll-mt-24">
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('documents.title')}</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-4 text-sm text-slate-500">{t('documents.intro')}</p>
            <ul className="space-y-2.5">
              {docChecklistKeys.map((key) => (
                <li key={key} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
                  {t(`documents.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 3. Flights */}
        <section id="flights" className="scroll-mt-24">
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('flights.title')}</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 text-sm text-slate-700 leading-relaxed">
            <p>{t('flights.intro')}</p>
            <div className="rounded-lg bg-slate-50 p-4">
              <div className="grid gap-2 sm:grid-cols-3 text-sm">
                {AIRPORTS.map(({ city, airport }) => (
                  <div key={city}>
                    <p className="font-semibold text-slate-800">{city}</p>
                    <p className="text-slate-500">{airport}</p>
                  </div>
                ))}
              </div>
            </div>
            <ul className="space-y-1.5 text-slate-600">
              <li>• {t.rich('flights.tip0', { flexFare: (c) => <span className="font-medium">{c}</span> })}</li>
              <li>• {t.rich('flights.tip1', { travelInsurance: (c) => <span className="font-medium">{c}</span> })}</li>
              <li>• {t('flights.tip2')}</li>
            </ul>
          </div>
        </section>

        {/* 4. Accommodation */}
        <section id="accommodation" className="scroll-mt-24">
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('accommodation.title')}</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 text-sm text-slate-700 leading-relaxed">
            <p>{t('accommodation.intro')}</p>
            <ul className="space-y-1.5 text-slate-600">
              <li>• {t.rich('accommodation.tip0', { servicedApartments: (c) => <span className="font-medium">{c}</span> })}</li>
              <li>• {t.rich('accommodation.tip1', { hotelRooms: (c) => <span className="font-medium">{c}</span> })}</li>
              <li>• {t('accommodation.tip2')}</li>
              <li>• {t('accommodation.tip3')}</li>
            </ul>
          </div>
        </section>

        {/* 5. Airport & Transport */}
        <section id="airport" className="scroll-mt-24">
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('airport.title')}</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 text-sm text-slate-700 leading-relaxed">
            <p>{t('airport.intro')}</p>
            <ul className="space-y-1.5 text-slate-600">
              <li>• {t.rich('airport.tip0', { taxiRideshare: (c) => <span className="font-medium">{c}</span> })}</li>
              <li>• {t.rich('airport.tip1', { airportTrains: (c) => <span className="font-medium">{c}</span> })}</li>
              <li>• {t.rich('airport.tip2', { shuttleBuses: (c) => <span className="font-medium">{c}</span> })}</li>
              <li>• {t.rich('airport.tip3', { mobilityNeeds: (c) => <span className="font-medium">{c}</span> })}</li>
            </ul>
          </div>
        </section>

        {/* 6. Pre-Arrival Checklist */}
        <section id="checklist" className="scroll-mt-24">
          <h2 className="mb-3 text-base font-semibold text-slate-900">{t('preArrival.title')}</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-4 text-sm text-slate-500">{t('preArrival.intro')}</p>
            <ul className="space-y-2.5">
              {arrivalChecklistKeys.map((key) => (
                <li key={key} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  {t(`preArrival.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
