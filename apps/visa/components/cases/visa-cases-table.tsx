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
import type { LawyerCaseListItem } from '@/lib/data/cases'
import { VisaStatusBadge } from './visa-status-badge'

const PAGE_SIZE = 15

type Props = {
  cases: LawyerCaseListItem[]
}

export function VisaCasesTable({ cases }: Props) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cases
    return cases.filter(
      (c) =>
        (c.patients?.full_name ?? '').toLowerCase().includes(q) ||
        (c.cases?.reference_number ?? '').toLowerCase().includes(q) ||
        (c.patients?.country_of_residence ?? '').toLowerCase().includes(q),
    )
  }, [cases, query])

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SearchInput value={query} onChange={handleQueryChange} placeholder="Search patient, case ID, or country" />
        </div>
      </CardHeader>
      <CardContent>
        {paged.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No cases in this view.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-300 text-xs uppercase text-slate-400 hover:bg-transparent">
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Case ID
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Patient Name
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Country
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
              {paged.map((c) => (
                <TableRow key={c.id} className="border-slate-200 hover:bg-transparent">
                  <TableCell className="py-3 pr-4 font-medium text-slate-900">
                    {c.cases?.reference_number ?? '—'}
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-slate-600">{c.patients?.full_name ?? '—'}</TableCell>
                  <TableCell className="py-3 pr-4 text-slate-600">
                    {c.patients?.country_of_residence ?? '—'}
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    <VisaStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    <Link
                      href={`/visa-cases/${c.case_id}`}
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
