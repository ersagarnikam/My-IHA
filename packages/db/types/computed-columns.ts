import type { Database as GeneratedDatabase } from './database.types'

type Functions = GeneratedDatabase['public']['Functions']

/**
 * Decrypted PostgREST computed columns added by the PII-encryption
 * migrations (packages/db/supabase/migrations/20260622*_encrypt_*.sql,
 * 20260717000001_encrypt_patient_demographics.sql,
 * 20260717000002_encrypt_hospital_doctor_credentials.sql).
 * Each one is a SQL function `fn(row) returns T` that PostgREST exposes as
 * a selectable column (`.select('phone')`) alongside the raw `<name>_enc`
 * ciphertext column. `supabase gen types` lists these under `Functions`
 * instead of merging them into the owning table's `Row` — see `./index.ts`,
 * which merges them back in for every consumer of `@iha/db/types`.
 *
 * Value types are pulled from the live generated `Functions` entries, not
 * hardcoded, so a migration that changes a function's return type is picked
 * up automatically on the next `pnpm db:types`. And because each line below
 * indexes `Functions` by the function's literal name, renaming or dropping
 * one of these functions makes this file fail to compile — a loud signal to
 * fix the mapping here, instead of the type silently drifting out of sync
 * with the database the way a hand-edited database.types.ts did.
 *
 * Adding a new encrypted column: write the migration (same encrypt_pii +
 * computed-column pattern as the ones above), run `pnpm db:types`, then add
 * one line here and wire the table up in `./index.ts`.
 */
export type PatientsComputedColumns = {
  phone: Functions['phone']['Returns'] | null
  address: Functions['address']['Returns'] | null
  medical_history: Functions['medical_history']['Returns'] | null
  emergency_contact_name: Functions['emergency_contact_name']['Returns'] | null
  emergency_contact_phone: Functions['emergency_contact_phone']['Returns'] | null
  emergency_contact_relationship: Functions['emergency_contact_relationship']['Returns'] | null
  full_name: Functions['full_name']['Returns'] | null
  date_of_birth: Functions['date_of_birth']['Returns'] | null
  allergies: Functions['allergies']['Returns'] | null
  current_medications: Functions['current_medications']['Returns'] | null
  past_surgeries: Functions['past_surgeries']['Returns'] | null
}

export type CasesComputedColumns = {
  description: Functions['description']['Returns'] | null
}

export type VisaSubmissionsComputedColumns = {
  form_data: Functions['form_data']['Returns'] | null
}

// `license_number` is overloaded in SQL (public.license_number(hospitals) /
// public.license_number(doctors)) since PostgREST resolves a computed column
// by matching the function's single argument type to the querying table.
// `supabase gen types` may list overloads as a union in `Functions['license_number']`
// rather than one entry per table — if so, narrow with a type assertion here
// rather than threading a cast through every call site.
export type HospitalsComputedColumns = {
  registration_number: Functions['registration_number']['Returns'] | null
  abn_number: Functions['abn_number']['Returns'] | null
  license_number: Functions['license_number']['Returns'] | null
}

export type DoctorsComputedColumns = {
  license_number: Functions['license_number']['Returns'] | null
  // Reuses the same `date_of_birth` Functions entry defined for patients above —
  // both are the same `date_of_birth(row) returns date` computed-column shape,
  // just overloaded per-table like `license_number` is.
  date_of_birth: Functions['date_of_birth']['Returns'] | null
}

export type LawyersComputedColumns = {
  registration_number: Functions['registration_number']['Returns'] | null
  abn_number: Functions['abn_number']['Returns'] | null
}
