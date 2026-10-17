import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, handValue, hit, stand } from '../games/blackjack.mjs';

const players = [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }];

test('calcula ases como 11 o 1 sin superar 21 cuando es posible', () => {
  assert.equal(handValue([{ rank: 'A', value: 11 }, { rank: 'K', value: 10 }]), 21);
  assert.equal(handValue([{ rank: 'A', value: 11 }, { rank: '9', value: 9 }, { rank: '5', value: 5 }]), 15);
});

test('crea una ronda con dos cartas por jugador y una mano del dealer', () => {
  const game = createGame(players);
  assert.equal(game.players.length, 2);
  assert.ok(game.players.every(player => player.hand.length === 2));
  assert.equal(game.dealer.hand.length, 2);
  assert.equal(game.kind, 'blackjack');
});

test('valida turnos y avanza al siguiente jugador al plantarse', () => {
  const game = createGame(players);
  const first = game.players[0];
  const second = game.players[1];
  if (game.finished || game.activePlayer !== 0) return;
  assert.throws(() => stand(game, second.id), /No es tu turno/);
  stand(game, first.id);
  assert.ok(game.finished || game.players[game.activePlayer]?.id === second.id);
});

test('pedir carta mantiene la ronda o resuelve el bust', () => {
  const game = createGame([{ id: 'p1', name: 'Ana' }]);
  if (game.finished) return;
  const before = game.players[0].hand.length;
  hit(game, 'p1');
  assert.equal(game.players[0].hand.length, before + 1);
  assert.ok(['playing', 'standing', 'bust', 'done'].includes(game.players[0].status));
});
