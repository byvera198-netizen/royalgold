-- Royal Gold Club · eliminación completa de la cuenta del miembro
-- La función borra los datos públicos; el backend elimina después el usuario de
-- Supabase Auth con la clave de servicio, sin exponer esa clave al navegador.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Referencias que no tienen cascade y datos asociados a mesas creadas por el miembro.
  delete from public.reports
   where reporter_id = uid
      or reported_id = uid
      or table_id in (select id from public.game_tables where host_id = uid);

  delete from public.game_results
   where player_id = uid
      or session_id in (
        select s.id
          from public.game_sessions s
          join public.game_tables t on t.id = s.table_id
         where t.host_id = uid
      );

  delete from public.game_events where actor_id = uid;

  delete from public.invitations
   where inviter_id = uid
      or invitee_id = uid
      or table_id in (select id from public.game_tables where host_id = uid);

  delete from public.table_members
   where user_id = uid
      or table_id in (select id from public.game_tables where host_id = uid);

  -- Al borrar las mesas se eliminan en cascada sesiones, eventos y membresías restantes.
  delete from public.game_tables where host_id = uid;

  delete from public.blocks where blocker_id = uid or blocked_id = uid;
  delete from public.friendships where requester_id = uid or addressee_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.wallet_transactions where user_id = uid;
  delete from public.virtual_wallets where user_id = uid;
  delete from public.profiles where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
