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

const SUGGESTED_LABELS = [
  'Surgery Charge',
  'Diagnostics & Lab',
  'Anaesthesia Charges',
  'Medication Estimate',
  'Rehabilitation Charges',
]

type Props = {
  control: Control<TreatmentPlanDraftInput>
  disabled?: boolean
}

export function CostItemsTable({ control, disabled }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: 'cost_items' })

  return (
    <div className="space-y-3">
      {fields.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Amount (AUD)</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => (
              <TableRow key={field.id}>
                <TableCell className="min-w-[12rem]">
                  <FormField
                    control={control}
                    name={`cost_items.${index}.label`}
                    render={({ field }) => (
                      <FormItem className="space-y-0">
                        <FormControl>
                          <Input disabled={disabled} placeholder="e.g. Surgery Charge" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TableCell>
                <TableCell className="min-w-[7rem]">
                  <FormField
                    control={control}
                    name={`cost_items.${index}.amount`}
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
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_LABELS.filter((label) => !fields.some((f) => f.label === label)).map((label) => (
            <Button
              key={label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ label, amount: 0 })}
            >
              + {label}
            </Button>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => append({ label: '', amount: 0 })}>
            <Plus className="h-3.5 w-3.5" />
            Custom Item
          </Button>
        </div>
      )}
    </div>
  )
}
