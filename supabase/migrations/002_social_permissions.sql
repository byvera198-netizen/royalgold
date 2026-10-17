-- Royal Gold Club · permisos para comunidad, seguimiento e invitaciones de partida

-- Un destinatario puede responder una invitación que no creó.
drop policy if exists invitations_inviter_write on public.invitations;
create policy invitations_inviter_insert on public.invitations
  for insert with check (inviter_id = auth.uid());
create policy invitations_inviter_update on public.invitations
  for update using (inviter_id = auth.uid())
  with check (inviter_id = auth.uid());
create policy invitations_invitee_update on public.invitations
  for update using (invitee_id = auth.uid())
  with check (invitee_id = auth.uid() and status in ('accepted', 'declined'));

-- El invitado puede resolver el código de la mesa asociada a su invitación,
-- sin hacer públicas las demás mesas privadas del club.
drop policy if exists tables_read on public.game_tables;
create policy tables_read on public.game_tables for select using (
  not is_private
  or host_id = auth.uid()
  or exists (select 1 from public.table_members m where m.table_id = id and m.user_id = auth.uid())
  or exists (
    select 1 from public.invitations i
    where i.table_id = id
      and i.invitee_id = auth.uid()
      and i.status = 'pending'
      and i.expires_at > now()
  )
);

-- El destinatario puede aceptar o rechazar una relación pendiente;
-- el emisor puede cancelarla. Las lecturas siguen limitadas a los participantes.
drop policy if exists friendships_self_write on public.friendships;
create policy friendships_request on public.friendships
  for insert with check (requester_id = auth.uid() and requester_id <> addressee_id);
create policy friendships_requester_update on public.friendships
  for update using (requester_id = auth.uid())
  with check (requester_id = auth.uid());
create policy friendships_addressee_update on public.friendships
  for update using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid() and status in ('accepted', 'blocked'));

-- Realtime necesita conocer los cambios para refrescar presencia e invitaciones.
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.invitations;
exception when duplicate_object then null;
end $$;
