'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from './button'
import { Checkbox } from './checkbox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './form'
import { agreementStepSchema, type AgreementInput } from '@iha/validations/provider-registration'

type Props = {
  isSubmitting: boolean
  onSubmit: () => void
  onBack: () => void
}

/** Final step of both wizards. Client-side gate only — acceptance isn't persisted, it just unlocks the final submit. */
export function AgreementStep({ isSubmitting, onSubmit, onBack }: Props) {
  const form = useForm<AgreementInput>({
    resolver: zodResolver(agreementStepSchema),
    defaultValues: { agreedToTerms: undefined, confirmedAccuracy: undefined },
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="agreedToTerms"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex flex-row items-start gap-2">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="font-normal">
                  I agree to the Terms &amp; Conditions and Privacy Policy
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmedAccuracy"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <div className="flex flex-row items-start gap-2">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="font-normal">
                  I confirm all the details provided are correct
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-between pt-2">
          <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
            Back
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-cyan-600 text-white hover:bg-cyan-700"
          >
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
