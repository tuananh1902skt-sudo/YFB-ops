-- Row level security. One brand's data must never be reachable from another
-- brand's session, and raw platform data must never be editable at all.

create or replace function has_global_role(required user_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid()
      and ur.brand_id is null
      and ur.role = any(required)
  );
$$;

create or replace function has_brand_access(target_brand uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid()
      and (
        ur.brand_id = target_brand
        or (ur.brand_id is null
            and ur.role in ('SUPER_ADMIN', 'MANAGEMENT', 'DATA_ANALYST', 'FINANCE'))
      )
  );
$$;

/** Operation and above may change planning data for a brand. */
create or replace function can_manage_brand(target_brand uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('SUPER_ADMIN', 'MANAGEMENT', 'OPERATION', 'ACCOUNT')
      and (ur.brand_id = target_brand or ur.brand_id is null)
  );
$$;

create or replace function is_assigned_to_session(target_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from live_session_staff st
    where st.session_id = target_session and st.user_id = auth.uid()
  );
$$;

create or replace function session_brand(target_session uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select brand_id from live_sessions where id = target_session;
$$;

create or replace function account_brand(target_account uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select brand_id from platform_accounts where id = target_account;
$$;

alter table users enable row level security;
alter table clients enable row level security;
alter table brands enable row level security;
alter table user_roles enable row level security;
alter table platform_accounts enable row level security;
alter table system_settings enable row level security;
alter table campaign_types enable row level security;
alter table campaigns enable row level security;
alter table live_sessions enable row level security;
alter table live_session_staff enable row level security;
alter table shift_slots enable row level security;
alter table shift_bookings enable row level security;
alter table import_mappings enable row level security;
alter table raw_imports enable row level security;
alter table raw_import_rows enable row level security;
alter table platform_rooms enable row level security;
alter table room_snapshots enable row level security;
alter table ads_daily enable row level security;
alter table session_events enable row level security;
alter table session_attributions enable row level security;
alter table target_rules enable row level security;
alter table targets enable row level security;
alter table target_allocations enable row level security;
alter table contracts enable row level security;
alter table contract_fee_components enable row level security;
alter table audit_logs enable row level security;
alter table notifications enable row level security;

-- People and roles
create policy users_read on users for select to authenticated
  using (id = auth.uid() or has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'OPERATION', 'ACCOUNT', 'DATA_ANALYST']::user_role[]));
create policy users_update_self on users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy user_roles_read on user_roles for select to authenticated
  using (user_id = auth.uid() or has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'OPERATION']::user_role[]));
create policy user_roles_write on user_roles for all to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT']::user_role[]))
  with check (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT']::user_role[]));

-- Organisation
create policy clients_read on clients for select to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'ACCOUNT', 'OPERATION', 'DATA_ANALYST', 'FINANCE']::user_role[])
         or exists (select 1 from brands b where b.client_id = clients.id and has_brand_access(b.id)));
create policy clients_write on clients for all to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT']::user_role[]))
  with check (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT']::user_role[]));

create policy brands_read on brands for select to authenticated using (has_brand_access(id));
create policy brands_write on brands for all to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT']::user_role[]))
  with check (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT']::user_role[]));

create policy platform_accounts_read on platform_accounts for select to authenticated
  using (has_brand_access(brand_id));
create policy platform_accounts_write on platform_accounts for all to authenticated
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

create policy system_settings_read on system_settings for select to authenticated using (true);
create policy system_settings_write on system_settings for all to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT']::user_role[]))
  with check (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT']::user_role[]));

create policy campaign_types_read on campaign_types for select to authenticated using (true);
create policy campaign_types_write on campaign_types for all to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'OPERATION']::user_role[]))
  with check (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'OPERATION']::user_role[]));

-- Planning
create policy campaigns_read on campaigns for select to authenticated using (has_brand_access(brand_id));
create policy campaigns_write on campaigns for all to authenticated
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

create policy live_sessions_read on live_sessions for select to authenticated
  using (has_brand_access(brand_id) or is_assigned_to_session(id));
-- Hosts and assistants never write here: ownership in particular decides whose
-- revenue a stretch of live counts as, so only Operation may set it.
create policy live_sessions_write on live_sessions for all to authenticated
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

create policy live_session_staff_read on live_session_staff for select to authenticated
  using (user_id = auth.uid() or has_brand_access(session_brand(session_id)));
create policy live_session_staff_write on live_session_staff for all to authenticated
  using (can_manage_brand(session_brand(session_id)))
  with check (can_manage_brand(session_brand(session_id)));

create policy shift_slots_read on shift_slots for select to authenticated using (has_brand_access(brand_id));
create policy shift_slots_write on shift_slots for all to authenticated
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

create policy shift_bookings_read on shift_bookings for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from shift_slots s where s.id = slot_id and has_brand_access(s.brand_id)));
create policy shift_bookings_register on shift_bookings for insert to authenticated
  with check (user_id = auth.uid());
create policy shift_bookings_review on shift_bookings for update to authenticated
  using (exists (select 1 from shift_slots s where s.id = slot_id and can_manage_brand(s.brand_id)))
  with check (exists (select 1 from shift_slots s where s.id = slot_id and can_manage_brand(s.brand_id)));

-- Imported platform data: insert and read only. There is deliberately no
-- update or delete policy on the raw tables — a correction is a new import
-- plus an UPLOAD_CORRECTED event, so the original stays intact.
create policy import_mappings_read on import_mappings for select to authenticated using (true);
create policy import_mappings_write on import_mappings for all to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'OPERATION', 'DATA_ANALYST']::user_role[]))
  with check (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'OPERATION', 'DATA_ANALYST']::user_role[]));

create policy raw_imports_read on raw_imports for select to authenticated
  using (has_brand_access(account_brand(platform_account_id)));
create policy raw_imports_insert on raw_imports for insert to authenticated
  with check (has_brand_access(account_brand(platform_account_id)) or
              exists (select 1 from live_sessions s
                      where s.platform_account_id = raw_imports.platform_account_id
                        and is_assigned_to_session(s.id)));

create policy raw_import_rows_read on raw_import_rows for select to authenticated
  using (exists (select 1 from raw_imports i
                 where i.id = import_id and has_brand_access(account_brand(i.platform_account_id))));
create policy raw_import_rows_insert on raw_import_rows for insert to authenticated
  with check (exists (select 1 from raw_imports i where i.id = import_id and i.uploaded_by = auth.uid()));

create policy platform_rooms_read on platform_rooms for select to authenticated
  using (has_brand_access(account_brand(platform_account_id)));
create policy platform_rooms_insert on platform_rooms for insert to authenticated
  with check (has_brand_access(account_brand(platform_account_id)));

create policy room_snapshots_read on room_snapshots for select to authenticated
  using (exists (select 1 from platform_rooms r
                 where r.id = room_id and has_brand_access(account_brand(r.platform_account_id))));
create policy room_snapshots_insert on room_snapshots for insert to authenticated
  with check (exists (select 1 from platform_rooms r
                      where r.id = room_id and has_brand_access(account_brand(r.platform_account_id))));

-- Ads re-imports overwrite the day, because TikTok restates recent figures.
create policy ads_daily_read on ads_daily for select to authenticated
  using (has_brand_access(account_brand(platform_account_id)));
create policy ads_daily_write on ads_daily for all to authenticated
  using (can_manage_brand(account_brand(platform_account_id)))
  with check (can_manage_brand(account_brand(platform_account_id)));

-- Shift events: logged by whoever worked the shift, reviewed by Operation.
create policy session_events_read on session_events for select to authenticated
  using (has_brand_access(session_brand(session_id)) or is_assigned_to_session(session_id));
create policy session_events_log on session_events for insert to authenticated
  with check ((is_assigned_to_session(session_id) or can_manage_brand(session_brand(session_id)))
              and created_by = auth.uid());
create policy session_events_review on session_events for update to authenticated
  using (can_manage_brand(session_brand(session_id)))
  with check (can_manage_brand(session_brand(session_id)));

-- Figures are written by the attribution engine (service role, which bypasses
-- RLS). Operation may override manually; the reason is enforced by constraint.
create policy session_attributions_read on session_attributions for select to authenticated
  using (has_brand_access(session_brand(session_id)) or is_assigned_to_session(session_id));
create policy session_attributions_override on session_attributions for all to authenticated
  using (can_manage_brand(session_brand(session_id)))
  with check (can_manage_brand(session_brand(session_id)));

-- Targets
create policy target_rules_read on target_rules for select to authenticated using (has_brand_access(brand_id));
create policy target_rules_write on target_rules for all to authenticated
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));
create policy targets_read on targets for select to authenticated using (has_brand_access(brand_id));
create policy targets_write on targets for all to authenticated
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));
create policy target_allocations_read on target_allocations for select to authenticated
  using (exists (select 1 from targets t where t.id = period_target_id and has_brand_access(t.brand_id)));
create policy target_allocations_write on target_allocations for all to authenticated
  using (exists (select 1 from targets t where t.id = period_target_id and can_manage_brand(t.brand_id)))
  with check (exists (select 1 from targets t where t.id = period_target_id and can_manage_brand(t.brand_id)));

-- Commercial terms are finance and management only.
create policy contracts_read on contracts for select to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'FINANCE']::user_role[]));
create policy contracts_write on contracts for all to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'FINANCE']::user_role[]))
  with check (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'FINANCE']::user_role[]));
create policy fee_components_read on contract_fee_components for select to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'FINANCE']::user_role[]));
create policy fee_components_write on contract_fee_components for all to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'FINANCE']::user_role[]))
  with check (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'FINANCE']::user_role[]));

create policy audit_logs_read on audit_logs for select to authenticated
  using (has_global_role(array['SUPER_ADMIN', 'MANAGEMENT', 'DATA_ANALYST']::user_role[]));
create policy audit_logs_insert on audit_logs for insert to authenticated with check (true);

create policy notifications_own on notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
