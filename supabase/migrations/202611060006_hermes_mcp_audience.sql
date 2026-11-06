begin;
-- Existing EO OAuth client and the explicitly authorized local Hermes client.
-- Client identifiers are public identifiers, not credentials. Other clients and
-- ordinary browser sign-ins retain their existing audience.
create or replace function public.evaorbit_mcp_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare claims jsonb;
begin
  claims:=event->'claims';
  if claims->>'client_id' in ('614ae2e8-5759-40eb-ae0c-97188bc2010c','a2035497-982a-4811-8711-acc12c5a2064') then
    claims:=jsonb_set(claims,'{aud}',to_jsonb('https://eva-orbit.vercel.app/api/mcp'::text),true);
  end if;
  return jsonb_build_object('claims',claims);
end $$;
commit;
