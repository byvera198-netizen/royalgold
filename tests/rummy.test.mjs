import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, discardCard, drawDiscard, drawStock, findMeld, layMeld, reorderHand, serializeGame, validMeld } from '../games/rummy.mjs';

const players = [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }];

test('admite mesas de Rummy de hasta seis jugadores', () => {
  const sixPlayers = Array.from({ length: 6 }, (_, index) => ({ id: `p${index + 1}`, name: `Jugador ${index + 1}` }));
  const game = createGame(sixPlayers);
  assert.equal(game.players.length, 6);
  assert.throws(() => createGame([...sixPlayers, { id: 'p7', name: 'Jugador 7' }]), /2 y 6/);
});

test('crea Rummy con siete cartas por jugador y descarte inicial', () => {
  const game = createGame(players);
  assert.equal(game.players[0].hand.length, 7);
  assert.equal(game.players[1].hand.length, 7);
  assert.equal(game.stock.length + game.discard.length + game.players.reduce((sum, player) => sum + player.hand.length, 0), 52);
  assert.equal(game.discard.length, 1);
  assert.equal(game.phase, 'draw');
});

test('permite reorganizar la mano sin cambiar sus cartas', () => {
  const game = createGame(players);
  const handBefore = game.players[0].hand.slice();
  reorderHand(game, 'p1', 0, handBefore.length - 1);
  assert.equal(game.players[0].hand.at(-1).id, handBefore[0].id);
  assert.deepEqual([...game.players[0].hand].sort((a, b) => a.id.localeCompare(b.id)), [...handBefore].sort((a, b) => a.id.localeCompare(b.id)));
});

test('protege el turno y las manos privadas', () => {
  const game = createGame(players);
  assert.throws(() => drawStock(game, 'p2'), /No es tu turno/);
  const view = serializeGame(game, 'p1');
  assert.equal(view.hand.length, 7);
  assert.equal(view.players.find(player => player.id === 'p1').isMe, true);
  assert.equal(view.players.find(player => player.id === 'p1').hand.length, 7);
  assert.equal(view.players.find(player => player.id === 'p2').hand, undefined);
});

test('permite robar y descartar para avanzar el turno', () => {
  const game = createGame(players);
  const active = game.players[game.currentPlayer].id;
  drawStock(game, active);
  assert.equal(game.phase, 'discard');
  assert.equal(game.players[0].hand.length, 8);
  discardCard(game, active, 0);
  assert.equal(game.phase, 'draw');
  assert.equal(game.players[0].hand.length, 7);
  assert.equal(game.currentPlayer, 1);
});

test('valida grupos y escaleras, y registra combinaciones', () => {
  const group = [{ rank: '7', value: 7, suit: '♠' }, { rank: '7', value: 7, suit: '♥' }, { rank: '7', value: 7, suit: '♦' }];
  const run = [{ rank: '4', value: 4, suit: '♣' }, { rank: '5', value: 5, suit: '♣' }, { rank: '6', value: 6, suit: '♣' }];
  assert.equal(validMeld(group), true);
  assert.equal(validMeld(run), true);
  const game = createGame(players);
  const current = game.players[0];
  current.hand = [...group, ...current.hand];
  game.phase = 'discard';
  layMeld(game, 'p1', [0, 1, 2]);
  assert.equal(current.melds.length, 1);
  assert.equal(current.hand.length, 7);
});

test('gana inmediatamente al cerrar dos combinaciones 3+4', () => {
  const game = createGame(players);
  game.players[0].hand = [
    { id: '2-♥', rank: '2', value: 2, suit: '♥' },
    { id: '3-♥', rank: '3', value: 3, suit: '♥' },
    { id: '4-♥', rank: '4', value: 4, suit: '♥' },
    { id: '7-♣', rank: '7', value: 7, suit: '♣' },
    { id: '7-♦', rank: '7', value: 7, suit: '♦' },
    { id: '7-♥', rank: '7', value: 7, suit: '♥' },
    { id: '7-♠', rank: '7', value: 7, suit: '♠' }
  ];
  game.currentPlayer = 0;
  game.phase = 'discard';
  layMeld(game, 'p1', [0, 1, 2]);
  assert.equal(game.finished, false);
  layMeld(game, 'p1', [0, 1, 2, 3]);
  assert.equal(game.finished, true);
  assert.deepEqual(game.winnerIds, ['p1']);
});

test('reconoce escaleras y grupos, y resuelve al agotarse el pozo', () => {
  const sequence = [
    { id: 'Q-♠', rank: 'Q', value: 12, suit: '♠' },
    { id: 'K-♠', rank: 'K', value: 13, suit: '♠' },
    { id: 'A-♠', rank: 'A', value: 14, suit: '♠' }
  ];
  const group = [
    { id: '9-♠', rank: '9', value: 9, suit: '♠' },
    { id: '9-♥', rank: '9', value: 9, suit: '♥' },
    { id: '9-♦', rank: '9', value: 9, suit: '♦' }
  ];
  assert.equal(validMeld(sequence), true);
  assert.equal(validMeld(group), true);
  assert.equal(findMeld([...sequence, ...group]).length, 3);
  const game = createGame(players);
  game.players[0].hand = [...sequence, ...group, { id: '2-♣', rank: '2', value: 2, suit: '♣' }];
  game.players[1].hand = [{ id: '5-♣', rank: '5', value: 5, suit: '♣' }, { id: '8-♣', rank: '8', value: 8, suit: '♣' }];
  game.stock = [];
  game.discard = [{ id: '4-♦', rank: '4', value: 4, suit: '♦' }];
  game.phase = 'draw';
  game.currentPlayer = 0;
  drawStock(game, 'p1');
  assert.equal(game.finished, true);
  assert.deepEqual(game.winnerIds, ['p1']);
  assert.equal(game.scores.find(score => score.id === 'p1').groups, 2);
});
