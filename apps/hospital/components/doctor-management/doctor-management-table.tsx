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
import { DoctorStatusBadge } from './doctor-status-badge'
import type { AffiliatedDoctor } from '@/lib/data/doctor-management'

const PAGE_SIZE = 15

export function DoctorManagementTable({ doctors }: { doctors: AffiliatedDoctor[] }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return doctors
    return doctors.filter(
      (d) =>
        d.fullName.toLowerCase().includes(q) ||
        d.specialties.some((s) => s.toLowerCase().includes(q)) ||
        (d.department ?? '').toLowerCase().includes(q),
    )
  }, [doctors, query])

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
          <SearchInput
            value={query}
            onChange={handleQueryChange}
            placeholder="Search name, specialty, or department"
          />
        </div>
      </CardHeader>
      <CardContent>
        {paged.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No affiliated doctors found.</p>
        ) : (
          <Table className="table-fixed min-w-[800px]">
            <TableHeader>
              <TableRow className="border-slate-300 text-xs uppercase text-slate-400 hover:bg-transparent">
                <TableHead className="h-auto w-[15%] py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Name
                </TableHead>
                <TableHead className="h-auto w-[18%] py-2 pr-6 text-xs font-medium uppercase text-slate-400">
                  Specialties
                </TableHead>
                <TableHead className="h-auto w-[16%] py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Department / Role
                </TableHead>
                <TableHead className="h-auto w-[20%] py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Contact
                </TableHead>
                <TableHead className="h-auto w-[10%] py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Experience
                </TableHead>
                <TableHead className="h-auto w-[13%] py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Status
                </TableHead>
                <TableHead className="h-auto w-[8%] py-2 pr-4 text-right text-xs font-medium uppercase text-slate-400">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((doctor) => (
                <TableRow key={doctor.id} className="border-slate-200 hover:bg-transparent">
                  <TableCell className="py-3 pr-4 font-medium text-slate-900">{doctor.fullName}</TableCell>
                  <TableCell className="whitespace-normal break-words py-3 pr-6 text-slate-600">
                    {doctor.specialties.join(', ') || '—'}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words py-3 pr-4 text-slate-600">
                    {[doctor.department, doctor.role].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words py-3 pr-4 text-slate-600">
                    <div className="break-all">{doctor.contactEmail ?? '—'}</div>
                    <div className="text-xs text-slate-400">{doctor.contactPhone ?? '—'}</div>
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-slate-600">
                    {doctor.yearsOfExperience != null ? `${doctor.yearsOfExperience} yrs` : '—'}
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    <DoctorStatusBadge status={doctor.status} />
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-right">
                    <Link
                      href={`/doctor-management/${doctor.id}`}
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
