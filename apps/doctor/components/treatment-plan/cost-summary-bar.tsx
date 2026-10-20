'use client'

import { useWatch, type Control } from 'react-hook-form'
import type { TreatmentPlanDraftInput } from '@iha/validations'

function formatAud(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
}

// Doctor-facing total only — doctor fees + hospital fees + itemised extras +
// specialists. Never a commission-inclusive number; that's added later by
// Admin Portal on top of this (module 05 §3).
export function CostSummaryBar({ control }: { control: Control<TreatmentPlanDraftInput> }) {
  const values = useWatch({ control })

  const doctorFees = Number(values.doctor_fees_aud) || 0
  const hospitalFees = Number(values.hospital_fees_aud) || 0
  const costItemsTotal = (values.cost_items ?? []).reduce((sum, item) => sum + (Number(item?.amount) || 0), 0)
  const specialistsTotal = (values.specialists ?? []).reduce((sum, s) => sum + (Number(s?.cost_aud) || 0), 0)
  const total = doctorFees + hospitalFees + costItemsTotal + specialistsTotal

  return (
    <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 shadow-md">
      <span className="text-sm font-medium text-slate-600">Estimated Total</span>
      <span className="text-lg font-semibold text-cyan-800">{formatAud(total)}</span>
    </div>
  )
}
