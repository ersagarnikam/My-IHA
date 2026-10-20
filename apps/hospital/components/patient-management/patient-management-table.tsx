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
import type { HospitalPatientRow } from '@/lib/data/patient-management'

const PAGE_SIZE = 15

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function PatientManagementTable({ patients }: { patients: HospitalPatientRow[] }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return patients
    return patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) || (p.latestCaseReferenceNumber ?? '').toLowerCase().includes(q),
    )
  }, [patients, query])

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
          <p className="py-8 text-center text-sm text-slate-500">No patients found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-300 text-xs uppercase text-slate-400 hover:bg-transparent">
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Name
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Date of Birth
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Gender
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Country
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Cases
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Latest Case
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((patient) => (
                <TableRow key={patient.id} className="border-slate-200 hover:bg-transparent">
                  <TableCell className="py-3 pr-4 font-medium text-slate-900">{patient.fullName}</TableCell>
                  <TableCell className="py-3 pr-4 text-slate-600">
                    {formatDate(patient.dateOfBirth) ?? '—'}
                  </TableCell>
                  <TableCell className="py-3 pr-4 capitalize text-slate-600">{patient.gender ?? '—'}</TableCell>
                  <TableCell className="py-3 pr-4 text-slate-600">{patient.countryOfResidence ?? '—'}</TableCell>
                  <TableCell className="py-3 pr-4 text-slate-600">{patient.caseCount}</TableCell>
                  <TableCell className="py-3 pr-4">
                    {patient.latestCaseId && patient.latestCaseReferenceNumber ? (
                      <Link
                        href={`/case-management/${patient.latestCaseId}`}
                        className="font-medium text-cyan-700 hover:underline"
                      >
                        {patient.latestCaseReferenceNumber}
                      </Link>
                    ) : (
                      <span className="text-slate-600">{patient.latestCaseReferenceNumber ?? '—'}</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    <Link
                      href={`/patient-management/${patient.id}`}
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
