'use client'

import { useFieldArray, type Control } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import {
  Button,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@iha/ui'
import type { TreatmentPlanDraftInput } from '@iha/validations'

type Props = {
  control: Control<TreatmentPlanDraftInput>
  disabled?: boolean
}

export function SpecialistsTable({ control, disabled }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: 'specialists' })

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Specialist Role</TableHead>
              <TableHead>Specialist</TableHead>
              <TableHead>Fee (AUD)</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow key={field.id}>
                <TableCell className="min-w-[10rem]">
                  <FormField
                    control={control}
                    name={`specialists.${index}.specialist_type`}
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Input disabled={disabled} placeholder="e.g. Anaesthesiologist" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TableCell>
                <TableCell className="min-w-[9rem]">
                  <FormField
                    control={control}
                    name={`specialists.${index}.specialist_name`}
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Input disabled={disabled} placeholder="Optional" {...field} value={field.value ?? ''} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TableCell>
                <TableCell className="min-w-[7rem]">
                  <FormField
                    control={control}
                    name={`specialists.${index}.cost_aud`}
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Input disabled={disabled} type="number" min={0} step="0.01" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TableCell>
                <TableCell className="min-w-[9rem]">
                  <FormField
                    control={control}
                    name={`specialists.${index}.notes`}
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Input disabled={disabled} placeholder="Optional" {...field} value={field.value ?? ''} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TableCell>
                <TableCell>
                  {!disabled && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() =>
            append({ specialist_type: '', specialist_name: '', cost_aud: 0, notes: '' })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add Specialist
        </Button>
      )}
    </div>
  )
}
