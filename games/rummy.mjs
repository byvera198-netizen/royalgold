import { randomInt } from 'node:crypto';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = [['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9', 9], ['10', 10], ['J', 11], ['Q', 12], ['K', 13], ['A', 14]];

function deck() {
  return SUITS.flatMap(suit => RANKS.map(([rank, value]) => ({ id: `${rank}-${suit}`, rank, value, suit })));
}

function shuffle(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

function playerIndex(game, playerId) {
  return game.players.findIndex(player => player.id === playerId);
}

function activePlayer(game, playerId) {
  if (game.finished) throw new Error('La ronda ya terminó');
  const current = game.players[game.currentPlayer];
  if (!current || current.id !== playerId) throw new Error('No es tu turno');
  return current;
}

function nextTurn(game) {
  game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
  game.phase = 'draw';
  game.turnNumber += 1;
}

function finish(game, winnerId) {
  game.finished = true;
  game.phase = 'finished';
  game.winnerId = winnerId;
}

function cardKey(card) {
  return `${card.rank}-${card.suit}`;
}

function isSequence(cards) {
  if (!cards.length || cards.some(card => card.suit !== cards[0].suit)) return false;
  const values = cards.map(card => card.value).sort((a, b) => a - b);
  if (new Set(values).size !== values.length) return false;
  const lowAce = values[values.length - 1] === 14 && values[0] === 2;
  if (lowAce) values[values.length - 1] = 1;
  values.sort((a, b) => a - b);
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

function isGroup(cards) {
  return cards.length >= 3 && cards.every(card => card.value === cards[0].value) && new Set(cards.map(card => card.suit)).size === cards.length;
}

export function validMeld(cards) {
  if (!Array.isArray(cards) || cards.length < 3) return false;
  const unique = new Set(cards.map(cardKey));
  return unique.size === cards.length && (isGroup(cards) || isSequence(cards));
}

export function createGame(players) {
  if (players.length < 2 || players.length > 4) throw new Error('Rummy admite entre 2 y 4 jugadores');
  const cards = shuffle(deck());
  const handSize = players.length === 2 ? 10 : 7;
  const game = {
    kind: 'rummy',
    players: players.map(({ id, name }) => ({ id, name, hand: [], melds: [] })),
    stock: cards,
    discard: [],
    currentPlayer: 0,
    phase: 'draw',
    finished: false,
    winnerId: null,
    turnNumber: 1,
    createdAt: new Date().toISOString()
  };
  for (let round = 0; round < handSize; round += 1) game.players.forEach(player => player.hand.push(game.stock.pop()));
  game.discard.push(game.stock.pop());
  return game;
}

export function drawStock(game, playerId) {
  const current = activePlayer(game, playerId);
  if (game.phase !== 'draw') throw new Error('Ya robaste; ahora debes descartar');
  if (!game.stock.length) throw new Error('El pozo está vacío');
  current.hand.push(game.stock.pop());
  game.phase = 'discard';
  return current.hand.at(-1);
}

export function drawDiscard(game, playerId) {
  const current = activePlayer(game, playerId);
  if (game.phase !== 'draw') throw new Error('Ya robaste; ahora debes descartar');
  const card = game.discard.pop();
  if (!card) throw new Error('No hay cartas en el descarte');
  current.hand.push(card);
  game.phase = 'discard';
  return card;
}

export function layMeld(game, playerId, indices) {
  const current = activePlayer(game, playerId);
  if (game.phase !== 'discard') throw new Error('Primero debes robar una carta');
  if (!Array.isArray(indices) || indices.length < 3 || new Set(indices).size !== indices.length) throw new Error('Selecciona al menos tres cartas distintas');
  const cards = indices.map(index => current.hand[index]);
  if (cards.some(card => !card) || !validMeld(cards)) throw new Error('Esa combinación no es válida');
  current.hand = current.hand.filter((_, index) => !indices.includes(index));
  current.melds.push(cards);
  return cards;
}

export function discardCard(game, playerId, index) {
  const current = activePlayer(game, playerId);
  if (game.phase !== 'discard') throw new Error('Primero debes robar una carta');
  const card = current.hand[Number(index)];
  if (!card) throw new Error('Carta inválida');
  current.hand.splice(Number(index), 1);
  game.discard.push(card);
  if (!current.hand.length) finish(game, playerId);
  else nextTurn(game);
  return card;
}

export function serializeGame(game, viewerId) {
  const viewer = game.players.find(player => player.id === viewerId);
  return {
    kind: game.kind,
    phase: game.phase,
    finished: game.finished,
    winnerId: game.winnerId,
    activePlayerId: game.players[game.currentPlayer]?.id || null,
    turnNumber: game.turnNumber,
    stockCount: game.stock.length,
    discard: game.discard.at(-1) || null,
    players: game.players.map(player => ({
      id: player.id,
      name: player.name,
      hand: player.id === viewerId || game.finished ? player.hand : undefined,
      handCount: player.hand.length,
      melds: player.melds
    })),
    myTurn: viewer?.id === game.players[game.currentPlayer]?.id
  };
}
