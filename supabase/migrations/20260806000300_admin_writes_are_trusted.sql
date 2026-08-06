-- An admin's own writes are trusted: they are the review.
--
-- The moderation guard ran the banned-term filter only for non-admins, and
-- for them clean text goes live instantly. For an admin the guard did
-- nothing at all, so the row kept the column default, which is 'pending':
-- the owner adding a featured artist or host credit saw it stuck on
-- "waiting on review" forever while a regular producer's clean credit went
-- straight to the listing. Admins got strictly worse treatment than the
-- people they moderate.
--
-- Inserts by an admin now land approved. Admin updates stay untouched so
-- moderate_content keeps setting statuses explicitly, and the non-admin
-- path is unchanged. The mic_credits and venues column branches are
-- preserved from 20260801001100.

create or replace function private.guard_moderated_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean boolean;
begin
  if auth.uid() is not null then
    if not private.is_admin() then
      if tg_table_name = 'venues' then
        v_clean := private.text_is_clean(new.name, new.parking_notes);
      elsif tg_table_name = 'mic_credits' then
        -- A credit's only free text is the performer's name. Everything else
        -- on the row is a link, and those are constrained by shape already.
        v_clean := private.text_is_clean(new.name);
      else
        v_clean := private.text_is_clean(new.title, new.description, new.cost_note);
      end if;
      if tg_op = 'INSERT' then
        new.moderation_status := case when v_clean then 'approved' else 'pending' end;
      elsif new.moderation_status is distinct from old.moderation_status then
        new.moderation_status := old.moderation_status;
      elsif not v_clean then
        new.moderation_status := 'pending';
      end if;
    elsif tg_op = 'INSERT' then
      new.moderation_status := 'approved';
    end if;
  end if;
  return new;
end;
$$;

-- Rows already stuck by the old behavior. A pending row with clean text can
-- only have come from an admin (or a path that bypassed the guard): a
-- non-admin's clean insert was approved on the way in, and a non-admin's
-- held insert has text the filter flagged, which text_is_clean excludes.
update mic_credits set moderation_status = 'approved'
where moderation_status = 'pending' and private.text_is_clean(name);

update venues set moderation_status = 'approved'
where moderation_status = 'pending' and private.text_is_clean(name, parking_notes);

update mic_series set moderation_status = 'approved'
where moderation_status = 'pending' and private.text_is_clean(title, description, cost_note);
