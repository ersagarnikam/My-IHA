// Stable entry point for `@iha/db/types` — this file is hand-maintained and
// is NOT touched by `pnpm db:types` (which only overwrites database.types.ts).
// Import `Database`/`Json`/table aliases from here (or `@iha/db/types`),
// never straight from `./database.types`, so the decrypted computed-column
// merge below is never accidentally bypassed.
import type { Database as GeneratedDatabase, Json } from './database.types'
import type {
  PatientsComputedColumns,
  CasesComputedColumns,
  VisaSubmissionsComputedColumns,
  HospitalsComputedColumns,
  DoctorsComputedColumns,
  LawyersComputedColumns,
} from './computed-columns'

export type { Json }

type GeneratedTables = GeneratedDatabase['public']['Tables']

export type Database = {
  __InternalSupabase: GeneratedDatabase['__InternalSupabase']
  public: Omit<GeneratedDatabase['public'], 'Tables'> & {
    Tables: Omit<
      GeneratedTables,
      'patients' | 'cases' | 'visa_submissions' | 'hospitals' | 'doctors' | 'lawyers'
    > & {
      patients: Omit<GeneratedTables['patients'], 'Row'> & {
        Row: GeneratedTables['patients']['Row'] & PatientsComputedColumns
      }
      cases: Omit<GeneratedTables['cases'], 'Row'> & {
        Row: GeneratedTables['cases']['Row'] & CasesComputedColumns
      }
      visa_submissions: Omit<GeneratedTables['visa_submissions'], 'Row'> & {
        Row: GeneratedTables['visa_submissions']['Row'] & VisaSubmissionsComputedColumns
      }
      hospitals: Omit<GeneratedTables['hospitals'], 'Row'> & {
        Row: GeneratedTables['hospitals']['Row'] & HospitalsComputedColumns
      }
      doctors: Omit<GeneratedTables['doctors'], 'Row'> & {
        Row: GeneratedTables['doctors']['Row'] & DoctorsComputedColumns
      }
      lawyers: Omit<GeneratedTables['lawyers'], 'Row'> & {
        Row: GeneratedTables['lawyers']['Row'] & LawyersComputedColumns
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>
type DefaultSchema = DatabaseWithoutInternals['public']

export type Tables<TableName extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])> =
  (DefaultSchema['Tables'] & DefaultSchema['Views'])[TableName] extends { Row: infer R } ? R : never

export type TablesInsert<TableName extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][TableName] extends { Insert: infer I } ? I : never

export type TablesUpdate<TableName extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][TableName] extends { Update: infer U } ? U : never

export type Enums<EnumName extends keyof DefaultSchema['Enums']> = DefaultSchema['Enums'][EnumName]

export type CompositeTypes<Name extends keyof DefaultSchema['CompositeTypes']> =
  DefaultSchema['CompositeTypes'][Name]

// Convenience aliases for the row shapes apps import most often. `_enc`
// columns are stripped generically (not by per-column name) — clients can
// never select them directly (see the `revoke select (..._enc)` grants in
// the encryption migrations), so any current or future `*_enc` column is
// excluded automatically.
type OmitEncColumns<T> = Omit<T, Extract<keyof T, `${string}_enc`>>

export type Case = OmitEncColumns<Tables<'cases'>>
export type CaseDocument = Tables<'case_documents'>
export type Notification = Tables<'notifications'>
export type ChatMessage = Tables<'chat_messages'>
export type ChatThread = Tables<'chat_threads'>
export type Patient = OmitEncColumns<Tables<'patients'>>
export type Hospital = OmitEncColumns<Tables<'hospitals'>>
export type Doctor = OmitEncColumns<Tables<'doctors'>>
export type Lawyer = OmitEncColumns<Tables<'lawyers'>>
export type PaymentMethod = Tables<'payment_methods'>
export type DoctorCaseAssignment = Tables<'doctor_case_assignments'>
export type ProviderMessageThread = Tables<'provider_message_threads'>
export type ProviderMessage = Tables<'provider_messages'>
