'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { StickyNote } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@iha/ui'
import { addCaseNoteAction } from '@/lib/actions/cases'
import type { CaseNote } from '@/lib/data/cases'

function formatNoteTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type Props = {
  caseId: string
  initialNotes: CaseNote[]
}

/**
 * Internal, confidential case notes (SOW 5.2) — visible only to the lawyer,
 * never the patient. Timestamped log, most recent first.
 */
export function CaseNotesSection({ caseId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes)
  const [body, setBody] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    const trimmed = body.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await addCaseNoteAction(caseId, trimmed)
      if (!result.data) {
        toast.error(result.error ?? 'Something went wrong.')
        return
      }
      setNotes((prev) => [result.data, ...prev])
      setBody('')
      toast.success('Note added.')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-base">
          <StickyNote className="h-4 w-4 text-cyan-700" />
          Case Notes
          <span className="text-xs font-normal text-slate-400">Only visible to you</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add an internal note about this case…"
            rows={3}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={isPending || !body.trim()}
              onClick={handleSubmit}
              className="bg-cyan-700 text-white hover:bg-cyan-800"
            >
              {isPending ? 'Adding…' : 'Add Note'}
            </Button>
          </div>
        </div>

        {notes.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="whitespace-pre-wrap text-sm text-slate-700">{note.body}</p>
                <p className="mt-1.5 text-xs text-slate-400">{formatNoteTimestamp(note.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
