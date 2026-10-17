-- Royal Gold Club · permitir que cualquier participante elimine una amistad aceptada

drop policy if exists friendships_participant_delete on public.friendships;
create policy friendships_participant_delete on public.friendships
  for delete using (requester_id = auth.uid() or addressee_id = auth.uid());
