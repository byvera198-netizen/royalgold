import { randomInt } from 'node:crypto';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() { return SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit }))); }
function shuffle(cards) { for (let index = cards.length - 1; index > 0; index -= 1) { const swap = randomInt(index + 1); [cards[index], cards[swap]] = [cards[swap], cards[index]]; } return cards; }
function nextPlayer(game) { game.currentPlayer = (game.currentPlayer + 1) % game.players.length; }
function current(game, playerId) { if (game.finished) throw new Error('La partida ya terminó'); const player = game.players[game.currentPlayer]; if (!player || player.id !== playerId) throw new Error('No es tu turno'); return player; }
function recycle(game) { if (game.stock.length || game.discard.length < 2) return; const top = game.discard.pop(); game.stock = shuffle(game.discard.splice(0)); game.discard = [top]; }

export function isPlayable(card, top, currentSuit) { return card?.rank === '8' || card?.suit === currentSuit || card?.rank === top?.rank; }

export function createGame(players) {
  if (players.length < 2 || players.length > 6) throw new Error('Crazy Eights admite entre 2 y 6 jugadores');
  const cards = shuffle(createDeck());
  const game = { kind: 'crazy', stock: cards, discard: [], players: players.map(({ id, name }) => ({ id, name, hand: [] })), currentPlayer: 0, currentSuit: null, finished: false, winnerId: null, turnNumber: 1, createdAt: new Date().toISOString(), lastAction: null };
  const handSize = players.length === 2 ? 7 : 5;
  for (let round = 0; round < handSize; round += 1) game.players.forEach(player => player.hand.push(game.stock.pop()));
  let opening = game.stock.pop();
  while (opening?.rank === '8') { game.stock.unshift(opening); opening = game.stock.pop(); }
  game.discard.push(opening);
  game.currentSuit = opening.suit;
  return game;
}

export function playCard(game, playerId, index, chosenSuit) {
  const player = current(game, playerId);
  const card = player.hand[Number(index)];
  if (!card) throw new Error('Carta inválida');
  if (!isPlayable(card, game.discard.at(-1), game.currentSuit)) throw new Error('Esa carta no puede jugarse ahora');
  if (card.rank === '8' && !SUITS.includes(chosenSuit)) throw new Error('El 8 necesita un palo válido');
  player.hand.splice(Number(index), 1);
  game.discard.push(card);
  game.currentSuit = card.rank === '8' ? chosenSuit : card.suit;
  game.lastAction = { type: 'play', playerId, card, currentSuit: game.currentSuit };
  if (!player.hand.length) { game.finished = true; game.winnerId = playerId; return card; }
  nextPlayer(game); game.turnNumber += 1;
  return card;
}

export function drawCard(game, playerId) {
  const player = current(game, playerId);
  recycle(game);
  const card = game.stock.pop();
  if (!card) throw new Error('No quedan cartas para robar');
  player.hand.push(card);
  game.lastAction = { type: 'draw', playerId };
  nextPlayer(game); game.turnNumber += 1;
  return card;
}

export function serializeGame(game, viewerId) {
  return { kind: game.kind, phase: game.finished ? 'finished' : 'playing', finished: game.finished, winnerId: game.winnerId, activePlayerId: game.players[game.currentPlayer]?.id || null, currentSuit: game.currentSuit, stockCount: game.stock.length, discard: game.discard.at(-1), turnNumber: game.turnNumber, lastAction: game.lastAction, myTurn: game.players[game.currentPlayer]?.id === viewerId, hand: game.players.find(player => player.id === viewerId)?.hand || [], players: game.players.map(player => ({ id: player.id, name: player.name, handCount: player.hand.length, isMe: player.id === viewerId })) };
}
