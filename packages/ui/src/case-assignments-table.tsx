'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader } from './card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table'
import type { AssignmentWithCase } from '@iha/db/case-assignments'
import { SearchInput } from './search-input'
import { Pagination } from './pagination'
import { CaseRowStatusBadge } from './case-row-status-badge'

type AssignmentRow = AssignmentWithCase & {
  doctors?: { full_name: string } | null
  treatmentPlanStatus?: string | null
}

const PAGE_SIZE = 15

type Props = {
  assignments: AssignmentRow[]
  showDoctorColumn?: boolean
  /** When set, adds an Action column linking to `${viewHrefBase}/${caseId}`.
   * With viewHrefDisambiguateAssignment, appends `?assignmentId=${assignment.id}`
   * too — needed wherever one case can have more than one assignment row per
   * viewer (e.g. the hospital portal, where two of a hospital's own doctors
   * can be routed the same case in parallel and both rows would otherwise
   * link to the same case-scoped URL). */
  viewHrefBase?: string
  viewHrefDisambiguateAssignment?: boolean
  searchPlaceholder?: string
  /** Extra filter control (e.g. a date-range Select) rendered next to the search box. */
  extraFilter?: ReactNode
}

export function CaseAssignmentsTable({
  assignments,
  showDoctorColumn,
  viewHrefBase,
  viewHrefDisambiguateAssignment,
  searchPlaceholder = 'Search',
  extraFilter,
}: Props) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return assignments
    return assignments.filter(
      (a) =>
        (a.cases?.patients?.full_name ?? '').toLowerCase().includes(q) ||
        (a.cases?.reference_number ?? '').toLowerCase().includes(q) ||
        (a.doctors?.full_name ?? '').toLowerCase().includes(q),
    )
  }, [assignments, query])

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
          <SearchInput value={query} onChange={handleQueryChange} placeholder={searchPlaceholder} />
          {extraFilter}
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
                {showDoctorColumn && (
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Doctor
                  </TableHead>
                )}
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Condition
                </TableHead>
                <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                  Status
                </TableHead>
                {viewHrefBase && (
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Action
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((a) => (
                <TableRow key={a.id} className="border-slate-200 hover:bg-transparent">
                  <TableCell className="py-3 pr-4 font-medium text-slate-900">
                    {a.cases?.reference_number ?? '—'}
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-slate-600">
                    {a.cases?.patients?.full_name ?? '—'}
                  </TableCell>
                  {showDoctorColumn && (
                    <TableCell className="py-3 pr-4 text-slate-600">{a.doctors?.full_name ?? '—'}</TableCell>
                  )}
                  <TableCell className="py-3 pr-4 text-slate-600">
                    {a.cases?.specialty_other || a.cases?.specialty || '—'}
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    {a.cases && (
                      <CaseRowStatusBadge
                        assignmentStatus={a.status}
                        caseStatus={a.cases.status}
                        planSubmittedAt={a.plan_submitted_at}
                        treatmentPlanStatus={a.treatmentPlanStatus}
                      />
                    )}
                  </TableCell>
                  {viewHrefBase && (
                    <TableCell className="py-3 pr-4">
                      <Link
                        href={`${viewHrefBase}/${a.case_id}${viewHrefDisambiguateAssignment ? `?assignmentId=${a.id}` : ''}`}
                        className="inline-flex h-8 items-center rounded-md bg-cyan-700 px-3 text-xs font-medium text-white hover:bg-cyan-800"
                      >
                        View
                      </Link>
                    </TableCell>
                  )}
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
