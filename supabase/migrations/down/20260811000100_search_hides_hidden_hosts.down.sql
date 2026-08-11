-- Revert: restore the host contribution to search without the visibility gate,
-- the narrower profiles trigger, and drop the user_sanctions rebuild trigger.

drop trigger user_sanctions_search_sync on user_sanctions;
drop function private.series_search_sync_sanction();

drop trigger profiles_search_sync on profiles;
create trigger profiles_search_sync
  after update of stage_name, deleted_at
  on profiles
  for each row execute function private.series_search_sync_host();

create or replace function private.build_series_search(p_series_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.series_search where series_id = p_series_id;
  insert into public.series_search (series_id, document, fuzzy, updated_at)
  select
    s.id,
    setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(s.title)), 'A')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(v.name)), 'A')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(v.city)), 'B')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(v.neighborhood)), 'B')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(host.stage_name)), 'B')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(v.address_line)), 'C')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(v.region)), 'C')
      || setweight(to_tsvector('pg_catalog.simple', private.unaccent_imm(s.description)), 'D'),
    private.unaccent_imm(
      concat_ws(' ', s.title, v.name, v.city, v.neighborhood, host.stage_name)
    ),
    now()
  from public.mic_series s
  join public.venues v on v.id = s.venue_id
  left join public.profiles host
    on host.id = coalesce(s.owner_id, s.created_by)
   and host.deleted_at is null
  where s.id = p_series_id
    and s.deleted_at is null
    and s.moderation_status = 'approved'
    and v.deleted_at is null
    and v.moderation_status = 'approved';
end;
$$;

do $$
begin
  perform private.build_series_search(id) from public.mic_series;
end;
$$;
