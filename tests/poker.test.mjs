import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, bestHand, serializeGame } from '../games/poker.mjs';

const players = [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }, { id: 'p3', name: 'Mia' }];

test('crea Texas Hold’em con dos cartas privadas y ciegas', () => {
  const game = createGame(players);
  assert.ok(game.players.every(player => player.hand.length === 2));
  assert.equal(game.players.filter(player => player.bet > 0).length, 2);
  assert.equal(game.phase, 'preflop');
});

test('evalúa una escalera real por encima de otras manos', () => {
  const rank = bestHand([
    { value: 14, rank: 'A', suit: '♠' }, { value: 13, rank: 'K', suit: '♠' }, { value: 12, rank: 'Q', suit: '♠' },
    { value: 11, rank: 'J', suit: '♠' }, { value: 10, rank: '10', suit: '♠' }, { value: 2, rank: '2', suit: '♥' }, { value: 3, rank: '3', suit: '♦' }
  ]);
  assert.deepEqual(rank, [8, 14]);
});

test('valida la acción del turno y protege las cartas ajenas', () => {
  const game = createGame(players);
  const active = game.players[game.currentPlayer];
  assert.throws(() => act(game, players.find(player => player.id !== active.id).id, 'check'), /No es tu turno/);
  act(game, active.id, 'call');
  const view = serializeGame(game, active.id);
  assert.ok(Array.isArray(view.players.find(player => player.id === active.id).hand));
  assert.ok(view.players.filter(player => player.hand === undefined).length >= 1);
});

test('rechaza una subida menor al mínimo de la mesa', () => {
  const game = createGame(players);
  const active = game.players[game.currentPlayer];
  assert.throws(() => act(game, active.id, 'raise', game.bigBlind), /subida mínima/);
});
