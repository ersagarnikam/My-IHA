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
} from '@iha/ui'
import type { HospitalGeneratedDocument } from '@iha/db/visa'
import type { VisaEligibleCase } from '@/lib/data/case-management'
import { SearchInput, Pagination, CaseStatusBadge } from '@iha/ui'
import { DocumentStatusCell } from './document-status-cell'

const PAGE_SIZE = 15

type Props = {
  cases: VisaEligibleCase[]
  documentsByCase: Map<string, HospitalGeneratedDocument[]>
}

export function DocumentsTable({ cases, documentsByCase }: Props) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cases
    return cases.filter(
      (c) => c.patientName.toLowerCase().includes(q) || c.referenceNumber.toLowerCase().includes(q),
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
                  Hospital Invitation Letter
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Appointment Confirmation Letter
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((c) => {
                const docs = documentsByCase.get(c.caseId) ?? []
                const byType = new Map(docs.map((d) => [d.category, d]))
                return (
                  <TableRow key={c.caseId} className="border-slate-200 align-top hover:bg-transparent">
                    <TableCell className="py-3 pr-4 font-medium">
                      <Link
                        href={`/case-management/${c.caseId}?assignmentId=${c.assignmentId}`}
                        className="text-cyan-700 hover:underline"
                      >
                        {c.referenceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-slate-600">
                      <div>{c.patientName}</div>
                      <div className="text-xs text-slate-400">{c.specialtyOther ?? c.specialty}</div>
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      <CaseStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      <DocumentStatusCell
                        caseId={c.caseId}
                        documentType="hospital_invitation"
                        label="Hospital Invitation Letter"
                        initialDocument={byType.get('hospital_invitation') ?? null}
                      />
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      <DocumentStatusCell
                        caseId={c.caseId}
                        documentType="appointment_confirmation"
                        label="Appointment Confirmation Letter"
                        initialDocument={byType.get('appointment_confirmation') ?? null}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
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
