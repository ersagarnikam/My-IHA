'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 ${
          page <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'
        }`}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium ${
            p === page ? 'bg-cyan-700 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 ${
          page >= totalPages ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50'
        }`}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
