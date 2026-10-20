-- Foundation for column-level PII encryption using pgcrypto.
--
-- The decryption key is stored in Supabase Vault (vault.secrets /
-- vault.decrypted_secrets), not as a Postgres GUC — `alter database ... set`
-- requires real superuser, which Supabase never grants on the `postgres`
-- role (locally or hosted), so a GUC-based key can't be persisted there.
--
-- For staging/prod, set the real key once per environment via the SQL
-- editor or psql (value generated with `openssl rand -base64 32`, never
-- committed to git):
--
--   select vault.create_secret('<value>', 'pii_encryption_key');
--
-- For local development we seed a fixed, non-secret placeholder below so
-- `supabase start` / `supabase db reset` work out of the box.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault cascade;

-- SECURITY DEFINER + no grant to authenticated/anon: this must never be
-- callable directly via RPC (it would hand back the raw key in plaintext).
-- Only encrypt_pii/decrypt_pii (also SECURITY DEFINER, same owner) can
-- reach it, since a SECURITY DEFINER function runs with its owner's
-- privileges once inside — they don't need an explicit grant on their own
-- owner's other functions.
create or replace function public.pii_encryption_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'pii_encryption_key'
  limit 1;
$$;

comment on function public.pii_encryption_key() is
  'Reads the PII encryption key from Supabase Vault. Not exposed to clients — only callable from encrypt_pii/decrypt_pii.';

revoke all on function public.pii_encryption_key() from public, authenticated, anon;

create or replace function public.encrypt_pii(p_plain text)
returns bytea
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_plain is null then null
    else extensions.pgp_sym_encrypt(p_plain, public.pii_encryption_key())
  end;
$$;

create or replace function public.decrypt_pii(p_cipher bytea)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_cipher is null then null
    else extensions.pgp_sym_decrypt(p_cipher, public.pii_encryption_key())
  end;
$$;

revoke all on function public.encrypt_pii(text) from public;
revoke all on function public.decrypt_pii(bytea) from public;

grant execute on function public.encrypt_pii(text) to authenticated;
grant execute on function public.decrypt_pii(bytea) to authenticated;

-- Local-dev-only placeholder key — not a real secret, just makes the local
-- stack work out of the box. Staging/prod set their own real value via
-- `vault.create_secret` out-of-band (see comment above), so this is a no-op
-- there once that's been done.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'pii_encryption_key') then
    perform vault.create_secret(
      'local-dev-only-insecure-key-do-not-use-in-prod',
      'pii_encryption_key',
      'Local dev only — staging/prod must set a real value via vault.create_secret.'
    );
  end if;
end $$;
