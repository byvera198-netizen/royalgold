const app = document.querySelector('#app');
const toastRegion = document.querySelector('#toast-region');
const SUPABASE_URL = 'https://ypavidhvtxhzohmklgxj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-OZM6jdZSj123ouNufylPQ_NZMJBK8K';
const ADMIN_EMAIL = 'byvera198@gmail.com';
const PUBLIC_APP_URL = 'https://royal-gold-club.onrender.com';
const storage = (() => {
  try {
    const candidate = window.localStorage;
    if (candidate && typeof candidate.getItem === 'function') return candidate;
  } catch {}
  const memory = new Map();
  return { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
})();
const storedUser = JSON.parse(storage.getItem('rgc-user') || 'null');
const isHostedProduction = !['localhost', '127.0.0.1'].includes(location.hostname);

const state = {
  user: isHostedProduction && !storedUser?.accessToken ? null : storedUser,
  view: 'lobby',
  authMode: 'login',
  modal: null,
  currentTable: JSON.parse(storage.getItem('rgc-current-table') || 'null'),
  selectedCard: null,
  voiceOn: false,
  audioStream: null,
  uno: null,
  blackjack: null,
  domino: null,
  poker: null,
  rummy: null,
  rummySelection: [],
  crazy: null,
  tablePanelOpen: false,
  tables: JSON.parse(storage.getItem('rgc-tables') || '[]'),
  history: JSON.parse(storage.getItem('rgc-history') || '[]'),
  realtime: { ws: null, connected: false, playerId: null, reconnectTimer: null, reconnectDelay: 1500 },
  chat: [],
  voice: { localStream: null, peers: new Map(), names: new Map(), mutedPlayers: new Set(), iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
  serverHealth: null,
  social: { profiles: [], friendships: [], invitations: [], loaded: false, loading: false, query: '' },
  pendingInviteUserId: null,
  pendingJoinCode: new URLSearchParams(location.search).get('table')?.trim().toUpperCase() || null
};

document.addEventListener('click', event => {
  const shareButton = event.target.closest('[data-action="share-code"]');
  if (!shareButton || !state.currentTable?.code) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const inviteUrl = `${PUBLIC_APP_URL}/?table=${encodeURIComponent(state.currentTable.code)}`;
  if (navigator.share) {
    navigator.share({ title: 'Royal Gold Club', text: `Únete a mi mesa ${state.currentTable.name}.`, url: inviteUrl }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(inviteUrl).then(() => toast('Enlace de la mesa copiado para compartir', 'success'));
  }
}, true);

const icons = {
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m3 7 4 3 5-7 5 7 4-3-2 13H5L3 7Z"/><path d="M5 17h14"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="6" y="3" width="12" height="17" rx="2" transform="rotate(9 6 3)"/><path d="M8 5 5 19a2 2 0 0 0 2 2h10"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="3"/><path d="M3 20c.4-3.4 2.3-5 6-5s5.6 1.6 6 5M16 5.5a3 3 0 0 1 0 5.8M17 15c2.5.4 3.8 2 4 5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-7"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 16l4-4-4-4M19 12H9"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
};

function save() {
  storage.setItem('rgc-user', JSON.stringify(state.user));
  storage.setItem('rgc-tables', JSON.stringify(state.tables));
  storage.setItem('rgc-history', JSON.stringify(state.history));
  if (state.currentTable) storage.setItem('rgc-current-table', JSON.stringify(state.currentTable)); else storage.removeItem('rgc-current-table');
}
async function supabaseAuth(path, { method = 'GET', body, token } = {}) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.msg || data.message || 'No se pudo completar la autenticación');
  return data;
}
async function supabaseRest(path, { method = 'GET', body } = {}) {
  if (!state.user?.accessToken) throw new Error('Inicia sesión para usar la comunidad');
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${state.user.accessToken}`, 'Content-Type': 'application/json' };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.hint || data.details || 'No se pudo actualizar la comunidad');
  return data;
}
function clearClientAccountState() {
  clearTimeout(state.realtime.reconnectTimer);
  state.realtime.reconnectTimer = null;
  state.realtime.ws?.close();
  state.realtime.ws = null;
  state.realtime.connected = false;
  state.realtime.playerId = null;
  state.user = null;
  state.view = 'lobby';
  state.modal = null;
  state.currentTable = null;
  state.tables = [];
  state.history = [];
  state.chat = [];
  state.uno = null;
  state.blackjack = null;
  state.domino = null;
  state.poker = null;
  state.rummy = null;
  state.rummySelection = [];
  state.crazy = null;
  state.pendingInviteUserId = null;
  state.pendingJoinCode = null;
  state.social = { profiles: [], friendships: [], invitations: [], loaded: false, loading: false, query: '' };
  storage.removeItem('rgc-user');
  storage.removeItem('rgc-tables');
  storage.removeItem('rgc-history');
  storage.removeItem('rgc-current-table');
}
async function deleteAccount() {
  const token = state.user?.accessToken;
  if (token) {
    const response = await fetch('/api/account', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'No se pudo eliminar la cuenta. Inténtalo de nuevo.');
  } else if (isHostedProduction) {
    throw new Error('Tu sesión expiró. Vuelve a iniciar sesión antes de eliminar la cuenta.');
  }
  clearClientAccountState();
  toast('Cuenta eliminada. Puedes comenzar desde cero.', 'success');
  render();
}
function normalizeAlias(value) {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
}
async function loadOwnProfile() {
  if (!state.user?.accessToken || state.user.profileLoading || state.user.profileLoaded) return;
  state.user.profileLoading = true;
  try {
    const rows = await supabaseRest(`profiles?${socialQuery({ select: 'id,handle,display_name', id: `eq.${state.user.id}`, limit: '1' })}`);
    const profile = rows?.[0];
    if (profile) {
      state.user.alias = profile.handle || state.user.alias || normalizeAlias(state.user.name) || 'member';
      state.user.name = profile.display_name || state.user.name;
    }
  } catch {
    // The account remains usable with the Auth metadata while the profile is unavailable.
  } finally {
    state.user.profileLoaded = true;
    state.user.profileLoading = false;
    save();
    if (state.realtime.connected) rtSend('hello', { name: state.user.name, alias: state.user.alias, email: state.user.email, userId: state.user.id || '', authToken: state.user.accessToken || '' });
    if (state.user) render();
  }
}
async function saveProfile(form) {
  const formData = new FormData(form);
  const displayName = String(formData.get('displayName') || '').trim();
  const alias = normalizeAlias(formData.get('alias'));
  if (displayName.length < 2 || displayName.length > 60) throw new Error('El nombre debe tener entre 2 y 60 caracteres');
  if (!/^[a-z0-9_]{3,24}$/.test(alias)) throw new Error('El alias debe tener entre 3 y 24 caracteres: letras, números o guion bajo');
  if (state.user?.accessToken && state.user?.id) {
    await supabaseRest(`profiles?id=eq.${encodeURIComponent(state.user.id)}`, { method: 'PATCH', body: { display_name: displayName, handle: alias } });
  }
  state.user.name = displayName;
  state.user.alias = alias;
  state.user.profileLoaded = true;
  state.modal = null;
  save();
  if (state.realtime.connected) rtSend('hello', { name: displayName, alias, email: state.user.email, userId: state.user.id || '', authToken: state.user.accessToken || '' });
  toast('Perfil actualizado', 'success');
  render();
}
function socialQuery(params) { return new URLSearchParams(params).toString(); }
async function loadSocial() {
  if (!state.user?.accessToken || state.social.loading) return;
  state.social.loading = true;
  try {
    const userId = state.user.id;
    const [profiles, friendships, invitations] = await Promise.all([
      supabaseRest(`profiles?${socialQuery({ select: 'id,handle,display_name,avatar_url,presence,updated_at', id: `neq.${userId}`, order: 'updated_at.desc', limit: '60' })}`),
      supabaseRest(`friendships?${socialQuery({ select: 'requester_id,addressee_id,status,updated_at', or: `(requester_id.eq.${userId},addressee_id.eq.${userId})`, order: 'updated_at.desc' })}`),
      supabaseRest(`invitations?${socialQuery({ select: 'id,table_id,inviter_id,invitee_id,status,created_at,expires_at', or: `(inviter_id.eq.${userId},invitee_id.eq.${userId})`, status: 'eq.pending', order: 'created_at.desc' })}`)
    ]);
    state.social.profiles = Array.isArray(profiles) ? profiles : [];
    state.social.friendships = Array.isArray(friendships) ? friendships : [];
    state.social.invitations = Array.isArray(invitations) ? invitations : [];
    state.social.loaded = true;
  } catch (error) {
    state.social.loaded = true;
    toast(error.message || 'No se pudo cargar tu comunidad', 'error');
  } finally {
    state.social.loading = false;
    if (['friends', 'waiting'].includes(state.view)) {
      render();
      clearTimeout(state.social.refreshTimer);
      state.social.refreshTimer = setTimeout(() => { state.social.loaded = false; void loadSocial(); }, 15000);
    }
  }
}
function socialRelationship(profileId) {
  const userId = state.user?.id;
  return state.social.friendships.find(item => (item.requester_id === userId && item.addressee_id === profileId) || (item.requester_id === profileId && item.addressee_id === userId));
}
function socialProfile(profileId) { return state.social.profiles.find(profile => profile.id === profileId); }
function waitingInvitePicker() {
  const query = String(state.social.tableQuery || '').trim().toLowerCase();
  const profiles = state.social.profiles.filter(profile => !query || `${profile.handle || ''} ${profile.display_name || ''}`.toLowerCase().includes(query)).slice(0, 5);
  const results = state.social.loading ? '<div class="table-invite-empty">Cargando jugadores del club…</div>' : profiles.length ? profiles.map(profile => `<div class="table-invite-result"><div class="avatar">${initials(profile.handle || profile.display_name)}</div><div class="row-main"><strong>${escapeHtml(profile.handle || profile.display_name || 'Miembro Royal')}</strong><span>${escapeHtml(profile.display_name || 'Miembro Royal')} · ${socialPresenceLabel(profile)}</span></div><button class="button ghost small" data-action="invite-player" data-user-id="${profile.id}">Invitar</button></div>`).join('') : `<div class="table-invite-empty">${query ? 'No encontramos ese jugador.' : 'Busca un alias o nombre para invitarlo.'}</div>`;
  return `<div class="table-invite-picker"><div class="table-invite-heading"><div><strong>Invitar jugadores</strong><span>Busca por alias o nombre</span></div><button class="text-button" data-action="refresh-social">Actualizar</button></div><input id="table-invite-search" value="${escapeHtml(state.social.tableQuery || '')}" placeholder="Ej. byvera980" autocomplete="off" /> <div class="table-invite-results">${results}</div></div>`;
}
async function followPlayer(profileId) {
  try {
    await supabaseRest('friendships', { method: 'POST', body: { requester_id: state.user.id, addressee_id: profileId, status: 'pending' } });
    toast('Solicitud de seguimiento enviada', 'success');
    state.social.loaded = false;
    await loadSocial();
  } catch (error) { toast(error.message || 'No se pudo seguir al jugador', 'error'); }
}
async function answerFollow(profileId, status) {
  const relationship = socialRelationship(profileId);
  if (!relationship) return;
  try {
    await supabaseRest(`friendships?requester_id=eq.${encodeURIComponent(relationship.requester_id)}&addressee_id=eq.${encodeURIComponent(relationship.addressee_id)}`, { method: 'PATCH', body: { status } });
    toast(status === 'accepted' ? 'Ahora forman parte del mismo círculo' : 'Solicitud rechazada', status === 'accepted' ? 'success' : '');
    state.social.loaded = false;
    await loadSocial();
  } catch (error) { toast(error.message || 'No se pudo responder la solicitud', 'error'); }
}
async function removeFriend(profileId) {
  const relationship = socialRelationship(profileId);
  if (!relationship || relationship.status !== 'accepted') return;
  if (!window.confirm('¿Eliminar a este jugador de tu círculo?')) return;
  try {
    await supabaseRest(`friendships?requester_id=eq.${encodeURIComponent(relationship.requester_id)}&addressee_id=eq.${encodeURIComponent(relationship.addressee_id)}`, { method: 'DELETE' });
    toast('Jugador eliminado de tu círculo', 'success');
    state.social.loaded = false;
    await loadSocial();
  } catch (error) { toast(error.message || 'No se pudo eliminar al jugador', 'error'); }
}
async function sendGameInvite(profileId) {
  const activeTable = state.currentTable && isOwnTable(state.currentTable) && ['waiting', 'playing'].includes(state.currentTable.status) ? state.currentTable : null;
  if (activeTable) return createGameInvite(profileId, activeTable);
  state.pendingInviteUserId = profileId;
  state.view = 'lobby';
  state.modal = 'create';
  render();
  toast('Crea una mesa para enviar la invitación');
}
async function createGameInvite(profileId, table) {
  try {
    await supabaseRest('invitations', { method: 'POST', body: { table_id: table.id, inviter_id: state.user.id, invitee_id: profileId } });
    toast(`Solicitud enviada a ${socialProfile(profileId)?.display_name || 'tu jugador'}`, 'success');
    state.social.loaded = false;
    await loadSocial();
  } catch (error) { toast(error.message || 'No se pudo enviar la solicitud de partida', 'error'); }
}
async function answerGameInvite(invitation, status) {
  try {
    await supabaseRest(`invitations?id=eq.${encodeURIComponent(invitation.id)}&invitee_id=eq.${encodeURIComponent(state.user.id)}`, { method: 'PATCH', body: { status } });
    if (status === 'declined') {
      toast('Solicitud de partida rechazada');
    } else {
      const tables = await supabaseRest(`game_tables?${socialQuery({ select: 'id,code,name,game_id,status,is_private,max_players,voice_enabled,stake,created_at,expires_at,host_id', id: `eq.${invitation.table_id}` })}`);
      const table = tables?.[0];
      if (!table?.code) throw new Error('La mesa ya no está disponible');
      state.modal = null;
      state.view = 'waiting';
      render();
      if (!rtSend('join_table', { code: table.code })) throw new Error('Conecta el servidor para entrar a la mesa');
      toast('Entrando a la mesa…', 'success');
    }
    state.social.loaded = false;
    await loadSocial();
  } catch (error) { toast(error.message || 'No se pudo responder la solicitud de partida', 'error'); }
}
function applySession(session, fallbackName = 'Miembro Royal') {
  const remoteUser = session?.user;
  if (!remoteUser || !session.access_token) throw new Error('Supabase no devolvió una sesión válida');
  state.user = {
    id: remoteUser.id,
    name: remoteUser.user_metadata?.display_name || fallbackName,
    alias: normalizeAlias(remoteUser.user_metadata?.handle || remoteUser.user_metadata?.user_name || remoteUser.email?.split('@')[0] || fallbackName) || 'member',
    email: remoteUser.email || '',
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    role: String(remoteUser.email || '').toLowerCase() === ADMIN_EMAIL ? 'admin' : 'player',
    isAdmin: String(remoteUser.email || '').toLowerCase() === ADMIN_EMAIL,
    chips: 1250,
    games: 0,
    wins: 0
  };
  state.view = 'lobby'; state.modal = null; state.currentTable = null; state.social = { profiles: [], friendships: [], invitations: [], loaded: false, loading: false, query: '' }; state.pendingInviteUserId = null; save();
}
function startGoogleAuth() {
  const redirectTo = `${PUBLIC_APP_URL}${location.pathname}${location.search}`;
  const authorizeUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  authorizeUrl.searchParams.set('provider', 'google');
  authorizeUrl.searchParams.set('redirect_to', redirectTo);
  authorizeUrl.searchParams.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  location.assign(authorizeUrl.toString());
}
async function restoreOAuthSession() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  if (!accessToken) return;
  try {
    const remoteUser = await supabaseAuth('user', { token: accessToken });
    applySession({ user: remoteUser, access_token: accessToken, refresh_token: params.get('refresh_token') || '' }, remoteUser.user_metadata?.display_name || remoteUser.email?.split('@')[0] || 'Miembro Royal');
    history.replaceState({}, document.title, `${location.pathname}${location.search}`);
    toast('Acceso con Google completado', 'success');
    render();
  } catch (error) {
    history.replaceState({}, document.title, `${location.pathname}${location.search}`);
    toast(error.message || 'No se pudo completar el acceso con Google', 'error');
  }
}
async function restoreRemoteSession() {
  if (!state.user?.accessToken) return;
  try {
    await supabaseAuth('user', { token: state.user.accessToken });
  } catch {
    if (!state.user.refreshToken) { state.user = null; save(); render(); return; }
    try {
      const refreshed = await supabaseAuth('token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: state.user.refreshToken } });
      applySession(refreshed, state.user.name);
      render();
    } catch {
      state.user = null; save(); render();
    }
  }
}
async function submitAuth(form) {
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  if (state.authMode === 'signup') {
    const name = String(formData.get('name') || '').trim();
    const handle = normalizeAlias(formData.get('alias'));
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) throw new Error('El alias debe tener entre 3 y 24 caracteres: letras, números o guion bajo');
    const result = await supabaseAuth('signup', { method: 'POST', body: { email, password, data: { display_name: name, handle } } });
    if (!result.session) throw new Error('Cuenta creada. Revisa tu correo para confirmar el acceso.');
    applySession(result.session, name);
  } else {
    const result = await supabaseAuth('token?grant_type=password', { method: 'POST', body: { email, password } });
    applySession(result, email.split('@')[0] || 'Miembro Royal');
  }
  toast('Bienvenido al club', 'success'); render();
}
function recordResult(result) { if (!result?.id || state.history.some(item => item.id === result.id)) return; state.user.games = (state.user.games || 0) + 1; if (result.won) state.user.wins = (state.user.wins || 0) + 1; state.user.chips = (state.user.chips || 1250) + (result.delta || 0); state.history.unshift(result); state.history = state.history.slice(0, 100); save(); toast(result.won ? `Victoria en ${result.gameName} · +${result.delta} fichas` : `${result.gameName}: partida terminada`, result.won ? 'success' : ''); if (['lobby','history','stats','profile'].includes(state.view)) render(); }
function realtimeUrl() { return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/realtime`; }
function rtSend(type, payload = {}) { if (state.realtime.ws && state.realtime.connected) { state.realtime.ws.send(JSON.stringify({ type, ...payload })); return true; } return false; }
function handleRealtimeMessage(message) {
  if (message.type === 'connected') { state.realtime.playerId = message.playerId; if (Array.isArray(message.iceServers) && message.iceServers.length) state.voice.iceServers = message.iceServers; if (state.user && message.role) { state.user.role = message.role; state.user.isAdmin = message.isAdmin === true; save(); } return; }
  if (message.type === 'error') {
    const unavailable = String(message.message || '').toLowerCase().includes('no encontramos una mesa');
    if (unavailable && state.currentTable?.code) {
      const code = state.currentTable.code;
      clearTimeout(state.realtime.reconnectTimer);
      state.realtime.reconnectTimer = null;
      state.tables = state.tables.filter(table => table.code !== code);
      state.currentTable = null;
      state.uno = null;
      state.blackjack = null;
      state.domino = null;
      state.poker = null;
      state.rummy = null;
      state.crazy = null;
      state.view = 'lobby';
      save();
      render();
      toast('Esta mesa ya no está disponible y se retiró del listado', 'error');
      return;
    }
    toast(message.message, 'error');
    return;
  }
  if (message.type === 'table_deleted') {
    state.tables = state.tables.filter(table => table.code !== message.code);
    state.currentTable = null; state.uno = null; state.blackjack = null; state.domino = null; state.poker = null; state.rummy = null; state.crazy = null; state.view = 'lobby'; save(); render(); toast(message.message || 'La mesa fue eliminada', 'success'); return;
  }
  if (message.type === 'game_result') { recordResult(message.result); return; }
  if (message.type === 'chat_history') { state.chat = Array.isArray(message.messages) ? message.messages.slice(-100) : []; if (state.view === 'table') render(); return; }
  if (message.type === 'chat_message') { state.chat.push(message.message); state.chat = state.chat.slice(-50); if (state.view === 'table') render(); return; }
  if (message.type === 'voice_peers') { message.peers.forEach(peer => { state.voice.names.set(peer.id, peer.name); createVoicePeer(peer, true); }); return; }
  if (message.type === 'voice_peer_joined') { state.voice.names.set(message.peer.id, message.peer.name); createVoicePeer(message.peer, false); return; }
  if (message.type === 'voice_peer_left') { closeVoicePeer(message.peerId); return; }
  if (message.type === 'voice_signal') { handleVoiceSignal(message); return; }
  if (message.type === 'table_created' || message.type === 'joined_table' || message.type === 'room_state') {
    state.currentTable = message.table;
    const existing = state.tables.findIndex(table => table.code === message.table.code);
    if (existing >= 0) state.tables[existing] = message.table; else state.tables.unshift(message.table);
    const finishedGameInView = state.view === 'table' && finishedGameState();
    state.modal = null; state.view = message.table.status === 'playing' || finishedGameInView ? 'table' : 'waiting'; save(); render();
    if (message.type === 'table_created' && state.pendingInviteUserId) {
      const inviteeId = state.pendingInviteUserId;
      state.pendingInviteUserId = null;
      void createGameInvite(inviteeId, message.table);
    }
    return;
  }
  if (message.type === 'game_state') {
    if (message.game?.kind === 'blackjack') state.blackjack = message.game;
    else if (message.game?.kind === 'domino') state.domino = message.game;
    else if (message.game?.kind === 'poker') state.poker = message.game;
    else if (message.game?.kind === 'rummy') { state.rummy = message.game; state.rummySelection = []; }
    else if (message.game?.kind === 'crazy') state.crazy = message.game;
    else state.uno = message.game;
    state.view = 'table'; render(); return;
  }
}
function connectRealtime() {
  if (!state.user || state.realtime.ws || !window.WebSocket) return;
  if (!state.serverHealth) fetch('/health').then(response => response.ok ? response.json() : null).then(health => { if (health) { state.serverHealth = health; if (state.view === 'settings') render(); } }).catch(() => {});
  try {
    const ws = new WebSocket(realtimeUrl()); state.realtime.ws = ws;
    ws.addEventListener('open', () => { state.realtime.connected = true; state.realtime.reconnectDelay = 1500; rtSend('hello', { name: state.user.name, alias: state.user.alias, email: state.user.email, userId: state.user.id || state.user.userId || '', authToken: state.user.accessToken || '' }); const inviteCode = state.pendingJoinCode || new URLSearchParams(location.search).get('table')?.trim().toUpperCase(); if (inviteCode) { state.pendingJoinCode = null; history.replaceState({}, document.title, location.pathname); setTimeout(() => { if (state.realtime.connected) rtSend('join_table', { code: inviteCode }); }, 120); } else if (state.currentTable?.code) setTimeout(() => { if (state.realtime.connected) rtSend('join_table', { code: state.currentTable.code }); }, 80); });
    ws.addEventListener('message', event => { try { handleRealtimeMessage(JSON.parse(event.data)); } catch { toast('Respuesta realtime inválida', 'error'); } });
    ws.addEventListener('close', () => { state.realtime.connected = false; state.realtime.ws = null; if (state.user && state.currentTable && !state.realtime.reconnectTimer) { const delay = state.realtime.reconnectDelay; state.realtime.reconnectDelay = Math.min(delay * 1.7, 12000); state.realtime.reconnectTimer = setTimeout(() => { state.realtime.reconnectTimer = null; connectRealtime(); }, delay); } });
    ws.addEventListener('error', () => { state.realtime.connected = false; });
  } catch { state.realtime.ws = null; }
}
function voiceRtcConfig() { return { iceServers: state.voice.iceServers?.length ? state.voice.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }] }; }
function closeVoicePeer(peerId) { const entry = state.voice.peers.get(peerId); if (!entry) return; entry.pc.close(); entry.audio?.remove(); state.voice.peers.delete(peerId); state.voice.names.delete(peerId); }
function addRemoteAudio(peerId, stream) { let audio = document.querySelector(`audio[data-voice-peer="${peerId}"]`); if (!audio) { audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true; audio.dataset.voicePeer = peerId; audio.style.display = 'none'; document.body.appendChild(audio); } audio.muted = state.voice.mutedPlayers.has(peerId); audio.srcObject = stream; audio.play?.().catch(() => {}); const entry = state.voice.peers.get(peerId); if (entry) entry.audio = audio; }
function setPeerMuted(peerId, muted) { if (muted) state.voice.mutedPlayers.add(peerId); else state.voice.mutedPlayers.delete(peerId); const entry = state.voice.peers.get(peerId); const audio = entry?.audio || document.querySelector(`audio[data-voice-peer="${peerId}"]`); if (audio) audio.muted = muted; }
async function createVoicePeer(peer, initiator) {
  if (!state.voiceOn || !peer?.id || peer.id === state.realtime.playerId || state.voice.peers.has(peer.id)) return;
  const pc = new RTCPeerConnection(voiceRtcConfig()); const entry = { pc, pendingCandidates: [], audio: null }; state.voice.peers.set(peer.id, entry);
  if (state.voice.localStream) state.voice.localStream.getTracks().forEach(track => pc.addTrack(track, state.voice.localStream));
  pc.onicecandidate = event => { if (event.candidate) rtSend('voice_signal', { to: peer.id, signal: { type: 'candidate', candidate: event.candidate } }); };
  pc.ontrack = event => addRemoteAudio(peer.id, event.streams[0]);
  pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closeVoicePeer(peer.id); };
  if (initiator) { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); rtSend('voice_signal', { to: peer.id, signal: { type: 'offer', sdp: offer.sdp } }); }
}
async function handleVoiceSignal(message) {
  const peer = { id: message.from, name: state.voice.names.get(message.from) || 'Jugador' }; if (!state.voice.peers.has(peer.id)) await createVoicePeer(peer, false);
  const entry = state.voice.peers.get(peer.id); if (!entry) return; const signal = message.signal;
  try {
    if (signal.type === 'offer') { await entry.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp }); for (const candidate of entry.pendingCandidates.splice(0)) await entry.pc.addIceCandidate(candidate); const answer = await entry.pc.createAnswer(); await entry.pc.setLocalDescription(answer); rtSend('voice_signal', { to: peer.id, signal: { type: 'answer', sdp: answer.sdp } }); }
    else if (signal.type === 'answer') { await entry.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp }); for (const candidate of entry.pendingCandidates.splice(0)) await entry.pc.addIceCandidate(candidate); }
    else if (signal.type === 'candidate') { if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(signal.candidate); else entry.pendingCandidates.push(signal.candidate); }
  } catch { toast('No se pudo conectar el audio de un participante', 'error'); }
}
function initials(name = 'RG') { return name.split(' ').map(x => x[0]).join('').slice(0,2).toUpperCase(); }
function toast(message, kind = '') { const el = document.createElement('div'); el.className = `toast ${kind}`; el.textContent = message; toastRegion.appendChild(el); setTimeout(() => el.remove(), 3200); }
function escapeHtml(text='') { return text.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function formatDate(iso) { return new Intl.DateTimeFormat('es-EC', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(iso)); }
function navItem(id, icon, label) { return `<button class="${state.view === id ? 'active' : ''}" data-nav="${id}">${icon}<span>${label}</span></button>`; }
function isOwnTable(table) { return Boolean(table && ((table.hostId && state.user?.id && table.hostId === state.user.id) || (!table.hostId && table.host === state.user?.email))); }

function authView() {
  if (state.authMode === 'login') {
    return `<div class="auth-reference-shell">
      <div class="auth-reference-backdrop" role="img" aria-label="Royal Gold Club, club privado de juegos de cartas"></div>
      <section class="auth-reference-controls" aria-label="Acceso de miembros">
        <form class="auth-reference-form" id="auth-form">
          <div class="reference-tabs" role="tablist" aria-label="Tipo de acceso">
            <button type="button" class="reference-hit reference-login-hit" data-auth="login" aria-label="Iniciar sesión" aria-selected="true">Iniciar sesión</button>
            <button type="button" class="reference-hit reference-signup-hit" data-auth="signup" aria-label="Registrarse" aria-selected="false">Registrarse</button>
          </div>
          <label class="reference-mobile-label" for="reference-email">Correo electrónico</label>
          <input class="reference-input reference-email" id="reference-email" name="email" type="email" required placeholder="tu@email.com" autocomplete="email" />
          <label class="reference-mobile-label" for="reference-password">Contraseña</label>
          <input class="reference-input reference-password" id="reference-password" name="password" type="password" required minlength="6" placeholder="Mínimo 6 caracteres" autocomplete="current-password" />
          <button type="button" class="reference-hit reference-forgot" id="forgot" aria-label="¿Olvidaste tu contraseña?">¿Olvidaste tu contraseña?</button>
          <button class="reference-hit reference-submit" type="submit" aria-label="Entrar al club">Entrar al club</button>
          <button class="reference-hit reference-google" type="button" id="google-login" aria-label="Continuar con Google">Continuar con Google</button>
        </form>
      </section>
    </div>`;
  }

  return `<div class="auth-reference-shell">
    <div class="auth-reference-backdrop" role="img" aria-label="Royal Gold Club, club privado de juegos de cartas"></div>
    <section class="auth-reference-controls" aria-label="Registro de miembros">
      <form class="auth-reference-form auth-reference-signup-form" id="auth-form">
        <div class="reference-tabs" role="tablist" aria-label="Tipo de acceso">
          <button type="button" class="reference-hit reference-login-hit" data-auth="login" aria-label="Iniciar sesión" aria-selected="false">Iniciar sesión</button>
          <button type="button" class="reference-hit reference-signup-hit active" data-auth="signup" aria-label="Registrarse" aria-selected="true">Registrarse</button>
        </div>
        <label class="reference-desktop-label" for="reference-name">Nombre de jugador</label>
        <label class="reference-mobile-label" for="reference-name">Nombre de jugador</label>
        <input class="reference-input reference-name" id="reference-name" name="name" required placeholder="Ej. Valentina Vega" autocomplete="name" />
        <label class="reference-mobile-label" for="reference-alias">Alias / nombre de usuario</label>
        <input class="reference-input reference-alias" id="reference-alias" name="alias" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" placeholder="Ej. valentina_vega" autocomplete="username" />
        <small class="reference-helper">Se mostrará en tus mesas, invitaciones y comunidad.</small>
        <label class="reference-mobile-label" for="reference-email">Correo electrónico</label>
        <input class="reference-input reference-email reference-signup-email" id="reference-email" name="email" type="email" required placeholder="tu@email.com" autocomplete="email" />
        <label class="reference-mobile-label" for="reference-password">Contraseña</label>
        <input class="reference-input reference-password reference-signup-password" id="reference-password" name="password" type="password" required minlength="6" placeholder="Mínimo 6 caracteres" autocomplete="new-password" />
        <label class="reference-terms"><input type="checkbox" required /> <span>Acepto las reglas del club y el modo de fichas virtuales.</span></label>
        <button class="reference-hit reference-submit" type="submit" aria-label="Crear membresía">Crear membresía ${icons.arrow}</button>
        <button class="reference-hit reference-google" type="button" id="google-login" aria-label="Continuar con Google">Continuar con Google</button>
        ${isHostedProduction ? '' : '<button class="button ghost" type="button" id="demo-login" style="margin-top:10px">Explorar demo local</button>'}
        <div class="auth-foot">Las fichas son virtuales y no tienen valor monetario.<br>${isHostedProduction ? 'Tu acceso se protege con Supabase Auth.' : 'La demo local guarda tus datos únicamente en este navegador.'}</div>
      </form>
    </section>
  </div>`;
}

function shell(content) {
  const memberLabel = state.user?.isAdmin ? 'Desarrollador · Administrador' : 'Miembro del club';
  return `<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">${icons.crown}</span><span class="brand-copy"><span class="brand-name">ROYAL GOLD</span><span class="brand-sub">CLUB PRIVADO</span></span></div><div><div class="nav-label">Club</div><nav class="nav">${navItem('lobby',icons.grid,'Lobby')}${navItem('games',icons.cards,'Juegos')}${navItem('friends',icons.users,'Amigos')}${navItem('history',icons.clock,'Historial')}</nav></div><div><div class="nav-label">Tu cuenta</div><nav class="nav">${navItem('stats',icons.chart,'Estadísticas')}${navItem('settings',icons.settings,'Ajustes')}</nav></div><div class="sidebar-spacer"></div><div class="user-chip"><div class="avatar">${initials(state.user?.alias || state.user?.name)}</div><div class="user-info"><strong>${escapeHtml(state.user?.alias || state.user?.name || 'Invitado')}</strong><span>${memberLabel}</span></div></div></aside><main class="main"><div class="topbar"><div class="breadcrumb">Royal Gold Club <span style="margin:0 6px;color:#48463f">/</span> <strong>${viewLabel()}</strong></div><div class="top-actions"><button class="icon-button" data-action="notifications" aria-label="Notificaciones">${icons.bell}<span class="notification-dot"></span></button><div class="wallet-pill"><span class="coin">R</span><strong>${(state.user?.chips ?? 1250).toLocaleString('es-EC')}</strong><span style="color:#726b58">fichas</span></div><button class="avatar" data-nav="profile" aria-label="Abrir perfil">${initials(state.user?.alias || state.user?.name)}</button></div></div>${content}</main></div>${state.modal ? modal(state.modal) : ''}`;
}
function viewLabel() { return ({lobby:'Lobby', games:'Juegos', friends:'Amigos', history:'Historial', stats:'Estadísticas', settings:'Ajustes', profile:'Perfil', table:'Mesa de juego', waiting:'Sala de espera'}[state.view] || 'Lobby'); }
function displayCardLabel(label) { return ({ draw2: '+2', wild: 'WILD', wild4: '+4', skip: 'SALTA', reverse: '↺' }[label] || label); }
function finishedGameState() { return [state.uno, state.blackjack, state.domino, state.poker, state.rummy, state.crazy].find(game => game?.finished) || null; }
function finishedGameWinnerNames(game) {
  if (game.kind === 'poker') return game.players.filter(player => game.winnerIds?.includes(player.id)).map(player => player.name);
  if (game.kind === 'blackjack') { const winners = game.players.filter(player => ['win', 'blackjack'].includes(player.result)).map(player => player.name); return winners.length ? winners : ['Dealer']; }
  const winner = game.players?.find(player => player.id === game.winnerId);
  return winner?.name ? [winner.name] : [];
}
function resultOverlay(game) {
  if (!game?.finished) return '';
  const winners = finishedGameWinnerNames(game);
  const winnerText = winners.length ? winners.join(' y ') : 'La mesa';
  return `<div class="result-overlay" role="dialog" aria-modal="true" aria-label="Resultado de la partida"><div class="result-card"><div class="eyebrow">Partida terminada</div><div class="result-crown">♛</div><div class="result-coins" aria-hidden="true"><span>🪙</span><span>🪙</span><span>🪙</span><span>🪙</span><span>🪙</span></div><h2>¡Felicidades!</h2><p><strong>${escapeHtml(winnerText)}</strong> ha ganado la partida.</p><div class="result-summary"><span>Resultado</span><strong>${winners.length > 1 ? 'Empate' : 'Victoria'}</strong></div><div class="modal-actions"><button class="button dark" data-action="new-game">Nueva partida</button><button class="button primary" data-action="rematch">Revancha ${icons.arrow}</button></div></div></div>`;
}
function clearGameState() { state.uno = null; state.blackjack = null; state.domino = null; state.poker = null; state.rummy = null; state.rummySelection = []; state.crazy = null; }
function attachResultOverlay() {
  if (state.view !== 'table' || document.querySelector('.result-overlay')) return;
  const game = finishedGameState();
  if (!game) return;
  const host = document.querySelector('.game-table-wrap');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', resultOverlay(game));
  const overlay = host.querySelector('.result-overlay');
  overlay.querySelector('[data-action="new-game"]').addEventListener('click', () => {
    if (state.voiceOn) toggleVoice();
    rtSend('leave_table');
    clearGameState();
    state.currentTable = null;
    state.view = 'lobby';
    save();
    render();
  });
  overlay.querySelector('[data-action="rematch"]').addEventListener('click', () => {
    if (rtSend('start_game')) { toast('Preparando la revancha…'); return; }
    clearGameState();
    render();
  });
}

const gameCatalog = [
  {id:'uno', name:'UNO', players:'2–10 jugadores', time:'10–20 min', art:'uno', suit:'●', desc:'Colores, comodines y ese último grito de UNO.'},
  {id:'poker', name:'Texas Hold’em', players:'2–9 jugadores', time:'30–60 min', art:'poker', suit:'♠', desc:'La mesa clásica, con ciegas y apuestas virtuales.'},
  {id:'blackjack', name:'21 · Blackjack', players:'1–7 jugadores', time:'5–15 min', art:'blackjack', suit:'21', desc:'Lee la mesa. Acércate a 21. No te pases.'},
  {id:'domino', name:'Dominó', players:'2–4 jugadores', time:'20–40 min', art:'domino', suit:'◈', desc:'La ficha correcta puede cambiar toda la partida.'},
  {id:'rummy', name:'Rummy', players:'2–4 jugadores', time:'20–40 min', art:'rummy', suit:'◆', desc:'Roba, combina y descarta con precisión.'},
  {id:'crazy', name:'Crazy Eights', players:'2–6 jugadores', time:'10–25 min', art:'crazy', suit:'8', desc:'El ocho cambia el palo. La última carta decide.'}
];

function lobbyView() {
  const ownTable = state.tables.find(t => isOwnTable(t) && t.status !== 'finished');
  return `<div class="view"><div class="lobby-header"><div><div class="eyebrow">Buenas noches, ${escapeHtml((state.user?.name || 'miembro').split(' ')[0])}</div><h1 class="page-title">Tu mesa te espera.</h1></div><div class="lobby-actions"><button class="button ghost" data-modal="join">${icons.link} Unirse con código</button><button class="button primary" data-modal="create">${icons.plus} Crear mesa</button></div></div><div class="dashboard-grid"><section class="hero-card"><div class="hero-content"><div class="eyebrow">Club pick · esta noche</div><h2>Las mejores partidas se juegan en buena compañía.</h2><p>Invita a tu círculo, elige una mesa y deja que la noche avance carta a carta.</p><button class="button primary" data-modal="create">Jugar ahora ${icons.arrow}</button></div><div class="hero-ornament"><span class="suit a">♠</span><span class="suit b">♦</span></div></section><section class="stat-card"><div class="stat-card-header"><h3>Tu temporada</h3><span style="color:var(--gold)">${icons.chart}</span></div><div class="stat-value">${state.user?.games || 0}</div><div class="stat-note">partidas registradas</div><div class="tiny-line"></div><div style="display:flex;justify-content:space-between;margin-top:14px;font-size:11px"><span class="muted">Fichas en cartera</span><strong style="color:var(--gold-light)">${(state.user?.chips ?? 1250).toLocaleString('es-EC')}</strong></div></section></div>${ownTable ? `<section class="section"><div class="section-head"><h2>Continuar partida</h2><button class="text-button" data-action="resume">Ver mesa ${icons.arrow}</button></div><div class="table-row"><div><span class="tag">● En espera</span><strong style="display:block;margin-top:8px">${escapeHtml(ownTable.name)}</strong><small>${ownTable.gameName} · código ${ownTable.code}</small></div><div><small>Participantes</small><strong>${ownTable.players.length}/${ownTable.maxPlayers}</strong></div><div><small>Creada</small><strong>${formatDate(ownTable.createdAt)}</strong></div><button class="button primary small" data-action="resume">Entrar</button></div></section>` : ''}<section class="section"><div class="section-head"><h2>Elige tu juego</h2><button class="text-button" data-nav="games">Ver catálogo ${icons.arrow}</button></div><div class="games-grid">${gameCatalog.map(gameCard).join('')}</div></section><section class="section"><div class="section-head"><h2>Mesas del club</h2><span class="muted" style="font-size:11px">Solo mesas creadas en este navegador</span></div>${state.tables.length ? `<div class="table-list">${state.tables.slice(0,3).map(tableRow).join('')}</div>` : '<div class="empty-state">Aún no hay mesas abiertas. Crea la primera mesa privada de tu círculo.</div>'}</section></div>`;
}
function gameCard(game) { return `<article class="game-card"><div class="game-art ${game.art}"><span class="big-suit">${game.suit}</span>${game.id==='uno'?'<span class="mini-card">7</span><span class="mini-card two">+2</span>':''}</div><div class="game-name">${game.name}</div><div class="game-meta"><span>${game.players}</span><span>${game.time}</span></div><button class="button ghost small game-cta" data-action="play-game" data-game="${game.id}">Jugar ${icons.arrow}</button></article>`; }
function tableRow(table) { const canDelete = isOwnTable(table) || state.user?.isAdmin; const players = table.players || []; const statusLabel = table.status === 'waiting' ? 'En espera' : table.status === 'finished' ? 'Finalizada' : 'En juego'; const names = players.map(player => player.name || player.alias || player.email?.split('@')[0]).filter(Boolean); const playerNames = names.length ? names.join(' · ') : 'Sin jugadores visibles'; return `<div class="table-row"><div><span class="tag">${table.private ? '● Privada' : '○ Pública'}</span><strong style="display:block;margin-top:8px">${escapeHtml(table.name)}</strong><small>${table.gameName} · ${table.code}</small></div><div class="table-players"><small>Jugadores · ${players.length}/${table.maxPlayers}</small><span class="table-player-names" title="${escapeHtml(playerNames)}">${escapeHtml(playerNames)}</span></div><div><small>Estado</small><strong>${statusLabel}</strong></div><div class="table-row-actions"><button class="button dark small" data-action="join-table" data-code="${table.code}">Entrar</button>${canDelete ? `<button class="button danger small" data-action="delete-table" data-code="${table.code}">Eliminar</button>` : ''}</div></div>`; }
function gamesView() { return `<div class="view"><div class="eyebrow">Catálogo del club</div><h1 class="page-title">Una mesa para cada ánimo.</h1><p class="muted" style="margin:12px 0 0;max-width:530px;line-height:1.6;font-size:13px">Cada juego tiene su propio ritmo, reglas y manera de reunir a la gente. Ya puedes abrir mesas de UNO, Blackjack, Dominó, Texas Hold’em, Rummy y Crazy Eights.</p><section class="section"><div class="games-grid">${gameCatalog.map(gameCard).join('')}</div></section><div class="notice" style="margin-top:25px">${icons.info}<span>La siguiente expansión del club será Mica configurable y más mesas con motores de reglas independientes.</span></div></div>`; }
function socialPresenceLabel(profile) { return profile.presence === 'playing' ? 'Jugando ahora' : profile.presence === 'online' ? 'En línea' : 'Desconectado'; }
function friendsView() {
  const query = state.social.query.trim().toLowerCase();
  const profiles = state.social.profiles.filter(profile => !query || `${profile.display_name} ${profile.handle}`.toLowerCase().includes(query));
  const relationships = state.social.friendships;
  const incoming = state.social.invitations.filter(item => item.invitee_id === state.user?.id);
  const profileName = id => escapeHtml(socialProfile(id)?.display_name || 'Miembro Royal');
  const profileRows = state.social.loading ? '<div class="empty-state">Cargando jugadores del club…</div>' : profiles.length ? profiles.map(profile => {
    const relationship = socialRelationship(profile.id);
    const incomingFollow = relationship?.requester_id === profile.id && relationship?.addressee_id === state.user?.id && relationship?.status === 'pending';
    const followLabel = relationship?.status === 'accepted' ? 'Siguiendo' : incomingFollow ? 'Aceptar' : relationship?.status === 'pending' ? 'Pendiente' : 'Seguir';
    const followAction = incomingFollow ? 'accept-follow' : relationship?.status === 'accepted' || relationship?.status === 'pending' ? '' : 'follow-player';
    const removeAction = relationship?.status === 'accepted' ? `<button class="button danger small" data-action="remove-friend" data-user-id="${profile.id}">Eliminar</button>` : '';
    const status = socialPresenceLabel(profile);
    return `<div class="friend-row"><div class="avatar">${initials(profile.handle || profile.display_name)}</div><div class="row-main"><strong>${escapeHtml(profile.handle || profile.display_name)}</strong><span>${escapeHtml(profile.display_name || 'Miembro Royal')} · @${escapeHtml(profile.handle || 'member')} · ${status}${profile.presence === 'playing' ? ` · ${escapeHtml(profile.current_game || 'partida')}` : ''}</span></div><span class="${profile.presence === 'offline' ? 'offline-dot' : 'online-dot'}"></span><button class="button ghost small" ${followAction ? `data-action="${followAction}" data-user-id="${profile.id}"` : 'disabled'}>${followLabel}</button><button class="button dark small" data-action="invite-player" data-user-id="${profile.id}">Invitar a jugar</button>${removeAction}</div>`;
  }).join('') : '<div class="empty-state">Todavía no hay otros jugadores para mostrar.</div>';
  const inviteRows = incoming.length ? incoming.map(invitation => `<div class="friend-row"><div class="avatar">${initials(socialProfile(invitation.inviter_id)?.display_name || 'RG')}</div><div class="row-main"><strong>${profileName(invitation.inviter_id)}</strong><span>Te invita a una mesa de juego · ${formatDate(invitation.created_at)}</span></div><button class="button primary small" data-action="accept-game-invite" data-invitation-id="${invitation.id}">Aceptar</button><button class="button dark small" data-action="decline-game-invite" data-invitation-id="${invitation.id}">Rechazar</button></div>`).join('') : '<div class="empty-state">No tienes invitaciones pendientes.<br><span style="font-size:10px">Cuando alguien te invite, aparecerá aquí.</span></div>';
  return `<div class="view"><div class="eyebrow">Tu círculo</div><h1 class="page-title">Amigos</h1><p class="muted" style="margin-top:10px;max-width:630px;line-height:1.6">Encuentra jugadores, sigue a tu círculo y envía solicitudes de partida cuando estén disponibles.</p><div class="subpage-grid"><section class="panel"><div class="section-head"><h3>Jugadores del club</h3><button class="button ghost small" data-action="refresh-social">Actualizar</button></div><div class="field" style="margin-bottom:12px"><input id="social-search" value="${escapeHtml(state.social.query)}" placeholder="Buscar por nombre o @usuario" autocomplete="off" /></div>${profileRows}</section><section class="panel"><h3>Solicitudes de partida</h3>${inviteRows}<div class="chat-divider" style="margin-top:18px">Tu círculo</div>${relationships.filter(item => item.status === 'accepted').length ? `<p class="muted" style="font-size:11px;line-height:1.6">Tienes ${relationships.filter(item => item.status === 'accepted').length} conexión${relationships.filter(item => item.status === 'accepted').length === 1 ? '' : 'es'} aceptada${relationships.filter(item => item.status === 'accepted').length === 1 ? '' : 's'}.</p>` : '<p class="muted" style="font-size:11px;line-height:1.6">Sigue a otros jugadores para construir tu comunidad.</p>'}</section></div></div>`;
}
function historyView() { return `<div class="view"><div class="eyebrow">Tu recorrido</div><h1 class="page-title">Historial de partidas</h1><div class="panel" style="margin-top:28px">${state.history.length ? state.history.map(h=>`<div class="history-row"><div class="game-art ${h.gameId}" style="width:43px;height:43px;margin:0;border-radius:9px;flex:none"><span class="big-suit" style="font-size:30px">${h.gameId==='uno'?'●':'♠'}</span></div><div class="row-main"><strong>${h.gameName}</strong><span>${formatDate(h.date)} · ${h.result}</span></div><strong style="color:${h.delta>=0?'#8fd1bb':'#d7867d'}">${h.delta>=0?'+':''}${h.delta} fichas</strong></div>`).join('') : '<div class="empty-state">Tu historial aparecerá después de terminar tu primera partida.</div>'}</div></div>`; }
function statsView() { return `<div class="view"><div class="eyebrow">Rendimiento</div><h1 class="page-title">Estadísticas</h1><div class="metric-row" style="margin-top:28px"><div class="metric"><strong>${state.user?.games || 0}</strong><span>Partidas</span></div><div class="metric"><strong>${state.user?.wins || 0}</strong><span>Victorias</span></div><div class="metric"><strong>${state.user?.chips || 1250}</strong><span>Fichas</span></div></div><div class="subpage-grid"><section class="panel"><h3>Tu temporada</h3><div class="empty-state">Aún no hay suficientes partidas para mostrar tendencias.<br><span style="font-size:10px">Juega una ronda de UNO para comenzar a construir tu historial.</span></div></section><section class="panel"><h3>Clasificación</h3><div class="notice">${icons.info}<span>La clasificación del club se activa cuando conectes una base de datos compartida.</span></div></section></div></div>`; }
function settingsView() { const storage = state.serverHealth?.storage === 'file-development' ? 'Persistencia local de desarrollo activa.' : 'Persistencia del servidor no detectada.'; return `<div class="view"><div class="eyebrow">Preferencias</div><h1 class="page-title">Ajustes</h1><div class="subpage-grid"><section class="panel"><h3>Experiencia de juego</h3><label class="check-row"><input type="checkbox" checked /> Sonidos de cartas y fichas</label><label class="check-row"><input type="checkbox" checked /> Animaciones de mesa</label><label class="check-row"><input type="checkbox" /> Reducir movimiento</label><label class="check-row"><input type="checkbox" checked /> Mostrar estado en línea</label></section><section class="panel"><h3>Estado de integraciones</h3><div class="notice">${icons.info}<span>${state.realtime.connected?'Servidor realtime conectado y listo para mesas compartidas.':'Modo local activo. Para partidas entre dispositivos, inicia el servidor con npm run dev.'} ${storage} Para Supabase, autenticación y voz de producción, sigue <b>README.md</b>.</span></div><div class="account-actions"><button class="button dark small" data-action="logout">${icons.logout} Cerrar sesión</button><button class="button danger small" data-action="delete-account">Eliminar cuenta</button></div></section></div></div>`; }
function profileView() { const roleLabel = state.user?.isAdmin ? 'Desarrollador · Administrador' : 'Royal member'; const alias = state.user?.alias || normalizeAlias(state.user?.name) || 'member'; return `<div class="view"><div class="eyebrow">Tu identidad en el club</div><h1 class="page-title">Perfil</h1><div class="subpage-grid"><section class="panel"><div class="profile-top"><div class="avatar">${initials(alias)}</div><div><h2>${escapeHtml(alias)}</h2><p>Nombre: ${escapeHtml(state.user?.name || 'Miembro')} · ${escapeHtml(state.user?.email || '')}</p></div><button class="button dark small" data-action="edit-profile" style="margin-left:auto">Editar</button></div><div class="profile-alias-note">Tu alias es la identificación que verán los demás jugadores en las mesas y en tu comunidad.</div><div class="metric-row"><div class="metric"><strong>${state.user?.games||0}</strong><span>Partidas</span></div><div class="metric"><strong>${state.user?.wins||0}</strong><span>Victorias</span></div><div class="metric"><strong>${(state.user?.chips||1250).toLocaleString('es-EC')}</strong><span>Saldo</span></div></div></section><section class="panel"><h3>Membresía</h3><div class="eyebrow" style="margin-bottom:9px">${roleLabel}</div><p class="muted" style="font-size:12px;line-height:1.6">${state.user?.isAdmin ? 'Esta cuenta tiene permisos de desarrollador y administración dentro de Royal Gold Club.' : 'Tu cuenta está lista para jugar en el club. Tus fichas no tienen valor monetario.'}</p></section></div></div>`; }

function waitingView() { const t=state.currentTable; return `<div class="view waiting"><button class="text-button" data-nav="lobby">← Volver al lobby</button><div style="margin-top:25px"><div class="eyebrow">Mesa privada · sala de espera</div><h1 class="page-title">${escapeHtml(t.name)}</h1><p class="muted" style="font-size:12px;margin-top:10px">${t.gameName} · ${t.private?'Solo con código':'Mesa visible para el club'} · ${t.maxPlayers} asientos</p></div><div class="invite-code"><div><div class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.14em">Código de invitación</div><code>${t.code}</code></div><button class="button dark small" data-action="copy-code">${icons.copy} Copiar</button><button class="button ghost small" data-action="share-code">Compartir</button></div><div class="notice">${icons.info}<span>Comparte este código con tu círculo. En esta versión local, las mesas se guardan en este navegador y se pueden abrir en otra pestaña del mismo dispositivo.</span></div><section class="panel" style="margin-top:20px"><div class="section-head"><h2 style="font-size:20px">Participantes</h2><span class="muted" style="font-size:11px">${t.players.length}/${t.maxPlayers} asientos ocupados</span></div><div class="seats-grid">${Array.from({length:t.maxPlayers},(_,i)=>{const p=t.players[i];return p?`<div class="seat-box filled"><div class="avatar" style="margin-bottom:8px">${initials(p.name)}</div><strong>${escapeHtml(p.name)}</strong><span style="font-size:9px;color:#73bca5">${i===0?'Anfitrión':'Listo'}</span></div>`:`<div class="seat-box">Asiento disponible</div>`}).join('')}</div><div class="modal-actions"><button class="button dark" data-action="add-bot">Añadir rival de prueba</button><button class="button primary" data-action="start-uno" ${t.players.length<2?'disabled style="opacity:.45;cursor:not-allowed"':''}>Comenzar partida ${icons.arrow}</button></div></section></div>`; }

function tableSocialPanel() { const players = state.currentTable?.players || []; const chatHtml = state.chat.length ? state.chat.map(message => `<div class="chat-message"><strong>${escapeHtml(message.name)}</strong><span>${escapeHtml(message.body)}</span></div>`).join('') : '<span class="chat-empty">Aún no hay mensajes.</span>'; return `<aside class="side-panel table-social-panel ${state.tablePanelOpen ? 'open' : ''}" data-table-social-panel><div class="section-head"><h4>En la mesa</h4><button type="button" class="close" data-action="toggle-panel" aria-label="Cerrar panel">×</button></div><div class="voice-list">${players.length ? players.map(player => { const isMe = player.id === state.realtime.playerId; const muted = state.voice.mutedPlayers.has(player.id); return `<div class="voice-item"><div class="avatar" style="width:26px;height:26px;font-size:9px">${initials(player.name)}</div><span><strong>${escapeHtml(player.name)}${isMe ? ' (tú)' : ''}</strong><small class="mic-state">${isMe ? (state.voiceOn ? '● Micrófono activo' : '○ Micrófono apagado') : player.voiceActive ? '● En voz' : '○ Sin voz'}</small></span>${isMe ? '' : `<button type="button" class="button ghost small voice-mute-button" data-action="mute-player" data-player-id="${player.id}" aria-pressed="${muted ? 'true' : 'false'}">${muted ? 'Activar audio' : 'Silenciar'}</button>`}</div>`; }).join('') : '<span class="chat-empty">Esperando jugadores…</span>'}</div><div class="chat-divider">Chat de mesa</div><div class="chat-feed">${chatHtml}</div><form id="chat-form" class="chat-form"><input name="body" maxlength="240" placeholder="Escribe un mensaje…" autocomplete="off" /><button type="submit" class="button primary small" aria-label="Enviar mensaje">→</button></form><div style="margin-top:16px" class="notice">${icons.mic}<span>La voz funciona solo dentro de esta mesa. Puedes activar tu micrófono arriba y silenciar cada jugador de forma independiente.</span></div></aside>`; }
function attachTableChat() { const chatForm = document.querySelector('#chat-form'); if (!chatForm) return; chatForm.addEventListener('submit', e => { e.preventDefault(); const body = String(new FormData(chatForm).get('body') || '').trim(); if (!body) return; if (rtSend('chat_message', { body })) { chatForm.reset(); return; } state.chat.push({ id: crypto.randomUUID(), name: state.user.alias || state.user.name, body, createdAt: new Date().toISOString() }); state.chat = state.chat.slice(-100); chatForm.reset(); render(); }); }
function ensureTableSocialPanel() { if (state.view !== 'table' || !state.currentTable) return; const host = document.querySelector('.game-table-wrap'); if (!host) return; host.querySelector('.side-panel')?.remove(); host.insertAdjacentHTML('beforeend', tableSocialPanel()); attachTableChat(); }
function tableView() { if (!state.uno) initUno(); const u=state.uno; const myTurn = u.myTurn ?? u.turn === 0; return `<div class="view game-table-wrap"><div class="table-top"><div><button class="text-button" data-action="leave-table">← Salir de la mesa</button><span class="table-id" style="margin-left:15px">${escapeHtml(state.currentTable?.name || 'Mesa UNO')} · <b>${state.currentTable?.code || 'LOCAL'}</b></span></div><div><button class="button dark small" data-action="toggle-voice">${icons.mic} ${state.voiceOn?'Silenciar':'Voz'}</button><button class="button dark small" data-action="toggle-panel" style="margin-left:5px">${icons.users} Jugadores</button></div></div><div class="game-table"><div class="table-seat seat-1"><div class="seat-avatar ${myTurn?'turn-ring':''}">${initials(state.user?.name)}</div><strong>${escapeHtml(state.user?.name || 'Tú')}</strong><span class="seat-status">${myTurn?'Tu turno':'En mesa'}</span></div><div class="table-seat seat-2"><div class="seat-avatar ${u.turn===1?'turn-ring':''}">R1</div><strong>Rival de prueba</strong><span class="seat-status">${u.turn===1?'Jugando':'Listo'}</span></div><div class="table-seat seat-3"><div class="seat-avatar ${u.turn===2?'turn-ring':''}">R2</div><strong>Rival de prueba</strong><span class="seat-status">${u.turn===2?'Jugando':'Listo'}</span></div><div class="table-center"><div class="center-stack"><div class="turn-label">${myTurn?'Tu turno':`Turno de ${u.players[u.turn]?.name || 'rival'}`}</div><div class="uno-board"><div class="draw-pile" data-action="draw-card" title="Robar carta"></div><div class="discard ${u.discard.color}">${displayCardLabel(u.discard.label)}</div></div></div></div><div class="turn-timer"><span>Tiempo de turno</span><strong>${myTurn?'00:28':'00:18'}</strong></div><div class="player-hand">${u.hand.map((c,i)=>`<button class="uno-card ${c.color} ${state.selectedCard===i?'selected':''}" data-action="play-card" data-index="${i}" ${myTurn?'':'disabled'}>${displayCardLabel(c.label)}</button>`).join('')}</div></div><div class="table-controls"><button class="button ghost small" data-action="draw-card">Robar carta</button><button class="button dark small" data-action="say-uno">¡UNO!</button><button class="button dark small" data-action="toggle-panel">Chat y jugadores</button></div><p class="muted" style="text-align:center;font-size:10px;margin-top:12px">${state.realtime.connected?'Servidor realtime conectado · estado validado en el servidor.':'Modo local · usa el servidor para sincronizar varios dispositivos.'}</p></div>`; }

function maxOptionsForGame(gameId) { return ({ uno:[2,4,6,8,10], poker:[2,3,4,5,6,7,8,9], blackjack:[2,3,4,5,6,7], domino:[2,3,4], rummy:[2,3,4], crazy:[2,3,4,5,6] }[gameId] || [2,4]); }
function maxOptionsMarkup(gameId) { return maxOptionsForGame(gameId).map(value => `<option value="${value}">${value}</option>`).join(''); }
function modal(type) { if(type==='create') return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><div class="eyebrow">Nueva mesa</div><h2>Invita a tu círculo.</h2><p>Configura una partida privada en menos de un minuto.</p></div><button class="close" data-action="close-modal">×</button></div><form id="create-form"><div class="form-grid"><div class="field full"><label>Nombre de la mesa</label><input name="name" required placeholder="Ej. Viernes de cartas" /></div><div class="field"><label>Juego</label><select name="game">${gameCatalog.map(g=>`<option value="${g.id}">${g.name}</option>`).join('')}</select></div><div class="field"><label>Máximo de jugadores</label><select name="max">${maxOptionsMarkup('uno')}</select></div><div class="field"><label>Entrada virtual</label><select name="stake"><option value="0">Sin entrada</option><option value="50">50 fichas</option><option value="100">100 fichas</option><option value="250">250 fichas</option></select></div><div class="field"><label>Límite de apuesta</label><select name="limit"><option>Sin apuestas</option><option>50 fichas</option><option>100 fichas</option></select></div></div><label class="check-row"><input type="checkbox" name="private" checked /> Mesa privada, solo por invitación</label><label class="check-row"><input type="checkbox" name="voice" checked /> Activar voz grupal para esta mesa</label><div class="modal-actions"><button type="button" class="button dark" data-action="close-modal">Cancelar</button><button class="button primary">Crear mesa ${icons.arrow}</button></div></form></div></div>`; if(type==='join') return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><div class="eyebrow">Entrada privada</div><h2>¿Tienes un código?</h2><p>Introduce el código que te compartió tu anfitrión.</p></div><button class="close" data-action="close-modal">×</button></div><form id="join-form"><div class="field"><label>Código de invitación</label><input name="code" required placeholder="ROYAL-7K9M2Q" style="text-transform:uppercase;letter-spacing:.14em;font-size:17px" /></div><div class="notice" style="margin-top:15px">${icons.info}<span>Los códigos de esta versión local funcionan entre pestañas del mismo navegador.</span></div><div class="modal-actions"><button type="button" class="button dark" data-action="close-modal">Cancelar</button><button class="button primary">Revisar mesa ${icons.arrow}</button></div></form></div></div>`; if(type==='profile') return `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><div class="eyebrow">Identidad del club</div><h2>Edita tu perfil.</h2><p>Tu nombre es personal; tu alias es la identificación pública.</p></div><button class="close" data-action="close-modal">×</button></div><form id="profile-form"><div class="field"><label for="profile-display-name">Nombre</label><input id="profile-display-name" name="displayName" required minlength="2" maxlength="60" value="${escapeHtml(state.user?.name || '')}" placeholder="Tu nombre" autocomplete="name" /></div><div class="field" style="margin-top:15px"><label for="profile-alias">Alias público</label><input id="profile-alias" name="alias" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" value="${escapeHtml(state.user?.alias || '')}" placeholder="Ej. byvera980" autocomplete="username" /><small class="field-help">Solo letras, números y guion bajo. Se mostrará en mesas, invitaciones y Amigos.</small></div><div class="notice" style="margin-top:16px">${icons.info}<span>Tu correo de Google o de registro no cambia y seguirá siendo privado.</span></div><div class="modal-actions"><button type="button" class="button dark" data-action="close-modal">Cancelar</button><button class="button primary" type="submit">Guardar cambios ${icons.arrow}</button></div></form></div></div>`; return ''; }

function ensureTableDeleteAction() {
  const table = state.currentTable;
  if (!table || !state.user || state.view === 'lobby') return;
  const isHost = table.hostId && state.user.id ? table.hostId === state.user.id : table.host === state.user.email;
  if (!isHost) return;
  const host = document.querySelector('.invite-code') || document.querySelector('.table-top');
  if (!host || host.querySelector('[data-action="delete-table"]')) return;
  const button = document.createElement('button');
  button.className = 'button danger small';
  button.dataset.action = 'delete-table';
  button.dataset.code = table.code;
  button.textContent = 'Eliminar mesa';
  button.addEventListener('click', () => {
    if (!window.confirm('¿Eliminar esta mesa para todos los jugadores?')) return;
    if (rtSend('delete_table', { code: table.code })) toast('Eliminando mesa…');
    else {
      state.tables = state.tables.filter(item => item.code !== table.code);
      state.currentTable = null; state.view = 'lobby'; save(); render(); toast('Mesa eliminada', 'success');
    }
  });
  host.append(button);
}
function ensureSoloOption() { const form=document.querySelector('#create-form'); if(form&&!form.querySelector('[name="solo"]')){ const label=document.createElement('label'); label.className='check-row'; label.innerHTML='<input type="checkbox" name="solo" /> Jugar en solitario contra Royal Gold AI'; form.insertBefore(label, form.querySelector('.modal-actions')); } ensureSoloPresentation(); ensureTableDeleteAction(); }
function ensureSoloPresentation() { if(!state.currentTable?.solo)return; const seat=document.querySelector('.table-seat.seat-2 strong'); if(seat)seat.textContent='Royal Gold AI'; const extra=document.querySelector('.table-seat.seat-3'); if(extra)extra.remove(); }
function render() { app.innerHTML = state.user ? (state.view==='waiting' ? shell(waitingView()) : state.view==='table' ? shell(state.currentTable?.gameId==='blackjack' ? blackjackView() : state.currentTable?.gameId==='domino' ? dominoView() : state.currentTable?.gameId==='poker' ? pokerView() : state.currentTable?.gameId==='rummy' ? rummyView() : state.currentTable?.gameId==='crazy' ? crazyView() : tableView()) : shell(({lobby:lobbyView,games:gamesView,friends:friendsView,history:historyView,stats:statsView,settings:settingsView,profile:profileView}[state.view] || lobbyView)())) : authView(); ensureTableSocialPanel(); attachEvents(); ensureSoloOption(); attachResultOverlay(); if (state.user) connectRealtime(); if (state.user?.accessToken && !state.user.profileLoaded && !state.user.profileLoading) void loadOwnProfile(); if (state.user && ['friends','waiting'].includes(state.view) && !state.social.loaded && !state.social.loading) void loadSocial(); }

function makeCode() { const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const bytes=new Uint8Array(6); crypto.getRandomValues(bytes); return 'ROYAL-' + [...bytes].map(byte => chars[byte % chars.length]).join(''); }
function createTable(form) { const fd=new FormData(form); const game=gameCatalog.find(g=>g.id===fd.get('game'))||gameCatalog[0]; const solo=fd.get('solo')==='on'; if (rtSend('create_table', { name: fd.get('name'), gameId: game.id, gameName: game.name, maxPlayers: Number(fd.get('max')), private: fd.get('private') === 'on', voice: fd.get('voice') === 'on', stake: Number(fd.get('stake')), solo })) { state.chat=[]; state.modal=null; toast(solo?'Preparando tu partida contra Royal Gold AI…':'Creando mesa segura…'); render(); return; } const t={id:crypto.randomUUID(),code:makeCode(),name:fd.get('name'),gameId:game.id,gameName:game.name,maxPlayers:Number(fd.get('max')),private:fd.get('private')==='on',voice:fd.get('voice')==='on',stake:Number(fd.get('stake')),status:'waiting',createdAt:new Date().toISOString(),host:state.user.email,players:[{name:state.user.alias || state.user.name,email:state.user.email}]}; state.tables.unshift(t);state.currentTable=t;state.chat=[];state.modal=null;state.view='waiting';save();toast(`Mesa creada · ${t.code}`,'success');render(); }
function joinTable(code) { const normalized=String(code || '').trim().toUpperCase(); const knownTable=state.tables.find(t=>t.code.toUpperCase()===normalized); if(knownTable){state.currentTable=knownTable;state.view=knownTable.status==='playing'?'table':'waiting';save();} if (rtSend('join_table', { code: normalized })) { state.chat=[]; state.modal=null; toast(knownTable?.status==='playing'?'Entrando directamente a la mesa…':'Entrando a la sala de espera…'); render(); return; } const table=knownTable; if(!table){toast('No encontramos una mesa con ese código','error');return;} if(table.players.length>=table.maxPlayers){toast('Esta mesa ya está completa','error');return;} if(!table.players.some(p=>p.email===state.user.email)) table.players.push({name:state.user.alias || state.user.name,email:state.user.email}); state.currentTable=table;state.chat=[];state.modal=null;state.view=table.status==='playing'?'table':'waiting';save();toast('Te has unido a la mesa','success');render(); }
function initUno(){ state.uno={turn:0, panelOpen:false, players:[{name:state.user?.alias || state.user?.name || 'Tú'},{name:'Rival de prueba 01'},{name:'Rival de prueba 02'}], hand:[{color:'red',label:'3'},{color:'blue',label:'7'},{color:'yellow',label:'2'},{color:'green',label:'9'},{color:'red',label:'+2'},{color:'black',label:'CAMBIO'}], discard:{color:'blue',label:'5'}, deck:[], finished:false}; }
function validCard(card){ return card.color==='black'||card.color===state.uno.discard.color||card.label===state.uno.discard.label; }
function playCard(index){ const u=state.uno; const myTurn = u?.myTurn ?? u?.turn === 0; if(!myTurn)return toast('Espera tu turno'); const c=u.hand[index]; if(!c)return toast('Carta inválida','error'); const chosenColor = c.color === 'black' ? (window.prompt('Elige color: red, blue, green o yellow', 'blue') || 'blue').toLowerCase() : undefined; if (rtSend('play_card', { index, chosenColor })) return; if(!validCard(c))return toast('Esa carta no puede jugarse ahora','error'); state.selectedCard=index; setTimeout(()=>{u.discard=c;u.hand.splice(index,1);state.selectedCard=null;if(!u.hand.length){finishGame(true);return;}u.turn=1;render();setTimeout(botTurn,700)},180); }
function drawCard(){ const u=state.uno; const myTurn = u?.myTurn ?? u?.turn === 0; if(!myTurn)return toast('Espera tu turno'); if (rtSend('draw_card')) return; u.hand.push({color:['red','blue','green','yellow'][Math.floor(Math.random()*4)],label:String(Math.floor(Math.random()*9)+1)});u.turn=1;render();setTimeout(botTurn,700); }
function botTurn(){ const u=state.uno;if(!u||u.finished)return;const bot=u.players[u.turn];const color=['red','blue','green','yellow'][Math.floor(Math.random()*4)];u.discard={color,label:String(Math.floor(Math.random()*9)+1)};u.turn=2;render();setTimeout(()=>{if(u.finished)return;u.discard={color:['red','blue','green','yellow'][Math.floor(Math.random()*4)],label:String(Math.floor(Math.random()*9)+1)};u.turn=0;render()},700); }
function finishGame(win){ const u=state.uno;u.finished=true;state.user.games=(state.user.games||0)+1;if(win){state.user.wins=(state.user.wins||0)+1;state.user.chips=(state.user.chips||1250)+50;}state.history.unshift({gameId:'uno',gameName:'UNO',date:new Date().toISOString(),result:win?'Victoria':'Partida terminada',delta:win?50:0});save();toast(win?'¡Partida ganada! +50 fichas':'Partida terminada','success');setTimeout(()=>{state.view='lobby';state.uno=null;render()},1500);}
async function toggleVoice(){ if(state.voiceOn){if(state.realtime.connected)rtSend('voice_leave');state.voice.peers.forEach((_,peerId)=>closeVoicePeer(peerId));state.voice.localStream?.getTracks().forEach(track=>track.stop());state.voice.localStream=null;state.audioStream=null;state.voiceOn=false;toast('Micrófono silenciado');render();return;} if(!navigator.mediaDevices?.getUserMedia){toast('Este navegador no permite acceso al micrófono','error');return;} try{state.voice.localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});state.audioStream=state.voice.localStream;state.voiceOn=true;if(state.realtime.connected)rtSend('voice_join');toast(state.realtime.connected?'Micrófono activo · voz de mesa conectando':'Micrófono activo en modo local','success');render();}catch{toast('Permiso de micrófono no concedido','error');} }

function attachEvents(){ document.querySelectorAll('[data-nav]').forEach(el=>el.addEventListener('click',()=>{state.view=el.dataset.nav;state.modal=null;render()})); document.querySelectorAll('[data-auth]').forEach(el=>el.addEventListener('click',()=>{state.authMode=el.dataset.auth;render()})); document.querySelectorAll('[data-modal]').forEach(el=>el.addEventListener('click',()=>{state.modal=el.dataset.modal;render()})); document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',async()=>{const a=el.dataset.action;if(a==='close-modal'){state.modal=null;render()}else if(a==='edit-profile'){state.modal='profile';render()}else if(a==='notifications'){toast('No tienes notificaciones nuevas')}else if(a==='logout'){if(state.voiceOn)await toggleVoice();if(state.user?.accessToken)await supabaseAuth('logout',{method:'POST',token:state.user.accessToken}).catch(()=>{});state.user=null;state.view='lobby';state.modal=null;state.realtime.ws?.close();state.realtime.ws=null;state.realtime.connected=false;save();render()}else if(a==='copy-code'){await navigator.clipboard?.writeText(state.currentTable.code);toast('Código copiado','success')}else if(a==='share-code'){if(navigator.share) await navigator.share({title:'Royal Gold Club',text:`Únete a mi mesa ${state.currentTable.name} con el código ${state.currentTable.code}`});else {await navigator.clipboard?.writeText(state.currentTable.code);toast('Código copiado para compartir','success')}}else if(a==='add-bot'){if(rtSend('add_bot')){toast('Añadiendo rival de prueba…');return;}const t=state.currentTable;if(t.players.length<t.maxPlayers){t.players.push({name:`Rival de prueba ${String(t.players.length).padStart(2,'0')}`,email:`bot-${t.players.length}@local`});save();render();}}else if(a==='start-uno'){if(state.currentTable.gameId!=='uno'){toast('Esta demo jugable está disponible para UNO');return;}if(rtSend('start_game')){toast('Preparando partida…');return;}state.view='table';state.uno=null;render()}else if(a==='resume'){state.currentTable=state.tables.find(t=>t.host===state.user.email)||state.currentTable;state.view=state.currentTable?.status==='waiting'?'waiting':'table';render()}else if(a==='join-table'){joinTable(el.dataset.code)}else if(a==='play-game'){const game=el.dataset.game;state.modal='create';render();setTimeout(()=>{const select=document.querySelector('#create-form select[name="game"]');if(select)select.value=game},0)}else if(a==='toggle-panel'){if(state.uno){state.uno.panelOpen=!state.uno.panelOpen;render()}}else if(a==='draw-card'){drawCard()}else if(a==='play-card'){playCard(Number(el.dataset.index))}else if(a==='say-uno'){toast('¡UNO! declarado')}else if(a==='toggle-voice'){await toggleVoice()}else if(a==='leave-table'){if(state.voiceOn)await toggleVoice();rtSend('leave_table');state.view='lobby';state.uno=null;render()}})); const auth=document.querySelector('#auth-form');if(auth)auth.addEventListener('submit',async e=>{e.preventDefault();const submit=auth.querySelector('button[type="submit"]');if(submit)submit.disabled=true;try{await submitAuth(auth)}catch(error){toast(error.message,'error');if(submit)submit.disabled=false}}); const demo=document.querySelector('#demo-login');if(demo)demo.addEventListener('click',()=>{state.user={name:'Valentina Vega',alias:'valentina_vega',email:'valentina@local.club',chips:1250,games:0,wins:0};state.view='lobby';state.modal=null;state.currentTable=null;save();toast('Demo local iniciada','success');render()});const forgot=document.querySelector('#forgot');if(forgot)forgot.addEventListener('click',()=>toast('La recuperación de contraseña se habilita desde Supabase Auth'));const create=document.querySelector('#create-form');if(create)create.addEventListener('submit',e=>{e.preventDefault();createTable(create)});const join=document.querySelector('#join-form');if(join)join.addEventListener('submit',e=>{e.preventDefault();joinTable(new FormData(join).get('code'))});const profile=document.querySelector('#profile-form');if(profile)profile.addEventListener('submit',async e=>{e.preventDefault();const submit=profile.querySelector('button[type="submit"]');if(submit)submit.disabled=true;try{await saveProfile(profile)}catch(error){toast(error.message,'error');if(submit)submit.disabled=false}});const chatForm=document.querySelector('#chat-form');if(chatForm)chatForm.addEventListener('submit',e=>{e.preventDefault();const body=new FormData(chatForm).get('body');if(!String(body||'').trim())return;if(rtSend('chat_message',{body:String(body)})){chatForm.reset();return;}state.chat.push({id:crypto.randomUUID(),name:state.user.alias||state.user.name,body:String(body).trim(),createdAt:new Date().toISOString()});state.chat=state.chat.slice(-50);chatForm.reset();render();}); }
function blackjackCard(card) { if (card?.hidden) return '<div class="blackjack-card hidden" aria-label="Carta oculta"></div>'; const red = ['♥','♦'].includes(card?.suit); return `<div class="blackjack-card ${red?'red':''}"><small>${card?.rank || '—'}${card?.suit || ''}</small><span>${card?.rank || '—'}</span><em>${card?.suit || ''}</em></div>`; }
function blackjackView() { const game=state.blackjack; if (!game) return `<div class="view game-table-wrap"><div class="notice">Conectando con la mesa de 21…</div></div>`; const me=game.players.find(player=>player.id===state.realtime.playerId) || game.players[0]; const myTurn=game.activePlayerId===state.realtime.playerId; const dealerValue=game.dealer.value ?? '？'; const resultLabel={blackjack:'Blackjack',win:'Victoria',push:'Empate',lose:'Derrota',bust:'Te pasaste'}; return `<div class="view game-table-wrap"><div class="table-top"><div><button class="text-button" data-action="leave-table">← Salir de la mesa</button><span class="table-id" style="margin-left:15px">${escapeHtml(state.currentTable?.name || 'Mesa 21')} · <b>${state.currentTable?.code || 'LOCAL'}</b></span></div><div><button class="button dark small" data-action="toggle-voice">${icons.mic} ${state.voiceOn?'Silenciar':'Voz'}</button><button class="button dark small" data-action="toggle-panel" style="margin-left:5px">${icons.users} Jugadores</button></div></div><div class="blackjack-table"><div class="blackjack-header"><div><div class="blackjack-label">Royal Gold · Blackjack</div><h2>Acércate a 21.</h2></div><div class="blackjack-total">Estado <strong>${game.finished?'Finalizada':game.phase==='dealer'?'Dealer':'En juego'}</strong></div></div><div class="blackjack-dealer"><div class="blackjack-label">Dealer</div><div class="blackjack-hand">${game.dealer.hand.map(blackjackCard).join('')}</div><div class="blackjack-total">Puntos <strong>${dealerValue}</strong></div></div><div class="blackjack-center"><span class="muted">${game.finished?'Resultados finales':myTurn?'Tu turno':'Turno de '+escapeHtml(game.players.find(player=>player.id===game.activePlayerId)?.name || 'otro jugador')}</span></div><div class="blackjack-players">${game.players.map(player=>{const hand=player.hand || Array.from({length:player.handCount||0},()=>({hidden:true}));return `<div class="blackjack-player ${player.id===game.activePlayerId?'active':''}"><strong>${escapeHtml(player.name)}${player.id===state.realtime.playerId?' · tú':''}</strong><div class="blackjack-hand">${hand.map(blackjackCard).join('')}</div><div class="blackjack-total">${player.value ?? player.handCount+' cartas'} ${player.result?`· ${resultLabel[player.result] || player.result}`:''}</div></div>`}).join('')}</div>${game.finished?`<div class="blackjack-result"><div class="eyebrow">Ronda terminada</div><p>El dealer terminó con <strong>${game.dealer.value}</strong>. ${me?.result ? `Tu resultado: <strong>${resultLabel[me.result] || me.result}</strong>.` : ''}</p><div class="blackjack-actions"><button class="button dark" data-action="leave-table">Salir de la mesa</button><button class="button primary" data-action="blackjack-replay">Volver a jugar ${icons.arrow}</button></div></div>`:`<div class="blackjack-actions"><button class="button dark" data-action="blackjack-hit" ${myTurn?'':'disabled'}>Pedir carta</button><button class="button primary" data-action="blackjack-stand" ${myTurn?'':'disabled'}>Plantarse</button></div>`}</div><p class="muted" style="text-align:center;font-size:10px;margin-top:12px">${state.realtime.connected?'Servidor realtime conectado · reglas validadas en el servidor.':'Modo local · usa el servidor para jugar 21.'}</p></div>`; }
function blackjackAction(type) { if (rtSend(type)) { toast(type==='blackjack_hit'?'Pidiendo carta…':'Te plantas.'); return; } toast('Conecta el servidor realtime para jugar 21','error'); }
function dominoTile(tile, small = false) { if (!tile) return ''; return `<button class="domino-tile ${small?'small':''}" data-action="domino-place" data-index="${tile.index ?? ''}" aria-label="Ficha ${tile.a}-${tile.b}"><span>${tile.a}</span><i></i><span>${tile.b}</span></button>`; }
function dominoView() { const game=state.domino; if (!game) return `<div class="view game-table-wrap"><div class="notice">Conectando con la mesa de dominó…</div></div>`; const myId=state.realtime.playerId; const me=game.players.find(player=>player.id===myId) || game.players[0]; const myTurn=game.activePlayerId===myId; const hand=(me?.hand || []).map((tile,index)=>({...tile,index})); const canPlace=tile=>!game.ends || tile.a===game.ends[0] || tile.b===game.ends[0] || tile.a===game.ends[1] || tile.b===game.ends[1]; const winner=game.players.find(player=>player.id===game.winnerId); return `<div class="view game-table-wrap"><div class="table-top"><div><button class="text-button" data-action="leave-table">← Salir de la mesa</button><span class="table-id" style="margin-left:15px">${escapeHtml(state.currentTable?.name || 'Mesa de dominó')} · <b>${state.currentTable?.code || 'LOCAL'}</b></span></div><div><button class="button dark small" data-action="toggle-voice">${icons.mic} ${state.voiceOn?'Silenciar':'Voz'}</button><button class="button dark small" data-action="toggle-panel">${icons.users} Jugadores</button></div></div><div class="domino-table"><div class="domino-header"><div><div class="domino-label">Royal Gold · Dominó</div><h2>La ficha correcta cambia la mesa.</h2></div><div class="domino-count">Pozo <strong>${game.boneyardCount}</strong></div></div><div class="domino-status">${game.finished?`Ganador: <strong>${escapeHtml(winner?.name || 'Mesa cerrada')}</strong>`:myTurn?'<strong>Tu turno</strong>':`Turno de ${escapeHtml(game.players.find(player=>player.id===game.activePlayerId)?.name || 'otro jugador')}`}</div><div class="domino-chain">${game.chain.length ? game.chain.map(tile=>`<div class="chain-tile"><span>${tile.left}</span><i></i><span>${tile.right}</span></div>`).join('') : '<span class="muted">La mesa está lista para la primera ficha.</span>'}</div><div class="domino-players">${game.players.map(player=>`<div class="domino-player ${player.id===game.activePlayerId?'active':''}"><div class="avatar">${initials(player.name)}</div><div><strong>${escapeHtml(player.name)}${player.id===myId?' · tú':''}</strong><span>${player.handCount} fichas · ${player.points} puntos</span></div></div>`).join('')}</div>${game.finished?`<div class="domino-result"><div class="eyebrow">Ronda terminada</div><p>${escapeHtml(winner?.name || 'La mesa')} se lleva la ronda.</p><button class="button dark" data-action="leave-table">Salir de la mesa</button><button class="button primary" data-action="domino-replay">Volver a jugar ${icons.arrow}</button></div>`:`<div class="domino-hand"><div class="domino-label">Tus fichas</div><div class="domino-tiles">${hand.map(tile=>dominoTile(tile)).join('')}</div><div class="domino-actions"><button class="button dark small" data-action="domino-draw" ${myTurn?'':'disabled'}>Robar del pozo</button><button class="button ghost small" data-action="domino-pass" ${myTurn?'':'disabled'}>Pasar turno</button></div><p class="muted" style="font-size:10px">${myTurn?(game.ends?'Selecciona una ficha y luego elige el extremo.':'Coloca tu primera ficha en la mesa.'):'Espera a que llegue tu turno.'}</p></div>`}</div><p class="muted" style="text-align:center;font-size:10px;margin-top:12px">${state.realtime.connected?'Servidor realtime conectado · fichas y turnos validados en el servidor.':'Modo local · usa el servidor para jugar dominó.'}</p></div>`; }
function dominoAction(type, payload = {}) { if (rtSend(type, payload)) { toast(type==='domino_place'?'Ficha colocada.':type==='domino_draw'?'Robando ficha…':'Turno pasado.'); return; } toast('Conecta el servidor realtime para jugar dominó','error'); }
function pokerCard(card) { if (card?.hidden) return '<div class="poker-card hidden" aria-label="Carta oculta"></div>'; const red=['♥','♦'].includes(card?.suit); return `<div class="poker-card ${red?'red':''}"><small>${card?.rank||'—'}${card?.suit||''}</small><strong>${card?.rank||'—'}</strong><em>${card?.suit||''}</em></div>`; }
function pokerView() { const game=state.poker; if(!game)return `<div class="view game-table-wrap"><div class="notice">Conectando con la mesa de póker…</div></div>`; const myId=state.realtime.playerId; const me=game.players.find(player=>player.id===myId)||game.players[0]; const myTurn=game.currentPlayerId===myId; const hand=me?.hand||Array.from({length:me?.handCount||0},()=>({hidden:true})); const winners=game.players.filter(player=>game.winnerIds?.includes(player.id)); const rankNames=['Carta alta','Pareja','Doble pareja','Trío','Escalera','Color','Full house','Póker','Escalera de color']; return `<div class="view game-table-wrap"><div class="table-top"><div><button class="text-button" data-action="leave-table">← Salir de la mesa</button><span class="table-id" style="margin-left:15px">${escapeHtml(state.currentTable?.name||'Texas Hold’em')} · <b>${state.currentTable?.code||'LOCAL'}</b></span></div><div><button class="button dark small" data-action="toggle-voice">${icons.mic} ${state.voiceOn?'Silenciar':'Voz'}</button><button class="button dark small" data-action="toggle-panel">${icons.users} Jugadores</button></div></div><div class="poker-table"><div class="poker-header"><div><div class="poker-label">Royal Gold · Texas Hold’em</div><h2>Lee la mesa.</h2></div><div class="poker-pot">Bote <strong>${game.pot}</strong></div></div><div class="poker-community"><div class="poker-label">${game.phase==='showdown'?'Showdown':game.phase}</div><div class="poker-cards">${game.community.map(pokerCard).join('')||'<span class="muted">Las cartas comunitarias aparecerán aquí.</span>'}</div></div><div class="poker-players">${game.players.map(player=>`<div class="poker-player ${player.id===game.currentPlayerId?'active':''} ${player.folded?'folded':''}"><div class="avatar">${initials(player.name)}</div><div class="poker-player-info"><strong>${escapeHtml(player.name)}${player.id===myId?' · tú':''}</strong><span>${player.folded?'Retirado':player.allIn?'All-in':`${player.stack} fichas · ${player.handCount} cartas`}</span></div><div class="poker-opponent-hand">${(player.hand||Array.from({length:player.handCount||0},()=>({hidden:true}))).map(pokerCard).join('')}</div></div>`).join('')}</div><div class="poker-own-hand"><div class="poker-label">Tus cartas</div><div class="poker-cards">${hand.map(pokerCard).join('')}</div><div class="poker-status">${game.finished?`Ganador: <strong>${escapeHtml(winners.map(player=>player.name).join(', ')||'Mesa')}</strong> · ${me?.rank?rankNames[me.rank[0]]:''}`:myTurn?`Tu turno · ${game.toCall?`igualar ${game.toCall}`:'puedes pasar'}`:`Turno de ${escapeHtml(game.players.find(player=>player.id===game.currentPlayerId)?.name||'otro jugador')}`}</div></div>${game.finished?`<div class="poker-result"><div class="eyebrow">Mano terminada</div><p>${escapeHtml(winners.map(player=>player.name).join(', ')||'La mesa')} se lleva el bote.</p><button class="button dark" data-action="leave-table">Salir de la mesa</button><button class="button primary" data-action="poker-replay">Volver a jugar ${icons.arrow}</button></div>`:`<div class="poker-actions"><button class="button dark small" data-action="poker-fold" ${myTurn?'':'disabled'}>Retirarse</button><button class="button ghost small" data-action="poker-check" ${myTurn&&game.actions.check?'':'disabled'}>Pasar</button><button class="button primary small" data-action="poker-call" ${myTurn&&game.actions.call?'':'disabled'}>Igualar ${game.toCall?game.toCall:''}</button><input id="poker-raise-amount" class="poker-raise-input" type="number" min="${game.actions.raiseMin||0}" value="${game.actions.raiseMin||0}" ${myTurn&&game.actions.raiseMin?'':'disabled'} /><button class="button gold small" data-action="poker-raise" ${myTurn&&game.actions.raiseMin?'':'disabled'}>Subir</button></div>`}</div><p class="muted" style="text-align:center;font-size:10px;margin-top:12px">${state.realtime.connected?'Servidor realtime conectado · apuestas y cartas privadas validadas en el servidor.':'Modo local · usa el servidor para jugar póker.'}</p></div>`; }
function pokerAction(type, amount) { if (rtSend(type, amount === undefined ? {} : {amount})) { toast(type==='poker_fold'?'Te retiraste.':'Acción enviada.'); return; } toast('Conecta el servidor realtime para jugar póker','error'); }
const rummyPipLayouts = { '2':['tl','br'], '3':['tl','mc','br'], '4':['tl','tr','bl','br'], '5':['tl','tr','mc','bl','br'], '6':['tl','tr','ml','mr','bl','br'], '7':['tl','tr','ml','mc','mr','bl','br'], '8':['tl','tr','ml','mr','ul','ur','bl','br'], '9':['tl','tr','ml','mc','mr','bl','br','ul','ur'], '10':['tl','tr','ml','mr','ul','ur','ll','lr','bl','br'] };
const rummyPipCoordinates = { tl:[22,15], tr:[78,15], ml:[22,38], mr:[78,38], ul:[22,28], ur:[78,28], mc:[50,50], ll:[22,72], lr:[78,72], bl:[22,85], br:[78,85] };
function rummyCardFace(card) { const rank = escapeHtml(card?.rank || '?'); const suit = escapeHtml(card?.suit || ''); const red = ['♥','♦'].includes(card?.suit); const numeric = /^([2-9]|10)$/.test(String(card?.rank || '')); let art = numeric ? (rummyPipLayouts[card.rank] || []).map(position => { const [x, y] = rummyPipCoordinates[position]; return `<span class="rummy-pip" style="left:${x}%;top:${y}%">${suit}</span>`; }).join('') : ['J','Q','K'].includes(card?.rank) ? `<span class="rummy-court-rank">${rank}</span><span class="rummy-court-suit">${suit}</span><span class="rummy-court-suit second">${suit}</span>` : `<span class="rummy-ace">${suit}</span>`; return `<span class="rummy-corner top"><b>${rank}</b><em>${suit}</em></span><span class="rummy-card-art ${numeric?'pips':card?.rank==='A'?'ace':'court'} ${red?'red':''}">${art}</span><span class="rummy-corner bottom"><b>${rank}</b><em>${suit}</em></span>`; }
function rummyCard(card, index, interactive = false, selected = false) { if (!card) return ''; const red = ['♥','♦'].includes(card.suit); return `<button type="button" class="rummy-card ${red?'red':''} ${selected?'selected':''} ${interactive?'':'is-locked'}" data-action="rummy-select" data-index="${index}" aria-disabled="${interactive?'false':'true'}" aria-label="${interactive?(selected?'Quitar selección de':'Seleccionar'):'Primero roba una carta'} ${card.rank}${card.suit}">${rummyCardFace(card)}</button>`; }
function rummyDiscardCard(card) { if (!card) return '<span class="muted">Vacío</span>'; const red = ['♥','♦'].includes(card.suit); return `<div class="rummy-card ${red?'red':''}" aria-label="Carta en descarte ${card.rank}${card.suit}">${rummyCardFace(card)}</div>`; }
function rummyView() {
  const game = state.rummy;
  if (!game) return `<div class="view game-table-wrap"><div class="notice">Conectando con la mesa de Rummy…</div></div>`;
  const myId = state.realtime.playerId;
  const me = game.players.find(player => player.id === myId) || game.players[0];
  const myTurn = game.activePlayerId === myId;
  const canDraw = myTurn && game.phase === 'draw';
  const canSelect = myTurn && game.phase === 'discard';
  const selected = state.rummySelection || [];
  const canDiscard = canSelect && selected.length === 1;
  const canMeld = canSelect && selected.length >= 3;
  const winner = game.players.find(player => player.id === game.winnerId);
  const status = game.finished ? `Ganador: <strong>${escapeHtml(winner?.name || 'Mesa')}</strong>` : myTurn ? (canDraw ? '<strong>Tu turno · roba una carta</strong>' : '<strong>Tu turno · selecciona y juega</strong>') : `Turno de ${escapeHtml(game.players.find(player => player.id === game.activePlayerId)?.name || 'otro jugador')}`;
  const actionHint = game.finished ? 'La ronda terminó.' : myTurn ? (canDraw ? 'Paso 1: pulsa el pozo o “Robar descarte”.' : `Paso 2: selecciona cartas. ${selected.length ? `${selected.length} seleccionada${selected.length === 1 ? '' : 's'}.` : 'Si la carta no te sirve, descarta cualquier carta de tu mano; no puedes pasar sin descartar.'}`) : 'Espera a que llegue el turno del jugador activo.';
  return `<div class="view game-table-wrap"><div class="table-top"><div><button class="text-button" data-action="leave-table">← Salir de la mesa</button><span class="table-id" style="margin-left:15px">${escapeHtml(state.currentTable?.name || 'Mesa de Rummy')} · <b>${state.currentTable?.code || 'LOCAL'}</b></span></div><div><button class="button dark small" data-action="toggle-voice">${icons.mic} ${state.voiceOn ? 'Silenciar' : 'Voz'}</button><button class="button dark small" data-action="toggle-panel">${icons.users} Jugadores</button></div></div><div class="rummy-table"><div class="rummy-header"><div><div class="rummy-label">Royal Gold · Rummy</div><h2>Combina con precisión.</h2></div><div class="rummy-count">Pozo <strong>${game.stockCount}</strong></div></div><div class="rummy-status">${status}</div><div class="rummy-step" aria-label="Pasos de la jugada"><span class="${canDraw ? 'active' : ''}">1 · Robar</span><span class="${canSelect ? 'active' : ''}">2 · Seleccionar</span><span class="${canDiscard || canMeld ? 'active' : ''}">3 · Jugar</span></div><div class="rummy-center"><button type="button" class="rummy-pile stock ${canDraw ? '' : 'rummy-control-locked'}" aria-label="Robar una carta del pozo" aria-disabled="${canDraw ? 'false' : 'true'}" data-action="rummy-draw-stock"><span>◆</span><small>ROBAR DEL POZO</small></button><div class="rummy-discard-pile"><div class="rummy-label">Descarte</div>${rummyDiscardCard(game.discard)}</div><button type="button" class="button ghost small ${canDraw && game.discard ? '' : 'rummy-control-locked'}" aria-disabled="${canDraw && game.discard ? 'false' : 'true'}" data-action="rummy-draw-discard">Robar descarte</button></div><div class="rummy-action-hint">${actionHint}</div><div class="rummy-players">${game.players.map(player => `<div class="rummy-player ${player.id === game.activePlayerId ? 'active' : ''}"><div class="avatar">${initials(player.name)}</div><div><strong>${escapeHtml(player.name)}${player.id === myId ? ' · tú' : ''}</strong><span>${player.handCount} cartas · ${player.melds.length} combinaciones</span></div></div>`).join('')}</div>${game.finished ? `<div class="rummy-result"><div class="eyebrow">Ronda terminada</div><p>${escapeHtml(winner?.name || 'La mesa')} cierra la mano.</p><button class="button dark" data-action="leave-table">Salir de la mesa</button><button class="button primary" data-action="rummy-replay">Volver a jugar ${icons.arrow}</button></div>` : `<div class="rummy-hand"><div class="rummy-hand-title"><div class="rummy-label">Tus cartas · ${me?.hand?.length || 0}</div><div class="rummy-actions"><button type="button" class="button dark small ${canDiscard ? '' : 'rummy-control-locked'}" aria-disabled="${canDiscard ? 'false' : 'true'}" data-action="rummy-discard-selected">Descartar carta</button><button type="button" class="button ghost small ${canMeld ? '' : 'rummy-control-locked'}" aria-disabled="${canMeld ? 'false' : 'true'}" data-action="rummy-meld">Combinar selección</button></div></div><div class="rummy-cards">${(me?.hand || []).map((card, index) => rummyCard(card, index, canSelect, selected.includes(index))).join('')}</div><p class="rummy-rule-note">${myTurn ? (canDraw ? 'Roba una carta. Si no te sirve, después puedes descartarla y pasar el turno.' : 'La carta robada no tiene que servir: selecciona cualquier carta y pulsa “Descartar carta”. No puedes pasar sin descartar.') : 'Espera a que llegue tu turno.'}</p></div>`}</div><p class="muted" style="text-align:center;font-size:10px;margin-top:12px">${state.realtime.connected ? 'Servidor realtime conectado · manos privadas y combinaciones validadas en el servidor.' : 'Reconectando al servidor realtime…'}</p></div>`;
}
function rummyAction(type, payload = {}) { const action = String(type).replaceAll('-', '_'); const game = state.rummy; if (!game) return toast('La mesa todavía está sincronizando…', 'error'); if (game.finished) return toast('La ronda ya terminó', 'error'); const myTurn = game.activePlayerId === state.realtime.playerId; if (!myTurn) return toast('Espera a que llegue tu turno', 'error'); if ((action === 'rummy_draw_stock' || action === 'rummy_draw_discard') && game.phase !== 'draw') return toast('Ya robaste una carta; ahora selecciona y descarta', 'error'); if ((action === 'rummy_discard' || action === 'rummy_meld') && game.phase !== 'discard') return toast('Primero roba una carta del pozo o del descarte', 'error'); if (!state.realtime.connected) { toast('Reconectando la mesa…', 'error'); if (!state.realtime.ws) connectRealtime(); return; } if (rtSend(action, payload)) { toast(action==='rummy_discard'?'Carta descartada.':action==='rummy_meld'?'Combinación registrada.':'Carta robada…'); return; } toast('No se pudo enviar la jugada; intenta de nuevo','error'); }
function crazyCard(card, index, interactive = false) { if (!card) return ''; const red=['♥','♦'].includes(card.suit); return `<button class="crazy-card ${red?'red':''}" data-action="crazy-play-card" data-index="${index}" ${interactive?'':'disabled'} aria-label="${card.rank}${card.suit}"><small>${card.rank}${card.suit}</small><strong>${card.rank}</strong><em>${card.suit}</em></button>`; }
function crazyView() { const game=state.crazy; if(!game)return `<div class="view game-table-wrap"><div class="notice">Conectando con la mesa de Crazy Eights…</div></div>`; const myId=state.realtime.playerId; const me=game.players.find(player=>player.id===myId)||game.players[0]; const myTurn=game.activePlayerId===myId; const winner=game.players.find(player=>player.id===game.winnerId); const suitName={ '♠':'picas','♥':'corazones','♦':'diamantes','♣':'tréboles' }; return `<div class="view game-table-wrap"><div class="table-top"><div><button class="text-button" data-action="leave-table">← Salir de la mesa</button><span class="table-id" style="margin-left:15px">${escapeHtml(state.currentTable?.name||'Mesa de Crazy Eights')} · <b>${state.currentTable?.code||'LOCAL'}</b></span></div><div><button class="button dark small" data-action="toggle-voice">${icons.mic} ${state.voiceOn?'Silenciar':'Voz'}</button><button class="button dark small" data-action="toggle-panel">${icons.users} Jugadores</button></div></div><div class="crazy-table"><div class="crazy-header"><div><div class="crazy-label">Royal Gold · Crazy Eights</div><h2>El ocho cambia la mesa.</h2></div><div class="crazy-count">Pozo <strong>${game.stockCount}</strong></div></div><div class="crazy-status">${game.finished?`Ganador: <strong>${escapeHtml(winner?.name||'Mesa')}</strong>`:myTurn?'<strong>Tu turno</strong>':`Turno de ${escapeHtml(game.players.find(player=>player.id===game.activePlayerId)?.name||'otro jugador')}`} · Palo activo <strong>${game.currentSuit} ${suitName[game.currentSuit]||''}</strong></div><div class="crazy-center"><button class="crazy-pile" data-action="crazy-draw-card" ${myTurn?'':'disabled'}><span>◆</span><small>ROBAR</small></button><div class="crazy-discard"><div class="crazy-label">Descarte</div>${crazyCard(game.discard, '', false)}</div></div><div class="crazy-players">${game.players.map(player=>`<div class="crazy-player ${player.id===game.activePlayerId?'active':''}"><div class="avatar">${initials(player.name)}</div><div><strong>${escapeHtml(player.name)}${player.id===myId?' · tú':''}</strong><span>${player.handCount} cartas</span></div></div>`).join('')}</div>${game.finished?`<div class="crazy-result"><div class="eyebrow">Ronda terminada</div><p>${escapeHtml(winner?.name||'La mesa')} se quedó con la última carta.</p><button class="button dark" data-action="leave-table">Salir de la mesa</button><button class="button primary" data-action="crazy-replay">Volver a jugar ${icons.arrow}</button></div>`:`<div class="crazy-hand"><div class="crazy-label">Tus cartas · ${me?.hand?.length||0}</div><div class="crazy-cards">${(me?.hand||[]).map((card,index)=>crazyCard(card,index,myTurn)).join('')}</div><p class="muted" style="font-size:10px">${myTurn?'Juega por palo o rango. El 8 permite elegir el nuevo palo; si no puedes, roba.':'Espera a que llegue tu turno.'}</p></div>`}</div><p class="muted" style="text-align:center;font-size:10px;margin-top:12px">${state.realtime.connected?'Servidor realtime conectado · reglas y manos privadas validadas en el servidor.':'Modo local · usa el servidor para jugar Crazy Eights.'}</p></div>`; }
function crazyAction(type, payload = {}) { if (rtSend(type, payload)) { toast(type==='crazy_draw_card'?'Robando carta…':'Carta jugada.'); return; } toast('Conecta el servidor realtime para jugar Crazy Eights','error'); }
function waitingView() { const t=state.currentTable || {name:'Mesa Royal',gameName:'Juego',code:'LOCAL',players:[],maxPlayers:4,private:true,host:''}; const isHost=(t.hostId&&state.user?.id)?t.hostId===state.user.id:t.host===state.user?.email; const canStart=isHost&&t.players.length>=2; return `<div class="view waiting"><button class="text-button" data-nav="lobby">← Volver al lobby</button><div class="waiting-heading"><div><div class="eyebrow">Mesa privada · sala de espera</div><h1 class="page-title">${escapeHtml(t.name)}</h1><p class="muted" style="font-size:12px;margin-top:10px">${escapeHtml(t.gameName)} · ${t.private?'Solo con código':'Mesa visible para el club'} · ${t.maxPlayers} asientos</p></div><div class="waiting-connection ${state.realtime.connected?'online':'offline'}"><span>●</span>${state.realtime.connected?'Mesa sincronizada':'Reconectando mesa'}</div></div><div class="invite-code"><div class="invite-code-copy"><div class="muted" style="font-size:10px;text-transform:uppercase;letter-spacing:.14em">Código de invitación</div><code>${t.code}</code><div class="invite-code-actions"><button class="button dark small" data-action="copy-code">${icons.copy} Copiar</button><button class="button ghost small" data-action="share-code">Compartir enlace</button></div></div>${isHost ? waitingInvitePicker() : '<div class="table-invite-guest">El anfitrión puede buscar jugadores e invitarlos desde aquí.</div>'}</div><div class="notice">${icons.info}<span>Comparte el código o el enlace con tu círculo. La mesa se sincroniza en tiempo real y conserva tu asiento si tu conexión se interrumpe.</span></div><section class="panel" style="margin-top:20px"><div class="section-head"><h2 style="font-size:20px">Participantes</h2><span class="muted" style="font-size:11px">${t.players.length}/${t.maxPlayers} asientos ocupados</span></div><div class="seats-grid">${Array.from({length:t.maxPlayers},(_,i)=>{const p=t.players[i];return p?`<div class="seat-box filled"><div class="avatar" style="margin-bottom:8px">${initials(p.name)}</div><strong>${escapeHtml(p.name)}</strong><span class="seat-state ${p.connected===false?'away':'ready'}">${p.connected===false?'Desconectado':'Conectado'}</span></div>`:`<div class="seat-box">Asiento disponible</div>`}).join('')}</div><div class="modal-actions"><button class="button dark" data-action="add-bot" ${t.players.length>=t.maxPlayers?'disabled':''}>Añadir rival de prueba</button><button class="button primary" data-action="start-uno" ${canStart?'':'disabled style="opacity:.45;cursor:not-allowed"'}>${isHost?(t.players.length<2?'Esperando participantes':'Comenzar partida'): 'Esperando al anfitrión'} ${icons.arrow}</button></div></section></div>`; }
function historyIcon(gameId) { return ({uno:'●',poker:'♠',blackjack:'21',domino:'◈',rummy:'◆'}[gameId] || '♛'); }
function historyView() { const total=state.history.length; return `<div class="view"><div class="eyebrow">Tu recorrido</div><h1 class="page-title">Historial de partidas</h1><div class="history-toolbar"><span>${total} ${total===1?'partida registrada':'partidas registradas'}</span><span class="muted">Resultados guardados en este dispositivo</span></div><div class="panel" style="margin-top:18px">${total ? state.history.map(h=>`<div class="history-row"><div class="game-art ${h.gameId}" style="width:43px;height:43px;margin:0;border-radius:9px;flex:none"><span class="big-suit" style="font-size:30px">${historyIcon(h.gameId)}</span></div><div class="row-main"><strong>${escapeHtml(h.gameName || h.gameId || 'Partida')}</strong><span>${formatDate(h.date)} · ${escapeHtml(h.result || 'Finalizada')}</span></div><strong style="color:${h.delta>=0?'#8fd1bb':'#d7867d'}">${h.delta>=0?'+':''}${h.delta||0} fichas</strong></div>`).join('') : '<div class="empty-state">Tu historial aparecerá después de terminar tu primera partida.</div>'}</div></div>`; }
function statsView() { const total=state.history.length; const wins=state.history.filter(item=>item.won||item.result==='Victoria'||item.result==='Blackjack').length; const winRate=total?Math.round((wins/total)*100):0; const byGame=[...new Map(state.history.map(item=>[item.gameId,item])).values()]; return `<div class="view"><div class="eyebrow">Rendimiento</div><h1 class="page-title">Estadísticas</h1><div class="metric-row" style="margin-top:28px"><div class="metric"><strong>${state.user?.games||0}</strong><span>Partidas</span></div><div class="metric"><strong>${state.user?.wins||0}</strong><span>Victorias</span></div><div class="metric"><strong>${winRate}%</strong><span>Ratio de victoria</span></div></div><div class="subpage-grid"><section class="panel"><h3>Tu temporada</h3>${total?`<div class="season-stat"><span>Fichas ganadas</span><strong>+${state.history.reduce((sum,item)=>sum+(item.delta||0),0)}</strong></div><div class="season-stat"><span>Juegos visitados</span><strong>${byGame.length}</strong></div><div class="season-stat"><span>Última partida</span><strong>${formatDate(state.history[0].date)}</strong></div>`:'<div class="empty-state">Aún no hay suficientes partidas para mostrar tendencias.<br><span style="font-size:10px">Termina una ronda para comenzar a construir tu historial.</span></div>'}</section><section class="panel"><h3>Clasificación</h3><div class="notice">${icons.info}<span>La clasificación del club se activará al conectar una base de datos compartida. Tus resultados locales ya están contabilizados.</span></div></section></div></div>`; }
function casinoGameCard(game) {
  return `<article class="casino-game-card casino-game-${game.id}">
    <div class="casino-game-art" aria-hidden="true"><span>${game.suit}</span><i></i><b></b></div>
    <div class="casino-game-copy"><h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.desc)}</p></div>
    <div class="casino-game-footer"><span>${game.players}</span><button class="button primary small" data-action="play-game" data-game="${game.id}">Jugar ${icons.arrow}</button></div>
  </article>`;
}

function casinoTableRow(table) {
  const canDelete = isOwnTable(table) || state.user?.isAdmin;
  const players = table.players || [];
  const names = players.map(player => player.name || player.alias || player.email?.split('@')[0]).filter(Boolean);
  const status = table.status === 'finished' ? 'Finalizada' : table.status === 'waiting' ? 'En espera' : 'En juego';
  return `<article class="casino-table-row">
    <div class="casino-table-game"><span class="casino-private">${table.private ? '● Privada' : '○ Pública'}</span><h3>${escapeHtml(table.name)}</h3><p>${escapeHtml(table.gameName)} · ${escapeHtml(table.code)}</p></div>
    <div class="casino-table-detail"><span>Jugadores · ${players.length}/${table.maxPlayers}</span><strong>${escapeHtml(names.join(' · ') || 'Esperando jugadores')}</strong></div>
    <div class="casino-table-detail"><span>Estado</span><strong class="casino-status-${table.status}">${status}</strong></div>
    <div class="casino-table-actions"><button class="button dark small" data-action="join-table" data-code="${escapeHtml(table.code)}">Entrar</button>${canDelete ? `<button class="button danger small" data-action="delete-table" data-code="${escapeHtml(table.code)}">Eliminar</button>` : ''}</div>
  </article>`;
}

function premiumLobbyView() {
  const ownTable = state.tables.find(table => isOwnTable(table) && table.status !== 'finished');
  const name = escapeHtml((state.user?.name || 'miembro').split(' ')[0]);
  return `<div class="view casino-view casino-lobby">
    <section class="casino-lobby-hero">
      <div class="casino-room" aria-hidden="true"><i class="casino-chandelier"></i><i class="casino-window casino-window-a"></i><i class="casino-window casino-window-b"></i><i class="casino-chip casino-chip-a"></i><i class="casino-chip casino-chip-b"></i><i class="casino-cards"></i></div>
      <div class="casino-hero-content"><div class="eyebrow">Buenas noches, ${name}</div><h1>Tu mesa te espera.</h1><p>Las mejores partidas se juegan en buena compañía. Invita a tu círculo y deja que la noche avance carta a carta.</p><div class="casino-hero-buttons"><button class="button primary" data-modal="create">${icons.plus} Jugar ahora ${icons.arrow}</button><button class="button ghost" data-modal="join">${icons.link} Unirse con código</button></div></div>
      <aside class="casino-season-card"><div class="casino-season-title"><span>♛</span><strong>Tu temporada</strong><em>Nivel Oro</em></div><div class="casino-season-stat"><span>Partidas registradas</span><b>${state.user?.games || 0}</b><i></i></div><div class="casino-season-wallet"><span>Fichas en cartera</span><strong>${(state.user?.chips ?? 1250).toLocaleString('es-EC')} <small>R</small></strong></div></aside>
    </section>
    ${ownTable ? `<section class="casino-section casino-continue"><div class="casino-section-title"><span>Partida abierta</span><h2>Continúa donde lo dejaste.</h2><button class="text-button" data-action="resume">Ver mesa ${icons.arrow}</button></div><div class="casino-continue-card"><div><span class="casino-private">● En espera</span><h3>${escapeHtml(ownTable.name)}</h3><p>${escapeHtml(ownTable.gameName)} · código ${escapeHtml(ownTable.code)}</p></div><div><span>Participantes</span><strong>${ownTable.players.length}/${ownTable.maxPlayers}</strong></div><div><span>Creada</span><strong>${formatDate(ownTable.createdAt)}</strong></div><button class="button primary small" data-action="resume">Entrar</button></div></section>` : ''}
    <section class="casino-section casino-catalog-preview"><div class="casino-section-title"><span>Catálogo del club</span><h2>Una mesa para cada ánimo.</h2><button class="text-button" data-nav="games">Ver catálogo ${icons.arrow}</button></div><div class="casino-game-grid">${gameCatalog.map(casinoGameCard).join('')}</div></section>
    <section class="casino-section casino-club-tables"><div class="casino-section-title"><span>Royal Gold Club</span><h2>Mesas del club.</h2><button class="button ghost small" data-modal="create">${icons.plus} Crear mesa</button></div>${state.tables.length ? `<div class="casino-table-list">${state.tables.slice(0,4).map(casinoTableRow).join('')}</div>` : '<div class="casino-empty">Aún no hay mesas abiertas. Crea la primera mesa privada de tu círculo.</div>'}</section>
  </div>`;
}

function premiumGamesView() {
  return `<div class="view casino-view casino-games">
    <section class="casino-catalog-hero"><div class="casino-catalog-light" aria-hidden="true"></div><div><span class="eyebrow">Catálogo del club</span><h1>Una mesa para cada ánimo.</h1><p>Cada juego tiene su propio ritmo, reglas y manera de reunir a la gente. Elige una mesa, invita a tus amigos y juega.</p></div><div class="casino-catalog-chips" aria-hidden="true"><i>♠</i><i>♦</i><i>♣</i></div></section>
    <section class="casino-section"><div class="casino-section-title"><span>Juegos disponibles</span><h2>Elige tu próxima partida.</h2></div><div class="casino-game-grid casino-game-grid-large">${gameCatalog.map(casinoGameCard).join('')}</div></section>
    <div class="casino-note">${icons.info}<span>Las reglas, los turnos, el chat y la voz permanecen activos dentro de cada mesa.</span></div>
  </div>`;
}

function premiumFriendsView() {
  const query = state.social.query.trim().toLowerCase();
  const profiles = state.social.profiles.filter(profile => !query || `${profile.display_name} ${profile.handle}`.toLowerCase().includes(query));
  const relationships = state.social.friendships;
  const incoming = state.social.invitations.filter(item => item.invitee_id === state.user?.id);
  const memberRows = state.social.loading ? '<div class="casino-empty">Cargando jugadores del club…</div>' : profiles.length ? profiles.map(profile => {
    const relationship = socialRelationship(profile.id);
    const incomingFollow = relationship?.requester_id === profile.id && relationship?.addressee_id === state.user?.id && relationship?.status === 'pending';
    const followLabel = relationship?.status === 'accepted' ? 'Siguiendo' : incomingFollow ? 'Aceptar' : relationship?.status === 'pending' ? 'Pendiente' : 'Seguir';
    const followAction = incomingFollow ? 'accept-follow' : relationship?.status === 'accepted' || relationship?.status === 'pending' ? '' : 'follow-player';
    return `<article class="casino-member-row"><div class="casino-member-avatar">${initials(profile.handle || profile.display_name)}</div><div><h3>${escapeHtml(profile.handle || profile.display_name)}</h3><p><i class="${profile.presence === 'offline' ? 'offline-dot' : 'online-dot'}"></i>${socialPresenceLabel(profile)}${profile.presence === 'playing' ? ` · ${escapeHtml(profile.current_game || 'partida')}` : ''}</p></div><div class="casino-member-actions"><button class="button ghost small" ${followAction ? `data-action="${followAction}" data-user-id="${profile.id}"` : 'disabled'}>${followLabel}</button><button class="button dark small" data-action="invite-player" data-user-id="${profile.id}">Invitar a jugar</button>${relationship?.status === 'accepted' ? `<button class="button danger small" data-action="remove-friend" data-user-id="${profile.id}">Eliminar</button>` : ''}</div></article>`;
  }).join('') : '<div class="casino-empty">Todavía no hay otros jugadores para mostrar.</div>';
  const inviteRows = incoming.length ? incoming.map(invitation => `<article class="casino-invite-row"><div class="casino-member-avatar">${initials(socialProfile(invitation.inviter_id)?.display_name || 'RG')}</div><div><h3>${escapeHtml(socialProfile(invitation.inviter_id)?.display_name || 'Miembro Royal')}</h3><p>Te invita a una partida · ${formatDate(invitation.created_at)}</p></div><button class="button primary small" data-action="accept-game-invite" data-invitation-id="${invitation.id}">Aceptar</button><button class="button dark small" data-action="decline-game-invite" data-invitation-id="${invitation.id}">Rechazar</button></article>`).join('') : '<div class="casino-empty">No tienes invitaciones pendientes. Cuando alguien te invite, aparecerá aquí.</div>';
  return `<div class="view casino-view casino-friends">
    <section class="casino-friends-hero"><div><span class="eyebrow">Tu círculo</span><h1>Amigos</h1><p>Encuentra jugadores, agrega a tu círculo y envía solicitudes de partida cuando estén disponibles.</p></div><span class="casino-friends-crown" aria-hidden="true">♛</span></section>
    <div class="casino-friends-grid"><section class="casino-friends-panel casino-members"><div class="casino-panel-title"><div><span>Jugadores del club</span><h2>Tu mesa empieza aquí.</h2></div><button class="button ghost small" data-action="refresh-social">Actualizar</button></div><label class="casino-search">⌕<input id="social-search" value="${escapeHtml(state.social.query)}" placeholder="Buscar por nombre de usuario…" autocomplete="off" /></label><div class="casino-member-list">${memberRows}</div></section><aside class="casino-friends-panel casino-invites"><div class="casino-panel-title"><div><span>Invitaciones</span><h2>Solicitudes de partida</h2></div></div>${inviteRows}<div class="casino-circle-summary"><span>♚ Tu círculo</span><strong>${relationships.filter(item => item.status === 'accepted').length} conexiones aceptadas</strong><p>Los jugadores que aceptes aquí aparecerán en tus invitaciones de mesa.</p></div></aside></div>
  </div>`;
}

function resultRevealCard(card, kind) {
  if (!card) return '';
  if (kind === 'domino') return `<span class="result-domino-tile"><b>${escapeHtml(card.a)}</b><i></i><b>${escapeHtml(card.b)}</b></span>`;
  if (kind === 'uno') return `<span class="result-uno-card ${escapeHtml(card.color || 'black')}">${escapeHtml(displayCardLabel(card.label))}</span>`;
  if (kind === 'rummy') return `<span class="result-rummy-card ${['♥','♦'].includes(card.suit) ? 'red' : ''}">${rummyCardFace(card)}</span>`;
  return `<span class="result-playing-card ${['♥','♦'].includes(card.suit) ? 'red' : ''}"><small>${escapeHtml(card.rank || '?')}${escapeHtml(card.suit || '')}</small><strong>${escapeHtml(card.rank || '?')}</strong><em>${escapeHtml(card.suit || '')}</em></span>`;
}

function resultHandsMarkup(game) {
  const kind = game.kind === 'blackjack' ? 'blackjack' : game.kind;
  const winnerIds = new Set(game.winnerIds || (game.winnerId ? [game.winnerId] : []));
  const rows = (game.players || []).map(player => {
    const winner = winnerIds.has(player.id) || ['win', 'blackjack'].includes(player.result);
    const cards = player.hand || Array.from({length: player.handCount || 0}, () => ({hidden: true}));
    return `<article class="result-player ${winner ? 'winner' : ''}"><div class="result-player-head"><span class="result-avatar">${initials(player.name)}</span><div><strong>${escapeHtml(player.name)}${winner ? ' · Ganador' : ''}</strong><small>${escapeHtml(player.result || `${cards.length} cartas`)}</small></div></div><div class="result-player-hand">${cards.map(card => resultRevealCard(card, kind)).join('')}</div></article>`;
  });
  if (game.kind === 'blackjack' && game.dealer?.hand) rows.unshift(`<article class="result-player result-dealer"><div class="result-player-head"><span class="result-avatar">D</span><div><strong>Dealer</strong><small>${game.dealer.value ?? ''} puntos</small></div></div><div class="result-player-hand">${game.dealer.hand.map(card => resultRevealCard(card, 'blackjack')).join('')}</div></article>`);
  return rows.join('');
}

function resultOverlay(game) {
  if (!game?.finished) return '';
  const winners = finishedGameWinnerNames(game);
  const winnerText = winners.length ? winners.join(' y ') : 'La mesa';
  return `<div class="result-overlay result-reveal-overlay" role="dialog" aria-modal="true" aria-label="Resultado y cartas reveladas"><div class="result-card result-card-wide"><div class="eyebrow">Partida terminada</div><div class="result-crown">♛</div><div class="result-coins" aria-hidden="true"><span>🪙</span><span>🪙</span><span>🪙</span><span>🪙</span><span>🪙</span></div><h2>¡Felicidades ${escapeHtml(winnerText)}!</h2><p>Estas fueron las cartas y jugadas de todos los participantes.</p><section class="result-hands"><div class="result-hands-title"><span>Comparación final</span><strong>Manos reveladas</strong></div>${resultHandsMarkup(game)}</section><div class="result-summary"><span>Resultado</span><strong>${winners.length > 1 ? 'Empate' : 'Victoria'}</strong></div><div class="modal-actions"><button class="button dark" data-action="new-game">Nueva partida</button><button class="button primary" data-action="rematch">Revancha ${icons.arrow}</button></div></div></div>`;
}

function render() { app.innerHTML = state.user ? (state.view==='waiting' ? shell(waitingView()) : state.view==='table' ? shell(state.currentTable?.gameId==='blackjack' ? blackjackView() : state.currentTable?.gameId==='domino' ? dominoView() : state.currentTable?.gameId==='poker' ? pokerView() : state.currentTable?.gameId==='rummy' ? rummyView() : state.currentTable?.gameId==='crazy' ? crazyView() : tableView()) : shell(({lobby:premiumLobbyView,games:premiumGamesView,friends:premiumFriendsView,history:historyView,stats:statsView,settings:settingsView,profile:profileView}[state.view] || premiumLobbyView)())) : authView(); attachEvents(); ensureSoloOption(); attachResultOverlay(); if (state.user) connectRealtime(); if (state.user?.accessToken && !state.user.profileLoaded && !state.user.profileLoading) void loadOwnProfile(); if (state.user && ['friends','waiting'].includes(state.view) && !state.social.loaded && !state.social.loading) void loadSocial(); }
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-action]');if(!button)return;const action=button.dataset.action;if((action==='start-uno')&&['blackjack','domino','poker'].includes(state.currentTable?.gameId)){e.preventDefault();e.stopImmediatePropagation();if(rtSend('start_game'))toast(`Preparando partida de ${state.currentTable.gameId==='domino'?'dominó':state.currentTable.gameId==='poker'?'póker':'21'}…`);return;}if(action==='blackjack-hit'){blackjackAction('blackjack_hit');return;}if(action==='blackjack-stand'){blackjackAction('blackjack_stand');return;}if(action==='blackjack-replay'||action==='domino-replay'||action==='poker-replay'){if(rtSend('start_game'))toast('Preparando una nueva ronda…');return;}if(action==='domino-place'){const tile=button;const side=window.prompt('Escribe izquierda o derecha', 'derecha')?.toLowerCase().startsWith('i')?'left':'right';dominoAction('domino_place',{index:Number(tile.dataset.index),side});return;}if(action==='domino-draw'){dominoAction('domino_draw');return;}if(action==='domino-pass'){dominoAction('domino_pass');return;}if(action.startsWith('poker-')){const amount=action==='poker-raise'?Number(document.querySelector('#poker-raise-amount')?.value):undefined;pokerAction(action,amount);return;}}, true);
document.addEventListener('click', e => { const button = e.target.closest?.('[data-action]'); if (!button) return; const action = button.dataset.action; const gameId = state.currentTable?.gameId; if (gameId !== 'rummy') return; if (action === 'start-uno') { e.preventDefault(); e.stopImmediatePropagation(); if (rtSend('start_game')) toast('Preparando partida de Rummy…'); return; } if (action === 'rummy-draw-stock' || action === 'rummy-draw-discard') { e.preventDefault(); e.stopImmediatePropagation(); rummyAction(action); return; } if (action === 'rummy-select') { e.preventDefault(); e.stopImmediatePropagation(); const game = state.rummy; if (!game || game.activePlayerId !== state.realtime.playerId) return toast('Espera a que llegue tu turno', 'error'); if (game.phase !== 'discard') return toast('Primero roba una carta del pozo o del descarte', 'error'); const index = Number(button.dataset.index); const selected = state.rummySelection || []; state.rummySelection = selected.includes(index) ? selected.filter(item => item !== index) : [...selected, index]; render(); return; } if (action === 'rummy-discard-selected') { e.preventDefault(); e.stopImmediatePropagation(); const selected = state.rummySelection || []; if (selected.length !== 1) return toast(state.rummy?.phase === 'draw' ? 'Primero roba una carta y luego selecciona una para descartarla' : 'Selecciona una sola carta para descartarla', 'error'); state.rummySelection = []; rummyAction('rummy_discard', { index: selected[0] }); return; } if (action === 'rummy-discard') { e.preventDefault(); e.stopImmediatePropagation(); state.rummySelection = []; rummyAction(action, { index: Number(button.dataset.index) }); return; } if (action === 'rummy-meld') { e.preventDefault(); e.stopImmediatePropagation(); const indices = state.rummySelection || []; if (indices.length < 3) return toast(state.rummy?.phase === 'draw' ? 'Primero roba una carta y luego selecciona 3 o más' : 'Selecciona al menos tres cartas', 'error'); state.rummySelection = []; rummyAction(action, { indices }); return; } if (action === 'rummy-replay') { e.preventDefault(); e.stopImmediatePropagation(); state.rummySelection = []; if (rtSend('start_game')) toast('Preparando una nueva ronda…'); } }, true);
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-action]');if(!button)return;const action=button.dataset.action;const gameId=state.currentTable?.gameId;if(action==='start-uno'&&gameId==='crazy'){e.preventDefault();e.stopImmediatePropagation();if(rtSend('start_game'))toast('Preparando partida de Crazy Eights…');return;}if(action==='crazy-draw-card'){e.preventDefault();e.stopImmediatePropagation();crazyAction(action);return;}if(action==='crazy-play-card'){e.preventDefault();e.stopImmediatePropagation();const card=state.crazy?.hand?.[Number(button.dataset.index)];const chosenSuit=card?.rank==='8'?(window.prompt('Elige el nuevo palo: ♠, ♥, ♦ o ♣','♠')||'').trim():undefined;if(card?.rank==='8'&&!['♠','♥','♦','♣'].includes(chosenSuit))return toast('Palo inválido','error');crazyAction(action,{index:Number(button.dataset.index),chosenSuit});return;}if(action==='crazy-replay'){e.preventDefault();e.stopImmediatePropagation();if(rtSend('start_game'))toast('Preparando una nueva ronda…');}}, true);
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-action]');if(!button)return;const action=button.dataset.action;if(action==='play-game'){setTimeout(()=>{const gameSelect=document.querySelector('#create-form select[name="game"]');const max=document.querySelector('#create-form select[name="max"]');if(gameSelect&&max){gameSelect.value=button.dataset.game;max.innerHTML=maxOptionsMarkup(button.dataset.game);}},25);}if(action==='leave-table'){clearTimeout(state.realtime.reconnectTimer);state.realtime.reconnectTimer=null;state.currentTable=null;state.uno=null;state.blackjack=null;state.domino=null;state.poker=null;state.rummy=null;state.crazy=null;save();}if(action==='logout'){clearTimeout(state.realtime.reconnectTimer);state.realtime.reconnectTimer=null;state.modal=null;state.view='lobby';}}, true);
document.addEventListener('click', async event => {
  const button = event.target.closest?.('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'follow-player') return followPlayer(button.dataset.userId);
  if (action === 'accept-follow') return answerFollow(button.dataset.userId, 'accepted');
  if (action === 'remove-friend') return removeFriend(button.dataset.userId);
  if (action === 'invite-player') return sendGameInvite(button.dataset.userId);
  if (action === 'refresh-social') { state.social.loaded = false; return loadSocial(); }
  if (action === 'accept-game-invite' || action === 'decline-game-invite') {
    const invitation = state.social.invitations.find(item => item.id === button.dataset.invitationId);
    if (invitation) return answerGameInvite(invitation, action === 'accept-game-invite' ? 'accepted' : 'declined');
  }
});
document.addEventListener('change', event => {
  if (event.target.id !== 'social-search') return;
  state.social.query = String(event.target.value || '');
  render();
});
document.addEventListener('click', async event => {
  const button = event.target.closest?.('[data-action="delete-account"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const confirmed = window.confirm('¿Eliminar tu cuenta de forma permanente? Se borrarán tu perfil, fichas, historial, mesas, amistades, invitaciones y notificaciones. Esta acción no se puede deshacer.');
  if (!confirmed) return;
  button.disabled = true;
  try {
    await deleteAccount();
  } catch (error) {
    button.disabled = false;
    toast(error.message || 'No se pudo eliminar la cuenta', 'error');
  }
}, true);
document.addEventListener('input', event => {
  if (event.target.id !== 'table-invite-search') return;
  state.social.tableQuery = String(event.target.value || '');
  clearTimeout(state.social.tableSearchTimer);
  state.social.tableSearchTimer = setTimeout(() => render(), 220);
});
document.addEventListener('change',e=>{const select=e.target.closest?.('#create-form select[name="game"]');if(!select)return;const max=document.querySelector('#create-form select[name="max"]');if(!max)return;max.innerHTML=maxOptionsMarkup(select.value);});
document.addEventListener('click',event=>{const button=event.target.closest?.('[data-nav]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();state.view=button.dataset.nav;state.modal=null;render();},true);
document.addEventListener('click',e=>{const google=e.target.closest?.('#google-login');if(!google)return;e.preventDefault();startGoogleAuth()});
document.addEventListener('click',e=>{const demo=e.target.closest?.('#demo-login');if(!demo)return;e.preventDefault();state.user={name:'B. Alvear',email:'byvera198@gmail.com',role:'admin',isAdmin:true,chips:1250,games:0,wins:0};state.view='lobby';state.modal=null;state.currentTable=null;save();toast('Cuenta de desarrollador local iniciada','success');render()});
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-action="delete-table"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const code = button.dataset.code || state.currentTable?.code;
  const table = state.tables.find(item => item.code === code) || state.currentTable;
  if (!isOwnTable(table)) {
    toast('Solo el creador puede eliminar la mesa', 'error');
    return;
  }
  if (!code || !window.confirm('¿Eliminar esta mesa para todos los jugadores? Esta acción no se puede deshacer.')) return;
  if (rtSend('delete_table', { code })) {
    toast('Eliminando mesa…');
    return;
  }
  state.tables = state.tables.filter(item => item.code !== code);
  if (state.currentTable?.code === code) {
    state.currentTable = null;
    state.view = 'lobby';
  }
  save();
  render();
  toast('Mesa eliminada', 'success');
}, true);
function gameHelpStorageKey() {
  return `rgc-game-help:${state.user?.id || state.user?.email || 'guest'}`;
}
function gameHelpVisible() {
  return storage.getItem(gameHelpStorageKey()) !== 'off';
}
function gameHelpContent(gameId) {
  const content = {
    uno: { title: 'Cómo jugar UNO', goal: 'Quédate sin cartas antes que los demás.', steps: ['En tu turno, juega una carta del mismo color, número o símbolo que la carta de descarte.', 'Si no puedes jugar, pulsa “Robar carta”. Si la carta sirve, podrás continuar según las reglas de la mesa.', 'Cuando te quede una carta, pulsa “¡UNO!”. Gana quien se quede sin cartas.'] },
    blackjack: { title: 'Cómo jugar 21 · Blackjack', goal: 'Acércate a 21 sin pasarte y supera la mano del dealer.', steps: ['Empiezas con dos cartas y el dealer muestra una carta.', 'Pulsa “Pedir carta” para recibir otra o “Plantarse” para conservar tu puntuación.', 'Si superas 21 pierdes automáticamente. El dealer juega después; gana la mejor puntuación sin pasarse.'] },
    domino: { title: 'Cómo jugar Dominó', goal: 'Coloca tus fichas haciendo coincidir sus números con los extremos de la cadena.', steps: ['En tu turno, selecciona una ficha jugable y elige el extremo izquierdo o derecho.', 'Si no tienes una ficha válida, pulsa “Robar del pozo”; si no puedes jugar, puedes pasar.', 'Gana quien se quede sin fichas primero. Si la mesa se bloquea, gana la puntuación más favorable.'] },
    poker: { title: 'Cómo jugar Texas Hold’em', goal: 'Forma la mejor combinación de cinco cartas y gana el bote virtual.', steps: ['Recibes dos cartas privadas y se descubren cartas comunitarias por rondas.', 'En tu turno puedes retirarte, pasar, igualar, subir o ir all-in según las opciones disponibles.', 'Al final, la mejor mano de cinco cartas gana. Las fichas son virtuales y no tienen valor monetario.'] },
    rummy: { title: 'Cómo jugar Rummy', goal: 'Forma combinaciones y quédate sin cartas.', steps: ['Cada turno empieza robando una carta del pozo o la carta superior del descarte.', 'Selecciona tres o más cartas para formar grupos del mismo valor o escaleras del mismo palo.', 'Después descarta una carta. Gana quien vacíe su mano o tenga la mejor puntuación al cerrar la ronda.'] },
    crazy: { title: 'Cómo jugar Crazy Eights', goal: 'Sé el primero en quedarte sin cartas.', steps: ['Juega una carta del mismo palo o valor que la carta de descarte.', 'El 8 es comodín: al jugarlo, elige el nuevo palo.', 'Si no puedes jugar, pulsa “Robar”. Continúa hasta que un jugador se quede sin cartas.'] }
  };
  return content[gameId] || content.uno;
}
function gameHelpPanel(gameId) {
  const help = gameHelpContent(gameId);
  if (!gameHelpVisible()) return '<button class="game-help-toggle button ghost small" data-action="toggle-game-help">Mostrar ayuda</button>';
  return `<section class="game-help-panel"><div class="game-help-copy"><div class="eyebrow">Guía rápida</div><h3>${help.title}</h3><p><strong>Objetivo:</strong> ${help.goal}</p><ol>${help.steps.map(step => `<li>${step}</li>`).join('')}</ol></div><button class="button ghost small" data-action="toggle-game-help">Ocultar ayuda</button></section>`;
}
function ensureGameHelp() {
  if (state.view !== 'table' || !state.currentTable?.gameId) return;
  const root = document.querySelector('.game-table-wrap');
  if (!root || root.querySelector('.game-help-panel, .game-help-toggle')) return;
  const anchor = root.querySelector('.table-top') || root.firstElementChild;
  if (anchor) anchor.insertAdjacentHTML('afterend', gameHelpPanel(state.currentTable.gameId));
}
function ensureProfileLogout() {
  if (state.view !== 'profile' || document.querySelector('[data-action="logout"]')) return;
  const grid = document.querySelector('.subpage-grid');
  if (!grid) return;
  const panel = document.createElement('section');
  panel.className = 'panel profile-account-panel';
  panel.innerHTML = '<h3>Cuenta</h3><p class="muted" style="font-size:12px;line-height:1.6">Puedes cerrar tu sesión en cualquier momento. Tus partidas guardadas permanecen en tu cuenta.</p><div class="account-actions"><button class="button dark small" data-action="logout">Cerrar sesión</button></div>';
  grid.append(panel);
}
async function logoutUser() {
  if (state.voiceOn) await toggleVoice().catch(() => {});
  rtSend('leave_table');
  if (state.user?.accessToken) await supabaseAuth('logout', { method: 'POST', token: state.user.accessToken }).catch(() => {});
  clearTimeout(state.realtime.reconnectTimer);
  state.realtime.reconnectTimer = null;
  state.realtime.ws?.close();
  state.realtime.ws = null;
  state.realtime.connected = false;
  state.realtime.playerId = null;
  state.user = null;
  state.currentTable = null;
  state.modal = null;
  state.view = 'lobby';
  state.social = { profiles: [], friendships: [], invitations: [], loaded: false, loading: false, query: '' };
  clearGameState();
  save();
  render();
  toast('Sesión cerrada', 'success');
}
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-action="toggle-game-help"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  storage.setItem(gameHelpStorageKey(), gameHelpVisible() ? 'off' : 'on');
  render();
}, true);
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-action]');
  if (!button || state.view !== 'table') return;
  const action = button.dataset.action;
  if (action === 'toggle-panel') {
    event.preventDefault();
    event.stopImmediatePropagation();
    state.tablePanelOpen = !state.tablePanelOpen;
    if (state.uno) state.uno.panelOpen = state.tablePanelOpen;
    render();
    return;
  }
  if (action === 'mute-player') {
    event.preventDefault();
    event.stopImmediatePropagation();
    const peerId = button.dataset.playerId;
    setPeerMuted(peerId, !state.voice.mutedPlayers.has(peerId));
    render();
  }
}, true);
const originalRender = render;
render = function () {
  originalRender();
  ensureTableSocialPanel();
  ensureGameHelp();
  ensureProfileLogout();
};
document.addEventListener('click', async event => {
  const button = event.target.closest?.('[data-action="logout"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  await logoutUser();
}, true);
const originalTableRow = tableRow;
tableRow = function (table) {
  const wasAdmin = Boolean(state.user?.isAdmin);
  if (wasAdmin) state.user.isAdmin = false;
  try { return originalTableRow(table); }
  finally { if (wasAdmin && state.user) state.user.isAdmin = true; }
};
const originalEnsureSoloOption = ensureSoloOption;
ensureSoloOption = function () {
  originalEnsureSoloOption();
  const leaveButton = document.querySelector('.view.waiting [data-nav="lobby"]');
  if (leaveButton) {
    delete leaveButton.dataset.nav;
    leaveButton.dataset.action = 'leave-table';
    leaveButton.textContent = '← Salir de la mesa';
    leaveButton.addEventListener('click', async () => {
      if (state.voiceOn) await toggleVoice();
      rtSend('leave_table');
      state.view = 'lobby';
      state.modal = null;
      render();
    }, { once: true });
  }
};
render();
restoreOAuthSession();
restoreRemoteSession();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
