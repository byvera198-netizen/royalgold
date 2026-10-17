import { randomBytes } from 'node:crypto';

export const COLORS = ['red', 'blue', 'green', 'yellow'];
export const ACTIONS = new Set(['skip', 'reverse', 'draw2']);

function secureRandom(max) { return randomBytes(4).readUInt32BE(0) % max; }
function shuffle(cards, rng = secureRandom) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, label: '0' });
    for (let value = 1; value <= 9; value++) deck.push({ color, label: String(value) }, { color, label: String(value) });
    for (const label of ACTIONS) deck.push({ color, label }, { color, label });
  }
  for (let i = 0; i < 4; i++) deck.push({ color: 'black', label: 'wild' }, { color: 'black', label: 'wild4' });
  return deck;
}

function draw(game, count = 1) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    if (!game.deck.length) {
      const top = game.discard.pop();
      game.deck = shuffle(game.discard.splice(0), game.rng);
      game.discard = top ? [top] : [];
    }
    if (game.deck.length) cards.push(game.deck.pop());
  }
  return cards;
}

function nextIndex(game, steps = 1) {
  const total = game.players.length;
  return (game.turn + game.direction * steps + total * 10) % total;
}

export function isPlayable(card, top, currentColor) { return card.color === 'black' || card.color === currentColor || card.label === top.label; }

export function createGame(players, rng = secureRandom) {
  if (!Array.isArray(players) || players.length < 2) throw new Error('UNO necesita al menos dos jugadores');
  const game = { rng, players: players.map(player => ({ ...player, hand: [] })), deck: shuffle(createDeck(), rng), discard: [], turn: 0, direction: 1, currentColor: null, finished: false, winnerId: null, lastAction: null };
  for (const player of game.players) player.hand = draw(game, 7);
  let first = draw(game, 1)[0];
  while (first?.color === 'black') { game.deck.unshift(first); first = draw(game, 1)[0]; }
  game.discard.push(first || { color: 'blue', label: '5' });
  game.currentColor = game.discard[0].color;
  return game;
}

export function playCard(game, playerId, cardIndex, chosenColor) {
  if (game.finished) throw new Error('La partida ya terminó');
  const playerIndex = game.players.findIndex(player => player.id === playerId);
  if (playerIndex < 0) throw new Error('Jugador no encontrado');
  if (playerIndex !== game.turn) throw new Error('No es tu turno');
  const player = game.players[playerIndex];
  const card = player.hand[Number(cardIndex)];
  if (!card) throw new Error('Carta inválida');
  const top = game.discard.at(-1);
  if (!isPlayable(card, top, game.currentColor)) throw new Error('Esa carta no puede jugarse ahora');
  if (card.label === 'wild4' && player.hand.some(other => other.color !== 'black' && other.color === game.currentColor)) throw new Error('No puedes jugar +4 mientras tengas una carta del color activo');
  player.hand.splice(Number(cardIndex), 1);
  game.discard.push(card);
  game.currentColor = card.color === 'black' ? (COLORS.includes(chosenColor) ? chosenColor : null) : card.color;
  if (!game.currentColor) throw new Error('Un comodín necesita un color válido');
  if (!player.hand.length) { game.finished = true; game.winnerId = playerId; game.lastAction = { type: 'win', playerId, card }; return game; }
  if (card.label === 'reverse') game.direction *= -1;
  const steps = card.label === 'skip' || card.label === 'draw2' || card.label === 'wild4' ? 2 : 1;
  const next = nextIndex(game, steps);
  if (card.label === 'draw2') game.players[next].hand.push(...draw(game, 2));
  if (card.label === 'wild4') game.players[next].hand.push(...draw(game, 4));
  game.turn = next;
  game.lastAction = { type: 'play', playerId, card, nextPlayerId: game.players[next].id };
  return game;
}

export function drawCard(game, playerId) {
  if (game.finished) throw new Error('La partida ya terminó');
  const playerIndex = game.players.findIndex(player => player.id === playerId);
  if (playerIndex < 0) throw new Error('Jugador no encontrado');
  if (playerIndex !== game.turn) throw new Error('No es tu turno');
  const cards = draw(game, 1);
  game.players[playerIndex].hand.push(...cards);
  game.turn = nextIndex(game);
  game.lastAction = { type: 'draw', playerId, count: cards.length, nextPlayerId: game.players[game.turn].id };
  return cards[0] || null;
}

export function serializeGame(game, playerId) {
  return {
    turn: game.turn, direction: game.direction, currentColor: game.currentColor, discard: game.discard.at(-1),
    players: game.players.map((player, index) => ({ id: player.id, name: player.name, handCount: player.hand.length, connected: player.connected !== false, isMe: player.id === playerId, index })),
    hand: game.players.find(player => player.id === playerId)?.hand || [], finished: game.finished, winnerId: game.winnerId,
    myIndex: game.players.findIndex(player => player.id === playerId), myTurn: game.players[game.turn]?.id === playerId, lastAction: game.lastAction
  };
}
