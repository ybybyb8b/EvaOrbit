begin;

alter table public.ai_settings
  add column if not exists api_key_ciphertext text,
  add column if not exists api_key_iv text,
  add column if not exists api_key_auth_tag text;

do $$ begin
  alter table public.ai_settings add constraint ai_settings_api_key_encrypted_complete_check check (
    (api_key_ciphertext is null and api_key_iv is null and api_key_auth_tag is null)
    or
    (api_key_ciphertext is not null and api_key_iv is not null and api_key_auth_tag is not null)
  );
exception when duplicate_object then null; end $$;

comment on column public.ai_settings.api_key_ciphertext is 'AES-256-GCM ciphertext; never plaintext';
comment on column public.ai_settings.api_key_iv is 'AES-256-GCM 96-bit IV, Base64 encoded';
comment on column public.ai_settings.api_key_auth_tag is 'AES-256-GCM authentication tag, Base64 encoded';

commit;
