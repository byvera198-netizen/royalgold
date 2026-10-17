import { randomInt } from 'node:crypto';

function allTiles() {
  const tiles = [];
  for (let a = 0; a <= 6; a += 1) for (let b = a; b <= 6; b += 1) tiles.push({ a, b, id: `${a}-${b}` });
  return tiles;
}

function shuffle(tiles) {
  for (let i = tiles.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

function points(tile) { return tile.a + tile.b; }
function player(game, playerId) { return game.players.findIndex(item => item.id === playerId); }
function ends(game) { return game.chain.length ? [game.chain[0].left, game.chain.at(-1).right] : null; }
function tileMatches(tile, value) { return tile.a === value || tile.b === value; }

export function validMoves(game, playerId) {
  const index = player(game, playerId);
  if (index < 0) return [];
  const edge = ends(game);
  return game.players[index].hand.flatMap((tile, tileIndex) => {
    if (!edge) return [{ tileIndex, side: 'right' }];
    const moves = [];
    if (tileMatches(tile, edge[0])) moves.push({ tileIndex, side: 'left' });
    if (tileMatches(tile, edge[1]) && (edge[0] !== edge[1] || !moves.length || moves[0].side !== 'right')) moves.push({ tileIndex, side: 'right' });
    return moves;
  });
}

function nextTurn(game) {
  game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
}

function finish(game, winnerId = null) {
  game.finished = true;
  game.phase = 'finished';
  game.winnerId = winnerId;
  if (!winnerId) {
    const winner = [...game.players].sort((a, b) => a.hand.reduce((sum, t) => sum + points(t), 0) - b.hand.reduce((sum, t) => sum + points(t), 0))[0];
    game.winnerId = winner?.id || null;
  }
}

export function createGame(players) {
  if (players.length < 2 || players.length > 4) throw new Error('Dominó admite entre 2 y 4 jugadores');
  const deck = shuffle(allTiles());
  const handSize = 7;
  const game = {
    kind: 'domino',
    players: players.map(({ id, name }) => ({ id, name, hand: [], status: 'playing' })),
    boneyard: [],
    chain: [],
    currentPlayer: 0,
    passes: 0,
    phase: 'players',
    finished: false,
    winnerId: null,
    turnNumber: 1,
    createdAt: new Date().toISOString()
  };
  for (let round = 0; round < handSize; round += 1) game.players.forEach(item => item.hand.push(deck.pop()));
  game.boneyard = deck;
  const starter = game.players.reduce((best, item, index) => {
    const double = item.hand.filter(tile => tile.a === tile.b).sort((a, b) => points(b) - points(a))[0];
    const score = double ? 100 + points(double) : Math.max(...item.hand.map(points));
    return score > best.score ? { index, score } : best;
  }, { index: 0, score: -1 });
  game.currentPlayer = starter.index;
  return game;
}

function requireTurn(game, playerId) {
  if (game.finished) throw new Error('La ronda ya terminó');
  if (game.players[game.currentPlayer]?.id !== playerId) throw new Error('No es tu turno');
  return game.players[game.currentPlayer];
}

export function placeTile(game, playerId, tileIndex, side = 'right') {
  const current = requireTurn(game, playerId);
  const tile = current.hand[tileIndex];
  if (!tile) throw new Error('Ficha inválida');
  const edge = ends(game);
  if (side !== 'left' && side !== 'right') throw new Error('Lado inválido');
  if (edge && !tileMatches(tile, edge[side === 'left' ? 0 : 1])) throw new Error('La ficha no coincide con el extremo');
  let placed;
  if (!edge) placed = { ...tile, left: tile.a, right: tile.b, ownerId: playerId };
  else if (side === 'left') placed = tile.b === edge[0] ? { ...tile, left: tile.a, right: tile.b, ownerId: playerId } : { ...tile, left: tile.b, right: tile.a, ownerId: playerId };
  else placed = tile.a === edge[1] ? { ...tile, left: tile.a, right: tile.b, ownerId: playerId } : { ...tile, left: tile.b, right: tile.a, ownerId: playerId };
  current.hand.splice(tileIndex, 1);
  if (side === 'left') game.chain.unshift(placed); else game.chain.push(placed);
  current.status = current.hand.length ? 'playing' : 'finished';
  game.passes = 0;
  if (!current.hand.length) finish(game, playerId); else { nextTurn(game); game.turnNumber += 1; }
  return placed;
}

export function drawTile(game, playerId) {
  const current = requireTurn(game, playerId);
  if (!game.boneyard.length) return pass(game, playerId);
  current.hand.push(game.boneyard.pop());
  return { drew: true, remaining: game.boneyard.length, playable: validMoves(game, playerId).length > 0 };
}

export function pass(game, playerId) {
  requireTurn(game, playerId);
  if (validMoves(game, playerId).length) throw new Error('Tienes una ficha válida para jugar');
  game.passes += 1;
  if (game.passes >= game.players.length) finish(game); else { nextTurn(game); game.turnNumber += 1; }
  return { passed: true };
}

export function botMove(game, playerId) {
  const moves = validMoves(game, playerId);
  if (moves.length) return placeTile(game, playerId, moves[0].tileIndex, moves[0].side);
  if (game.boneyard.length) drawTile(game, playerId);
  if (validMoves(game, playerId).length) { const move = validMoves(game, playerId)[0]; return placeTile(game, playerId, move.tileIndex, move.side); }
  return pass(game, playerId);
}

export function serializeGame(game, viewerId) {
  return {
    kind: game.kind,
    phase: game.phase,
    finished: game.finished,
    winnerId: game.winnerId,
    activePlayerId: game.players[game.currentPlayer]?.id || null,
    turnNumber: game.turnNumber,
    boneyardCount: game.boneyard.length,
    ends: ends(game),
    chain: game.chain.map(({ a, b, left, right, ownerId }) => ({ a, b, left, right, ownerId })),
    players: game.players.map(item => ({ id: item.id, name: item.name, hand: item.id === viewerId || game.finished ? item.hand : undefined, handCount: item.hand.length, points: item.hand.reduce((sum, tile) => sum + points(tile), 0), status: item.status }))
  };
}
