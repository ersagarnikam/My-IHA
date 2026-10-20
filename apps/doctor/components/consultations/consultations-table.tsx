'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SearchInput,
  Pagination,
} from '@iha/ui'
import type { ConsultationRequestWithContext } from '@iha/db/consultations'
import { ConsultationStatusBadge } from './consultation-status-badge'

const PAGE_SIZE = 15

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ConsultationsTable({ requests }: { requests: ConsultationRequestWithContext[] }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return requests
    return requests.filter(
      (r) =>
        (r.patient_name ?? '').toLowerCase().includes(q) ||
        (r.case_reference_number ?? '').toLowerCase().includes(q),
    )
  }, [requests, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function handleQueryChange(next: string) {
    setQuery(next)
    setPage(1)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-end gap-2">
          <SearchInput value={query} onChange={handleQueryChange} placeholder="Search" />
        </div>
      </CardHeader>
      <CardContent>
        {paged.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No consultation requests in this view.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-300 text-xs uppercase text-slate-400 hover:bg-transparent">
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Patient
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Case ID
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Procedure
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Requested
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Status
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((r) => (
                <TableRow key={r.id} className="border-slate-200 hover:bg-transparent">
                  <TableCell className="py-3 pr-4 font-medium text-slate-900">{r.patient_name ?? '—'}</TableCell>
                  <TableCell className="py-3 pr-4">
                    {r.case_reference_number ? (
                      <Link href={`/cases/${r.case_id}`} className="text-cyan-700 hover:underline">
                        {r.case_reference_number}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-slate-600">
                    {r.treatment_option?.description ?? r.treatment_option?.procedure_name ?? '—'}
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-slate-600">{formatDate(r.requested_at)}</TableCell>
                  <TableCell className="py-3 pr-4">
                    <ConsultationStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    <Link
                      href={`/consultations/${r.id}`}
                      className="inline-flex h-8 items-center rounded-md bg-cyan-700 px-3 text-xs font-medium text-white hover:bg-cyan-800"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {filtered.length > 0 && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <p>
            Showing {paged.length} of {filtered.length} Results
          </p>
          <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
        </CardFooter>
      )}
    </Card>
  )
}
