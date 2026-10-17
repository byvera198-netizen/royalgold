import { randomInt } from 'node:crypto';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = [['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9', 9], ['10', 10], ['J', 11], ['Q', 12], ['K', 13], ['A', 14]];

function deck() { return SUITS.flatMap(suit => RANKS.map(([rank, value]) => ({ rank, value, suit }))); }
function shuffle(cards) { for (let i = cards.length - 1; i > 0; i -= 1) { const j = randomInt(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; } return cards; }
function combinations(cards, size) { if (size === 0) return [[]]; if (cards.length < size) return []; const [first, ...rest] = cards; return combinations(rest, size - 1).map(item => [first, ...item]).concat(combinations(rest, size)); }
function counts(cards) { return cards.reduce((map, card) => map.set(card.value, (map.get(card.value) || 0) + 1), new Map()); }

export function evaluateFive(cards) {
  const values = cards.map(card => card.value).sort((a, b) => b - a);
  const grouped = [...counts(cards).entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(card => card.suit === cards[0].suit);
  const unique = [...new Set(values)];
  const straightHigh = unique.length === 5 && (unique[0] - unique[4] === 4 ? unique[0] : unique.join(',') === '14,5,4,3,2' ? 5 : 0);
  if (flush && straightHigh) return [8, straightHigh];
  if (grouped[0][1] === 4) return [7, grouped[0][0], grouped[1][0]];
  if (grouped[0][1] === 3 && grouped[1][1] === 2) return [6, grouped[0][0], grouped[1][0]];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (grouped[0][1] === 3) return [3, grouped[0][0], ...grouped.slice(1).map(item => item[0]).sort((a, b) => b - a)];
  if (grouped[0][1] === 2 && grouped[1][1] === 2) return [2, Math.max(grouped[0][0], grouped[1][0]), Math.min(grouped[0][0], grouped[1][0]), grouped[2][0]];
  if (grouped[0][1] === 2) return [1, grouped[0][0], ...grouped.slice(1).map(item => item[0]).sort((a, b) => b - a)];
  return [0, ...values];
}

export function bestHand(cards) { return combinations(cards, 5).map(evaluateFive).sort((a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i += 1) if ((b[i] || 0) !== (a[i] || 0)) return (b[i] || 0) - (a[i] || 0); return 0; })[0]; }

function pay(player, amount) { const paid = Math.min(player.stack, amount); player.stack -= paid; player.bet += paid; player.committed += paid; if (player.stack === 0) player.allIn = true; return paid; }
function livePlayers(game) { return game.players.filter(player => !player.folded); }
function actionPlayers(game) { return livePlayers(game).filter(player => !player.allIn); }
function nextActionPlayer(game, from = game.currentPlayer) { for (let offset = 1; offset <= game.players.length; offset += 1) { const index = (from + offset) % game.players.length; const player = game.players[index]; if (!player.folded && !player.allIn && (!game.acted.has(player.id) || player.bet < game.currentBet)) return index; } return -1; }

function settle(game) {
  const live = livePlayers(game);
  for (const player of game.players) game.pot += player.bet, player.bet = 0;
  const ranked = live.map(player => ({ player, rank: bestHand([...player.hand, ...game.community]) }));
  ranked.sort((a, b) => { for (let i = 0; i < Math.max(a.rank.length, b.rank.length); i += 1) if ((a.rank[i] || 0) !== (b.rank[i] || 0)) return (b.rank[i] || 0) - (a.rank[i] || 0); return 0; });
  const winners = ranked.filter(item => JSON.stringify(item.rank) === JSON.stringify(ranked[0]?.rank)).map(item => item.player);
  const share = Math.floor(game.pot / Math.max(winners.length, 1));
  winners.forEach(player => { player.stack += share; });
  if (winners.length && game.pot % winners.length) winners[0].stack += game.pot % winners.length;
  game.winnerIds = winners.map(player => player.id);
  game.results = ranked.map(item => ({ id: item.player.id, rank: item.rank }));
  game.pot = 0;
  game.finished = true;
  game.phase = 'showdown';
}

function revealStreet(game) {
  for (const player of game.players) game.pot += player.bet, player.bet = 0;
  game.currentBet = 0;
  game.acted = new Set();
  if (game.phase === 'preflop') { game.community.push(game.deck.pop(), game.deck.pop(), game.deck.pop()); game.phase = 'flop'; }
  else if (game.phase === 'flop') { game.community.push(game.deck.pop()); game.phase = 'turn'; }
  else if (game.phase === 'turn') { game.community.push(game.deck.pop()); game.phase = 'river'; }
  else { settle(game); return; }
  const next = actionPlayers(game)[0];
  if (!next) settle(game); else game.currentPlayer = game.players.indexOf(next);
}

function continueRound(game) {
  if (livePlayers(game).length === 1) { settle(game); return; }
  if (!actionPlayers(game).length || nextActionPlayer(game, game.currentPlayer) < 0) revealStreet(game);
  else game.currentPlayer = nextActionPlayer(game, game.currentPlayer);
}

export function createGame(players) {
  if (players.length < 2 || players.length > 9) throw new Error('Texas Hold’em admite entre 2 y 9 jugadores');
  const cards = shuffle(deck());
  const game = { kind: 'poker', deck: cards, community: [], players: players.map(({ id, name }) => ({ id, name, hand: [], stack: 1000, bet: 0, committed: 0, folded: false, allIn: false })), dealerIndex: 0, currentPlayer: 0, smallBlind: 10, bigBlind: 20, currentBet: 20, pot: 0, phase: 'preflop', acted: new Set(), finished: false, winnerIds: [], results: [] };
  game.players.forEach(player => { player.hand.push(game.deck.pop(), game.deck.pop()); });
  const small = game.players[(game.dealerIndex + 1) % game.players.length];
  const big = game.players[(game.dealerIndex + 2) % game.players.length];
  pay(small, game.smallBlind); pay(big, game.bigBlind);
  game.currentPlayer = (game.dealerIndex + 3) % game.players.length;
  if (game.players.length === 2) game.currentPlayer = game.dealerIndex;
  return game;
}

function requireTurn(game, playerId) { if (game.finished) throw new Error('La mano ya terminó'); const player = game.players[game.currentPlayer]; if (!player || player.id !== playerId) throw new Error('No es tu turno'); if (player.folded || player.allIn) throw new Error('Este jugador no puede actuar'); return player; }

export function act(game, playerId, action, amount = 0) {
  const player = requireTurn(game, playerId);
  const toCall = Math.max(0, game.currentBet - player.bet);
  if (action === 'fold') player.folded = true;
  else if (action === 'check') { if (toCall) throw new Error('Debes igualar la apuesta o retirarte'); }
  else if (action === 'call') { if (!toCall) throw new Error('No hay apuesta que igualar'); pay(player, toCall); }
  else if (action === 'raise') {
    const target = Number(amount);
    const minimum = game.currentBet + game.bigBlind;
    if (!Number.isFinite(target) || target < minimum) throw new Error(`La subida mínima es ${minimum}`);
    if (target > player.bet + player.stack) throw new Error('No tienes suficientes fichas');
    pay(player, target - player.bet); game.currentBet = target; game.acted = new Set([player.id]);
  } else throw new Error('Acción de póker inválida');
  game.acted.add(player.id);
  continueRound(game);
}

export function serializeGame(game, viewerId) {
  const me = game.players.find(player => player.id === viewerId);
  return {
    kind: game.kind, phase: game.phase, community: game.community, pot: game.pot + game.players.reduce((sum, player) => sum + player.bet, 0), currentBet: game.currentBet,
    currentPlayerId: game.players[game.currentPlayer]?.id || null, finished: game.finished, winnerIds: game.winnerIds,
    toCall: me ? Math.max(0, game.currentBet - me.bet) : 0,
    players: game.players.map(player => ({ id: player.id, name: player.name, stack: player.stack, bet: player.bet, folded: player.folded, allIn: player.allIn, hand: player.id === viewerId || game.finished ? player.hand : undefined, handCount: player.hand.length, rank: game.results.find(result => result.id === player.id)?.rank || null })),
    actions: me && !game.finished && game.currentPlayer === game.players.indexOf(me) ? { check: game.currentBet === me.bet, call: game.currentBet > me.bet, raiseMin: game.currentBet + game.bigBlind, fold: true } : { check: false, call: false, raiseMin: null, fold: false }
  };
}
