import { randomInt } from 'node:crypto';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = [
  ['A', 11], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6],
  ['7', 7], ['8', 8], ['9', 9], ['10', 10], ['J', 10], ['Q', 10], ['K', 10]
];

function createDeck() {
  return SUITS.flatMap(suit => RANKS.map(([rank, value]) => ({ rank, suit, value })));
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function handValue(hand) {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter(card => card.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}

function deal(game) { return game.deck.pop(); }

function nextPlayer(game) {
  let index = game.activePlayer + 1;
  while (index < game.players.length && game.players[index].status !== 'playing') index += 1;
  if (index < game.players.length) { game.activePlayer = index; return; }
  dealerTurn(game);
}

function dealerTurn(game) {
  game.phase = 'dealer';
  while (handValue(game.dealer.hand) < 17) game.dealer.hand.push(deal(game));
  const dealerTotal = handValue(game.dealer.hand);
  for (const player of game.players) {
    const total = handValue(player.hand);
    if (player.status === 'bust') player.result = 'bust';
    else if (dealerTotal > 21 || total > dealerTotal) player.result = 'win';
    else if (total === dealerTotal) player.result = 'push';
    else player.result = 'lose';
    player.status = 'done';
  }
  game.finished = true;
  game.phase = 'finished';
}

export function createGame(players) {
  const deck = shuffle(createDeck());
  const game = {
    kind: 'blackjack',
    deck,
    players: players.map(({ id, name }) => ({ id, name, hand: [], status: 'playing', result: null })),
    dealer: { hand: [] },
    activePlayer: 0,
    phase: 'players',
    finished: false,
    createdAt: new Date().toISOString()
  };
  for (let round = 0; round < 2; round += 1) {
    game.players.forEach(player => player.hand.push(deal(game)));
    game.dealer.hand.push(deal(game));
  }
  game.players.forEach(player => {
    if (handValue(player.hand) === 21) { player.status = 'standing'; player.result = 'blackjack'; }
  });
  if (game.players.every(player => player.status !== 'playing')) dealerTurn(game);
  return game;
}

function active(game, playerId) {
  const player = game.players[game.activePlayer];
  if (game.finished) throw new Error('La ronda ya terminó');
  if (!player || player.id !== playerId) throw new Error('No es tu turno');
  return player;
}

export function hit(game, playerId) {
  const player = active(game, playerId);
  player.hand.push(deal(game));
  if (handValue(player.hand) >= 21) {
    player.status = handValue(player.hand) > 21 ? 'bust' : 'standing';
    if (player.status === 'bust') player.result = 'bust';
    nextPlayer(game);
  }
}

export function stand(game, playerId) {
  const player = active(game, playerId);
  player.status = 'standing';
  nextPlayer(game);
}

export function serializeGame(game, viewerId) {
  return {
    kind: game.kind,
    phase: game.phase,
    finished: game.finished,
    activePlayerId: game.players[game.activePlayer]?.id || null,
    dealer: {
      hand: game.finished ? game.dealer.hand : [game.dealer.hand[0], { hidden: true }],
      value: game.finished ? handValue(game.dealer.hand) : null
    },
    players: game.players.map(player => ({
      id: player.id,
      name: player.name,
      hand: player.id === viewerId || game.finished ? player.hand : undefined,
      handCount: player.hand.length,
      value: player.id === viewerId || game.finished ? handValue(player.hand) : null,
      status: player.status,
      result: player.result
    }))
  };
}
