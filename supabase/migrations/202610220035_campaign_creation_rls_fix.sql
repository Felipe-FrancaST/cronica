-- 035: allow the owner's new row to satisfy SELECT during INSERT ... ON CONFLICT.
-- The STABLE can_read_campaign(id) helper cannot see a row first inserted by
-- the current statement. Supabase upserts also check its SELECT policy, even
-- without RETURNING; evaluating ownership on the candidate row fixes that case.
begin;

alter policy campaigns_read on public.campaigns
using (
  (
    owner_id = (select auth.uid())
    and private.billing_can_access((select auth.uid()), 'master')
  )
  or private.can_read_campaign(id)
);

commit;
