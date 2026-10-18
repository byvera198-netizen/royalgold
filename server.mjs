import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { createGame, drawCard, isPlayable as unoPlayable, playCard, serializeGame } from './games/uno.mjs';
import { createGame as createBlackjackGame, handValue as blackjackHandValue, hit as blackjackHit, stand as blackjackStand, serializeGame as serializeBlackjackGame } from './games/blackjack.mjs';
import { createGame as createDominoGame, botMove as dominoBotMove, drawTile as dominoDraw, placeTile as dominoPlace, pass as dominoPass, serializeGame as serializeDominoGame } from './games/domino.mjs';
import { act as pokerAct, createGame as createPokerGame, serializeGame as serializePokerGame } from './games/poker.mjs';
import { createGame as createRummyGame, discardCard as rummyDiscard, drawDiscard as rummyDrawDiscard, drawStock as rummyDrawStock, layMeld as rummyLayMeld, serializeGame as serializeRummyGame } from './games/rummy.mjs';
import { createGame as createCrazyGame, drawCard as crazyDrawCard, isPlayable as crazyPlayable, playCard as crazyPlayCard, serializeGame as serializeCrazyGame } from './games/crazy-eights.mjs';
import { createStore } from './server/store.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml' };
const rooms = new Map();
const store = await createStore();
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseSecretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const adminEmails = new Set(['byvera198@gmail.com']);
const voiceIceServers = [
  { urls: process.env.VOICE_STUN_URL || 'stun:stun.l.google.com:19302' },
  ...(process.env.VOICE_TURN_URL ? [{
    urls: String(process.env.VOICE_TURN_URL),
    username: String(process.env.VOICE_TURN_USERNAME || ''),
    credential: String(process.env.VOICE_TURN_CREDENTIAL || '')
  }] : [])
];
async function verifyAccessToken(token) {
  if (store.mode !== 'supabase' || !token || !supabaseUrl || !supabaseSecretKey) return null;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseSecretKey, Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}
async function deleteSupabaseAccount(token, userId) {
  if (store.mode !== 'supabase' || !supabaseUrl || !supabaseSecretKey) throw new Error('La eliminación segura no está disponible en este entorno');
  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/delete_my_account`, {
    method: 'POST',
    headers: { apikey: supabaseSecretKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const rpcData = await rpcResponse.json().catch(() => ({}));
  if (!rpcResponse.ok) throw new Error(rpcData.message || rpcData.hint || rpcData.details || 'No se pudieron eliminar los datos de la cuenta');

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { apikey: supabaseSecretKey, Authorization: `Bearer ${supabaseSecretKey}` }
  });
  const authData = await authResponse.json().catch(() => ({}));
  if (!authResponse.ok && authResponse.status !== 404) throw new Error(authData.message || authData.msg || 'No se pudo eliminar la cuenta de autenticación');
}
function removeDeletedUserFromRooms(userId) {
  for (const [code, room] of rooms) {
    for (const participant of [...room.clients.values()]) {
      if (participant.userId !== userId) continue;
      room.clients.delete(participant.id);
      participant.roomCode = null;
      if (participant.ws) participant.ws.close(1000, 'account deleted');
    }
    if (!room.clients.size) rooms.delete(code);
    else { broadcastRoom(room); if (room.game) broadcastGame(room); }
  }
}
async function setPresence(userId, presence) {
  if (store.mode !== 'supabase' || !supabaseUrl || !supabaseSecretKey || !userId) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { apikey: supabaseSecretKey, Authorization: `Bearer ${supabaseSecretKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ presence, updated_at: new Date().toISOString() })
    });
  } catch (presenceError) { console.error('Royal Gold presence error:', presenceError.message); }
}
function syncRoomPresence(room) {
  const presence = room.table.status === 'playing' ? 'playing' : 'online';
  for (const participant of room.clients.values()) if (participant.userId && !participant.isBot) void setPresence(participant.userId, presence);
}
for (const table of await store.listTables()) rooms.set(table.code, { table, clients: new Map(), playerEmails: new Map(), chat: [], game: null, roundId: null, needsRecoveryStart: table.status === 'playing' });
const heartbeatMs = 30000;

function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return 'ROYAL-' + [...bytes].map(byte => chars[byte % chars.length]).join('');
}
function send(ws, type, payload = {}) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}
function publicTable(room) {
  return {
    ...room.table,
    players: [...room.clients.values()].map(client => ({ id: client.id, name: client.name, email: client.email, connected: client.ws ? client.ws.readyState === 1 : true, voiceActive: Boolean(client.voiceActive) }))
  };
}
function publicGame(room, client) {
  if (!room.game) return null;
  if (room.game.kind === 'blackjack') return serializeBlackjackGame(room.game, client.id);
  if (room.game.kind === 'domino') return serializeDominoGame(room.game, client.id);
  if (room.game.kind === 'poker') return serializePokerGame(room.game, client.id);
  if (room.game.kind === 'rummy') return serializeRummyGame(room.game, client.id);
  if (room.game.kind === 'crazy') return serializeCrazyGame(room.game, client.id);
  return serializeGame(room.game, client.id);
}
function broadcastRoom(room) {
  for (const client of room.clients.values()) send(client.ws, 'room_state', { table: publicTable(room) });
}
function broadcastGame(room) {
  for (const client of room.clients.values()) send(client.ws, 'game_state', { game: publicGame(room, client) });
}
function error(ws, message) { send(ws, 'error', { message }); }
function resultFor(room, client) {
  const game = room.game;
  const me = game?.players?.find(player => player.id === client.id);
  const winner = game?.winnerId === client.id || game?.winnerIds?.includes(client.id) || me?.result === 'win' || me?.result === 'blackjack';
  const result = game?.kind === 'blackjack' ? ({ blackjack: 'Blackjack', win: 'Victoria', push: 'Empate', lose: 'Derrota', bust: 'Te pasaste' }[me?.result] || 'Partida terminada') : winner ? 'Victoria' : 'Partida terminada';
  return { id: `${room.table.id}:${room.roundId}`, gameId: room.table.gameId, gameName: room.table.gameName, date: new Date().toISOString(), result, delta: winner ? 50 : 0, won: winner };
}
function broadcastResult(room) { if (!room.game?.finished) return; for (const client of room.clients.values()) send(client.ws, 'game_result', { result: resultFor(room, client) }); }

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (req.method === 'DELETE' && urlPath === '/api/account') {
    const authorization = String(req.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const verifiedUser = await verifyAccessToken(token);
    if (!verifiedUser?.id) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: 'La sesión no es válida o ya expiró' }));
      return;
    }
    try {
      await deleteSupabaseAccount(token, verifiedUser.id);
      removeDeletedUserFromRooms(verifiedUser.id);
      res.writeHead(204);
      res.end();
    } catch (deleteError) {
      console.error('Royal Gold account deletion error:', deleteError.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: deleteError.message || 'No se pudo eliminar la cuenta' }));
    }
    return;
  }
  if (urlPath === '/health') {
    const body = JSON.stringify({ status: 'ok', realtime: true, storage: store.mode, rooms: rooms.size, checkedAt: new Date().toISOString() });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); return;
  }
  const safePath = normalize(urlPath === '/' ? '/index.html' : urlPath);
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found');
  }
});

const botDelay = ms => new Promise(resolve => setTimeout(resolve, ms));
function botForTurn(room) {
  const game = room.game;
  if (!game || game.finished) return null;
  const playerId = game.kind === 'blackjack' ? game.players[game.activePlayer]?.id : game.kind === 'uno' ? game.players[game.turn]?.id : game.players[game.currentPlayer]?.id;
  const client = playerId ? room.clients.get(playerId) : null;
  return client?.isBot ? client : null;
}
function chooseColor(hand) {
  const counts = new Map();
  for (const card of hand) if (card.color && card.color !== 'black') counts.set(card.color, (counts.get(card.color) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'red';
}
function chooseSuit(hand) {
  const counts = new Map();
  for (const card of hand) counts.set(card.suit, (counts.get(card.suit) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '♠';
}
function rummyDiscardIndex(hand) {
  const values = { A: 14, K: 13, Q: 12, J: 11 };
  return hand.reduce((best, card, index) => (Number(card.rank) || values[card.rank] || 0) > (Number(hand[best]?.rank) || values[hand[best]?.rank] || 0) ? index : best, 0);
}
// The bot receives only its own hand and public table state for decisions.
function botDecisionView(game, botId) {
  const player = game?.players?.find(item => item.id === botId);
  if (!player) return null;
  return { hand: player.hand.map(card => ({ ...card })), topDiscard: game.discard?.at(-1) || null, currentColor: game.currentColor, currentSuit: game.currentSuit, currentBet: game.currentBet, playerBet: player.bet };
}
function botStep(room) {
  const game = room.game;
  const bot = botForTurn(room);
  if (!bot) return false;
  const view = botDecisionView(game, bot.id);
  if (!view) return false;
  if (game.kind === 'uno') {
    const index = view.hand.findIndex(card => unoPlayable(card, view.topDiscard, view.currentColor));
    if (index >= 0) playCard(game, bot.id, index, chooseColor(view.hand)); else drawCard(game, bot.id);
    return true;
  }
  if (game.kind === 'crazy') {
    const index = view.hand.findIndex(card => crazyPlayable(card, view.topDiscard, view.currentSuit));
    if (index >= 0) crazyPlayCard(game, bot.id, index, chooseSuit(view.hand)); else crazyDrawCard(game, bot.id);
    return true;
  }
  if (game.kind === 'domino') { dominoBotMove(game, bot.id); return true; }
  if (game.kind === 'blackjack') {
    if (blackjackHandValue(view.hand) < 16) blackjackHit(game, bot.id); else blackjackStand(game, bot.id);
    return true;
  }
  if (game.kind === 'poker') {
    const toCall = Math.max(0, view.currentBet - view.playerBet);
    pokerAct(game, bot.id, toCall ? 'call' : 'check');
    return true;
  }
  if (game.kind === 'rummy') {
    if (game.phase === 'draw') rummyDrawStock(game, bot.id);
    else rummyDiscard(game, bot.id, rummyDiscardIndex(view.hand));
    return true;
  }
  return false;
}
function recoverBotStep(room) {
  const game = room.game;
  const bot = botForTurn(room);
  if (!game || !bot) return false;
  const view = botDecisionView(game, bot.id);
  if (!view) return false;
  try {
    if (game.kind === 'uno') { drawCard(game, bot.id); return true; }
    if (game.kind === 'crazy') { crazyDrawCard(game, bot.id); return true; }
    if (game.kind === 'blackjack') { blackjackStand(game, bot.id); return true; }
    if (game.kind === 'domino') { dominoPass(game, bot.id); return true; }
    if (game.kind === 'poker') { pokerAct(game, bot.id, 'fold'); return true; }
    if (game.kind === 'rummy') {
      if (game.phase === 'draw') rummyDrawStock(game, bot.id);
      else rummyDiscard(game, bot.id, rummyDiscardIndex(view.hand));
      return true;
    }
  } catch (recoveryError) { console.error('Royal Gold AI recovery error:', recoveryError); }
  return false;
}
async function runBotTurns(room) {
  if (!botForTurn(room) || room.botRunning) return;
  room.botRunning = true;
  try {
    for (let turn = 0; turn < 200 && room.game && !room.game.finished; turn += 1) {
      if (!botForTurn(room)) break;
      await botDelay(650);
      try { botStep(room); }
      catch (botError) {
        console.error('Royal Gold AI turn error:', botError);
        if (!recoverBotStep(room)) break;
      }
      if (room.game.finished) { room.table.status = 'finished'; broadcastResult(room); }
      await store.saveTable(room.table);
      broadcastGame(room); broadcastRoom(room);
    }
  } catch (botError) { console.error('Royal Gold AI error:', botError); }
  finally { room.botRunning = false; }
}
async function startRoomGame(room, client) {
  if (!['uno', 'blackjack', 'domino', 'poker', 'rummy', 'crazy'].includes(room.table.gameId)) return error(client.ws, 'Esta mesa todavía no tiene un motor jugable');
  if (room.clients.size < 2) return error(client.ws, 'Se necesitan al menos dos participantes');
  const maxPlayersByGame = { uno: 10, blackjack: 7, domino: 4, poker: 9, rummy: 4, crazy: 6 };
  if (room.clients.size > maxPlayersByGame[room.table.gameId]) return error(client.ws, `Esta mesa admite máximo ${maxPlayersByGame[room.table.gameId]} participantes`);
  if (room.table.hostId ? room.table.hostId !== client.userId : room.table.host !== client.email) return error(client.ws, 'Solo el anfitrión puede iniciar la partida');
  if (room.game && !room.game.finished) return error(client.ws, 'La partida ya está en curso');
  room.table.status = 'playing'; room.roundId = randomUUID();
  const players = [...room.clients.values()].map(({ id, name }) => ({ id, name }));
  try { room.game = room.table.gameId === 'blackjack' ? createBlackjackGame(players) : room.table.gameId === 'domino' ? createDominoGame(players) : room.table.gameId === 'poker' ? createPokerGame(players) : room.table.gameId === 'rummy' ? createRummyGame(players) : room.table.gameId === 'crazy' ? createCrazyGame(players) : createGame(players); }
  catch (gameError) { room.table.status = 'waiting'; return error(client.ws, gameError.message); }
  await store.saveTable(room.table); syncRoomPresence(room); broadcastRoom(room); broadcastGame(room); void runBotTurns(room);
}
async function recoverInterruptedRoom(room) {
  if (!room.needsRecoveryStart || room.game || room.clients.size < 2) return;
  const host = [...room.clients.values()].find(participant => room.table.hostId ? participant.userId === room.table.hostId : participant.email === room.table.host);
  if (!host) return;
  room.needsRecoveryStart = false;
  await startRoomGame(room, host);
}
async function deleteRoom(room, requester, ws) {
  await store.closeTable(room.table.id);
  const participants = [...room.clients.values()];
  rooms.delete(room.table.code);
  const notification = { code: room.table.code, message: 'La mesa fue eliminada por el anfitrión' };
  for (const participant of participants) {
    send(participant.ws, 'table_deleted', notification);
    participant.roomCode = null;
    if (participant.userId && !participant.isBot) void setPresence(participant.userId, 'online');
  }
  if (!participants.some(participant => participant.id === requester.id)) send(ws, 'table_deleted', notification);
  requester.roomCode = null;
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const client = { ws, id: randomUUID(), userId: '', name: 'Miembro Royal', email: '', roomCode: null, voiceActive: false, windowStartedAt: Date.now(), messagesInWindow: 0 };
  ws.on('message', async raw => {
    const now = Date.now();
    if (now - client.windowStartedAt >= 10000) { client.windowStartedAt = now; client.messagesInWindow = 0; }
    client.messagesInWindow += 1;
    if (client.messagesInWindow > 120) { error(ws, 'Demasiados mensajes; intenta de nuevo en unos segundos'); return; }
    let message;
    try { message = JSON.parse(raw.toString()); } catch { error(ws, 'Mensaje inválido'); return; }
    const { type } = message;
    const normalizedType = String(type || '').replaceAll('-', '_');
    if (type === 'hello') {
      const verifiedUser = store.mode === 'supabase' ? await verifyAccessToken(String(message.authToken || '')) : null;
      if (store.mode === 'supabase' && !verifiedUser?.id) { error(ws, 'Sesión no válida; vuelve a iniciar sesión'); ws.close(1008, 'unauthorized'); return; }
      client.name = String(message.alias || verifiedUser?.user_metadata?.handle || verifiedUser?.user_metadata?.user_name || verifiedUser?.user_metadata?.display_name || message.name || 'Miembro Royal').slice(0, 40);
      client.email = String(verifiedUser?.email || message.email || '').slice(0, 120);
      client.userId = String(verifiedUser?.id || message.userId || '').slice(0, 80);
      const isAdmin = adminEmails.has(client.email.toLowerCase());
      void setPresence(client.userId, 'online');
      send(ws, 'connected', { playerId: client.id, role: isAdmin ? 'admin' : 'player', isAdmin, iceServers: voiceIceServers });
      return;
    }
    if (type === 'create_table') {
      const code = roomCode();
      if (store.mode === 'supabase' && !client.userId) return error(ws, 'Inicia sesión para crear una mesa persistente');
      const solo = message.solo === true;
      const table = { id: randomUUID(), code, name: String(message.name || 'Mesa Royal').slice(0, 60), gameId: message.gameId === 'uno' ? 'uno' : String(message.gameId || 'uno'), gameName: String(message.gameName || 'UNO'), maxPlayers: solo ? 2 : Math.max(2, Math.min(10, Number(message.maxPlayers) || 4)), private: message.private !== false, voice: message.voice !== false, stake: Math.max(0, Number(message.stake) || 0), solo, status: 'waiting', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), host: client.email, hostId: client.userId || null };
      const room = { table, clients: new Map(), playerEmails: new Map(), chat: [], game: null, roundId: null, botRunning: false, needsRecoveryStart: false };
      rooms.set(code, room); room.clients.set(client.id, client); if (client.email) room.playerEmails.set(client.email, client.id); client.roomCode = code;
      if (solo) { const bot = { ws: null, isBot: true, id: `bot-${randomUUID()}`, name: 'Royal Gold AI', email: `bot-${randomUUID()}@royal.gold`, roomCode: code, voiceActive: false }; room.clients.set(bot.id, bot); room.playerEmails.set(bot.email, bot.id); }
      try { await store.saveTable(table); } catch (storageError) { rooms.delete(code); client.roomCode = null; return error(ws, 'No se pudo guardar la mesa. Intenta de nuevo en unos segundos'); }
      send(ws, 'table_created', { table: publicTable(room) }); broadcastRoom(room); if (solo) await startRoomGame(room, client); return;
    }
    if (type === 'join_table') {
      const code = String(message.code || '').trim().toUpperCase(); let room = rooms.get(code);
      if (!room) {
        const storedTable = await store.findTableByCode(code);
        if (!storedTable) return error(ws, 'No encontramos una mesa con ese código');
        room = { table: storedTable, clients: new Map(), playerEmails: new Map(), chat: [], game: null, roundId: null, botRunning: false, needsRecoveryStart: storedTable.status === 'playing' };
        rooms.set(code, room);
      }
      if (new Date(room.table.expiresAt) <= new Date()) { rooms.delete(code); await store.closeTable(room.table.id); return error(ws, 'El código de esta mesa ya caducó'); }
      const returningId = client.email ? room.playerEmails.get(client.email) : null;
      const existing = returningId ? room.clients.get(returningId) : null;
      if (existing?.ws?.readyState === 1) return error(ws, 'Este miembro ya está conectado a la mesa');
      if (room.clients.size >= room.table.maxPlayers && !returningId) return error(ws, 'Esta mesa ya está completa');
      if (returningId && !existing) client.id = returningId;
      room.clients.set(client.id, client); if (client.email) room.playerEmails.set(client.email, client.id); client.roomCode = code;
      if (room.table.status === 'playing' && !room.game) {
        room.needsRecoveryStart = true;
        room.table.status = 'waiting';
        await store.saveTable(room.table);
      }
      if (returningId) send(ws, 'connected', { playerId: client.id, resumed: true });
      send(ws, 'joined_table', { table: publicTable(room) });
      room.chat ||= [];
      send(ws, 'chat_history', { messages: room.chat });
      broadcastRoom(room);
      if (room.game) { send(ws, 'game_state', { game: publicGame(room, client) }); if (room.game.finished) send(ws, 'game_result', { result: resultFor(room, client) }); }
      else await recoverInterruptedRoom(room);
      return;
    }
    if (type === 'add_bot') {
      const room = rooms.get(client.roomCode); if (!room || room.clients.size >= room.table.maxPlayers) return;
      if (room.table.solo) return error(ws, 'Esta mesa ya tiene un rival de Royal Gold AI');
      const bot = { ws: null, isBot: true, id: `bot-${randomUUID()}`, name: `Rival de prueba ${String(room.clients.size).padStart(2, '0')}`, email: `bot-${room.clients.size}@local`, roomCode: client.roomCode, voiceActive: false };
      room.table.solo = true;
      room.clients.set(bot.id, bot); room.playerEmails.set(bot.email, bot.id);
      await store.saveTable(room.table);
      broadcastRoom(room); return;
    }
    if (type === 'delete_table') {
      const code = String(message.code || client.roomCode || '').trim().toUpperCase();
      const targetRoom = rooms.get(code);
      if (!targetRoom) {
        const storedTable = await store.findTableByCode(code);
        if (!storedTable) return send(ws, 'table_deleted', { code, message: 'La mesa ya no estaba disponible y se retiró de tu listado' });
        const storedIsHost = storedTable.hostId ? storedTable.hostId === client.userId : storedTable.host === client.email;
        if (!storedIsHost) return error(ws, 'Solo el creador puede eliminar la mesa');
        try { await store.closeTable(storedTable.id); }
        catch (deleteError) { return error(ws, deleteError.message || 'No se pudo eliminar la mesa'); }
        return send(ws, 'table_deleted', { code, message: 'Mesa eliminada correctamente' });
      }
      const isHost = targetRoom.table.hostId ? targetRoom.table.hostId === client.userId : targetRoom.table.host === client.email;
      if (!isHost) return error(ws, 'Solo el creador puede eliminar la mesa');
      try { await deleteRoom(targetRoom, client, ws); }
      catch (deleteError) { return error(ws, deleteError.message || 'No se pudo eliminar la mesa'); }
      return;
    }
    const room = rooms.get(client.roomCode);
    if (!room) return error(ws, 'Primero debes entrar a una mesa');
    if (type === 'voice_join') {
      client.voiceActive = true;
      const peers = [...room.clients.values()].filter(participant => participant.id !== client.id && participant.voiceActive).map(participant => ({ id: participant.id, name: participant.name }));
      send(ws, 'voice_peers', { peers });
      for (const participant of room.clients.values()) if (participant.id !== client.id && participant.voiceActive) send(participant.ws, 'voice_peer_joined', { peer: { id: client.id, name: client.name } });
      broadcastRoom(room);
      return;
    }
    if (type === 'voice_leave') {
      client.voiceActive = false;
      for (const participant of room.clients.values()) if (participant.id !== client.id && participant.voiceActive) send(participant.ws, 'voice_peer_left', { peerId: client.id });
      broadcastRoom(room);
      return;
    }
    if (type === 'voice_signal') {
      const target = room.clients.get(String(message.to || ''));
      if (!target || !target.voiceActive) return error(ws, 'El participante de voz ya no está disponible');
      send(target.ws, 'voice_signal', { from: client.id, signal: message.signal });
      return;
    }
    if (type === 'chat_message') {
      const body = String(message.body || '').trim().slice(0, 240);
      if (!body) return;
      const chatMessage = { id: randomUUID(), playerId: client.id, name: client.name, body, createdAt: new Date().toISOString() };
      room.chat ||= [];
      room.chat.push(chatMessage);
      room.chat = room.chat.slice(-100);
      for (const participant of room.clients.values()) send(participant.ws, 'chat_message', { message: chatMessage });
      return;
    }
    if (type === 'start_game') return startRoomGame(room, client);
    if (type === 'play_card' || type === 'draw_card') {
      if (room.game?.kind === 'blackjack') return error(ws, 'Usa pedir carta o plantarte en esta mesa');
      if (room.game?.kind === 'domino') return error(ws, 'Usa las acciones de fichas de esta mesa');
      if (room.game?.kind === 'poker') return error(ws, 'Usa las acciones de apuestas de esta mesa');
      if (room.game?.kind === 'rummy') return error(ws, 'Usa las acciones de Rummy de esta mesa');
      if (room.game?.kind === 'crazy') return error(ws, 'Usa las acciones de Crazy Eights de esta mesa');
      if (!room.game || room.game.finished) return error(ws, 'La partida no está activa');
      try { if (type === 'draw_card') drawCard(room.game, client.id); else playCard(room.game, client.id, message.index, message.chosenColor); }
      catch (playError) { return error(ws, playError.message); }
      if (room.game.finished) { room.table.status = 'finished'; await store.saveTable(room.table); broadcastResult(room); }
      broadcastGame(room); broadcastRoom(room); if (botForTurn(room)) void runBotTurns(room); return;
    }
    if (type === 'blackjack_hit' || type === 'blackjack_stand') {
      if (!room.game || room.game.kind !== 'blackjack' || room.game.finished) return error(ws, 'La ronda de 21 no está activa');
      try { if (type === 'blackjack_hit') blackjackHit(room.game, client.id); else blackjackStand(room.game, client.id); }
      catch (playError) { return error(ws, playError.message); }
      if (room.game.finished) { room.table.status = 'finished'; broadcastResult(room); }
      await store.saveTable(room.table); broadcastGame(room); broadcastRoom(room); if (botForTurn(room)) void runBotTurns(room); return;
    }
    if (type === 'domino_place' || type === 'domino_draw' || type === 'domino_pass') {
      if (!room.game || room.game.kind !== 'domino' || room.game.finished) return error(ws, 'La ronda de dominó no está activa');
      try {
        if (type === 'domino_place') dominoPlace(room.game, client.id, Number(message.index), message.side);
        else if (type === 'domino_draw') dominoDraw(room.game, client.id);
        else dominoPass(room.game, client.id);
      } catch (playError) { return error(ws, playError.message); }
      if (room.game.finished) { room.table.status = 'finished'; broadcastResult(room); }
      await store.saveTable(room.table); broadcastGame(room); broadcastRoom(room); if (botForTurn(room)) void runBotTurns(room); return;
    }
    if (type === 'poker_check' || type === 'poker_call' || type === 'poker_raise' || type === 'poker_fold') {
      if (!room.game || room.game.kind !== 'poker' || room.game.finished) return error(ws, 'La mano de póker no está activa');
      try { pokerAct(room.game, client.id, type.replace('poker_', ''), message.amount); }
      catch (playError) { return error(ws, playError.message); }
      if (room.game.finished) { room.table.status = 'finished'; broadcastResult(room); }
      await store.saveTable(room.table); broadcastGame(room); broadcastRoom(room); if (botForTurn(room)) void runBotTurns(room); return;
    }
    if (normalizedType === 'rummy_draw_stock' || normalizedType === 'rummy_draw_discard' || normalizedType === 'rummy_discard' || normalizedType === 'rummy_meld') {
      if (!room.game || room.game.kind !== 'rummy' || room.game.finished) return error(ws, 'La ronda de Rummy no está activa');
      try {
        if (normalizedType === 'rummy_draw_stock') rummyDrawStock(room.game, client.id);
        else if (normalizedType === 'rummy_draw_discard') rummyDrawDiscard(room.game, client.id);
        else if (normalizedType === 'rummy_meld') rummyLayMeld(room.game, client.id, message.indices);
        else rummyDiscard(room.game, client.id, Number(message.index));
      } catch (playError) { return error(ws, playError.message); }
      if (room.game.finished) { room.table.status = 'finished'; broadcastResult(room); }
      await store.saveTable(room.table); broadcastGame(room); broadcastRoom(room); if (botForTurn(room)) void runBotTurns(room); return;
    }
    if (type === 'crazy_play_card' || type === 'crazy_draw_card') {
      if (!room.game || room.game.kind !== 'crazy' || room.game.finished) return error(ws, 'La ronda de Crazy Eights no está activa');
      try { if (type === 'crazy_play_card') crazyPlayCard(room.game, client.id, Number(message.index), message.chosenSuit); else crazyDrawCard(room.game, client.id); }
      catch (playError) { return error(ws, playError.message); }
      if (room.game.finished) { room.table.status = 'finished'; await store.saveTable(room.table); broadcastResult(room); }
      broadcastGame(room); broadcastRoom(room); if (botForTurn(room)) void runBotTurns(room); return;
    }
    if (type === 'leave_table') {
      if (client.voiceActive) for (const participant of room.clients.values()) if (participant.id !== client.id && participant.voiceActive) send(participant.ws, 'voice_peer_left', { peerId: client.id });
      room.clients.delete(client.id); client.roomCode = null; void setPresence(client.userId, 'online');
      if (!room.clients.size) rooms.delete(room.table.code); else { broadcastRoom(room); if (room.game) broadcastGame(room); }
    }
  });
  ws.on('close', () => {
    const room = rooms.get(client.roomCode); if (!room) { void setPresence(client.userId, 'offline'); return; }
    if (room.clients.get(client.id) !== client) return;
    if (client.voiceActive) for (const participant of room.clients.values()) if (participant.id !== client.id && participant.voiceActive) send(participant.ws, 'voice_peer_left', { peerId: client.id });
    room.clients.delete(client.id);
    void setPresence(client.userId, 'offline');
    if (!room.clients.size) rooms.delete(room.table.code); else { broadcastRoom(room); if (room.game) broadcastGame(room); }
  });
});

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/realtime') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, heartbeatMs);
heartbeatTimer.unref();

const roomCleanupTimer = setInterval(async () => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (new Date(room.table.expiresAt).getTime() <= now && room.clients.size === 0) {
      rooms.delete(code);
      await store.closeTable(room.table.id);
    }
  }
}, 60000);
roomCleanupTimer.unref();

server.listen(port, '0.0.0.0', () => console.log(`Royal Gold Club running at http://0.0.0.0:${port} · realtime /realtime`));
