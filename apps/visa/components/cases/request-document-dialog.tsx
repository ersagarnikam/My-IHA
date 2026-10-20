'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@iha/ui'
import { requestDocumentAction } from '@/lib/actions/documents'
import { REQUESTABLE_DOCUMENT_CATEGORY_LABELS } from './document-category-labels'

type Props = {
  caseId: string
}

export function RequestDocumentDialog({ caseId }: Props) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [instructions, setInstructions] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!category || !documentType.trim()) {
      toast.error('Select a category and describe the document required.')
      return
    }
    startTransition(async () => {
      const result = await requestDocumentAction(caseId, category, documentType, instructions)
      if (!result.data) {
        toast.error(result.error ?? 'Something went wrong.')
        return
      }
      toast.success('Document request sent to the patient.')
      setOpen(false)
      setCategory('')
      setDocumentType('')
      setInstructions('')
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-cyan-700 text-white hover:bg-cyan-800">
          Request Document
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-md rounded-xl bg-white p-6">
        <DialogCloseButton />
        <div className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Request a document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REQUESTABLE_DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Document type required</Label>
              <Input
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                placeholder="e.g. Updated bank statement (last 3 months)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Instructions for the patient</Label>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Clear description of what's needed and why"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className="bg-cyan-700 text-white hover:bg-cyan-800"
            >
              {isPending ? 'Sending…' : 'Send Request'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
