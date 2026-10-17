import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const filePath = join(root, 'data', 'tables.json');

export async function createStore() {
  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  const supabaseReady = supabaseUrl.startsWith('https://') && !supabaseUrl.includes('your-project') && secretKey.length > 30 && !secretKey.includes('your-secret') && !secretKey.includes('your-service-role');
  if (supabaseReady) return createSupabaseStore(supabaseUrl, secretKey);
  if (process.env.NODE_ENV === 'production') throw new Error('Producción requiere SUPABASE_URL y SUPABASE_SECRET_KEY');
  await mkdir(dirname(filePath), { recursive: true });
  let tables = [];
  try { tables = JSON.parse(await readFile(filePath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const write = async () => {
    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(tables, null, 2), 'utf8');
    await rename(tempPath, filePath);
  };
  return {
    mode: 'file-development',
    listTables: () => tables.filter(table => new Date(table.expiresAt) > new Date() && table.status !== 'closed'),
    saveTable: async table => { const index = tables.findIndex(item => item.id === table.id); if (index >= 0) tables[index] = structuredClone(table); else tables.push(structuredClone(table)); await write(); },
    closeTable: async id => { const table = tables.find(item => item.id === id); if (table) { table.status = 'closed'; table.closedAt = new Date().toISOString(); await write(); } }
  };
}

function toTable(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    gameId: row.game_id,
    gameName: row.game_catalog?.name || row.game_id,
    maxPlayers: row.max_players,
    private: row.is_private,
    voice: row.voice_enabled,
    stake: row.stake,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    closedAt: row.closed_at,
    host: row.host_email || '',
    hostId: row.host_id
  };
}

function toRow(table) {
  if (!table.hostId) throw new Error('La persistencia Supabase requiere userId en la sesión realtime');
  return {
    id: table.id,
    code: table.code,
    name: table.name,
    game_id: table.gameId,
    host_id: table.hostId,
    status: table.status,
    is_private: table.private,
    max_players: table.maxPlayers,
    voice_enabled: table.voice,
    stake: table.stake,
    created_at: table.createdAt,
    expires_at: table.expiresAt,
    closed_at: table.closedAt || null
  };
}

async function createSupabaseStore(url, key) {
  const request = async (path, options = {}) => {
    const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`Supabase storage error ${response.status}: ${await response.text()}`);
    if (response.status === 204) return null;
    const body = await response.text();
    if (!body.trim()) return null;
    try { return JSON.parse(body); } catch { throw new Error(`Supabase storage returned invalid JSON (${response.status})`); }
  };
  return {
    mode: 'supabase',
    listTables: async () => (await request('game_tables?select=*,game_catalog(name)&status=in.(waiting,playing,finished)&order=created_at.desc')).map(toTable),
    saveTable: async table => { await request('game_tables', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(toRow(table)) }); },
    closeTable: async id => { await request(`game_tables?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'closed', closed_at: new Date().toISOString() }) }); }
  };
}
