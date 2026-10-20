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
import type { LawyerIssuedDocument } from '@iha/db/visa'
import type { LawyerCaseListItem } from '@/lib/data/cases'
import { VisaStatusBadge } from '@/components/cases/visa-status-badge'
import { ApprovedVisaCell } from './approved-visa-cell'

const PAGE_SIZE = 15

export type ApprovedCaseRow = LawyerCaseListItem & {
  document: (LawyerIssuedDocument & { signedUrl: string | null }) | null
}

export function ApprovedVisaDocumentsTable({ cases }: { cases: ApprovedCaseRow[] }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cases
    return cases.filter(
      (c) =>
        (c.patients?.full_name ?? '').toLowerCase().includes(q) ||
        (c.cases?.reference_number ?? '').toLowerCase().includes(q),
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
        <div className="flex items-center justify-end">
          <SearchInput value={query} onChange={handleQueryChange} placeholder="Search patient or case ID" />
        </div>
      </CardHeader>
      <CardContent>
        {paged.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No cases match your search.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-300 text-xs uppercase text-slate-400 hover:bg-transparent">
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Case ID
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Patient
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Status
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Approved Visa Document
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((c) => (
                <TableRow key={c.id} className="border-slate-200 align-top hover:bg-transparent">
                  <TableCell className="py-3 pr-4 font-medium">
                    <Link href={`/visa-cases/${c.case_id}`} className="text-cyan-700 hover:underline">
                      {c.cases?.reference_number ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-slate-600">
                    <div>{c.patients?.full_name ?? '—'}</div>
                    <div className="text-xs text-slate-400">{c.patients?.country_of_residence}</div>
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    <VisaStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    <ApprovedVisaCell
                      caseId={c.case_id}
                      patientName={c.patients?.full_name ?? 'the patient'}
                      document={c.document}
                    />
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
