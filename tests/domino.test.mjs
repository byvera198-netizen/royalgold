import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, placeTile, validMoves, pass, serializeGame } from '../games/domino.mjs';

const players = [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }];

test('crea un set de manos de dominó y conserva el resto en el pozo', () => {
  const game = createGame(players);
  assert.deepEqual(game.players.map(player => player.hand.length), [7, 7]);
  assert.equal(game.boneyard.length, 14);
  assert.equal(game.kind, 'domino');
});

test('solo permite jugar en el turno y expone movimientos válidos', () => {
  const game = createGame(players);
  const active = game.players[game.currentPlayer];
  assert.ok(validMoves(game, active.id).length > 0);
  assert.throws(() => placeTile(game, players.find(player => player.id !== active.id).id, 0), /No es tu turno/);
});

test('coloca la primera ficha y actualiza los extremos públicos', () => {
  const game = createGame(players);
  const active = game.players[game.currentPlayer];
  const move = validMoves(game, active.id)[0];
  placeTile(game, active.id, move.tileIndex, move.side);
  assert.equal(game.chain.length, 1);
  assert.equal(game.players.find(player => player.id === active.id).hand.length, 6);
  assert.equal(game.turnNumber, 2);
  assert.equal(serializeGame(game, players[1].id).chain.length, 1);
});

test('no permite pasar cuando existe una ficha jugable', () => {
  const game = createGame(players);
  const active = game.players[game.currentPlayer];
  assert.throws(() => pass(game, active.id), /ficha válida/);
});
