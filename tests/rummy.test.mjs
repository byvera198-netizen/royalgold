import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, discardCard, drawDiscard, drawStock, layMeld, serializeGame, validMeld } from '../games/rummy.mjs';

const players = [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }];

test('crea Rummy con diez cartas por jugador y descarte inicial', () => {
  const game = createGame(players);
  assert.equal(game.players[0].hand.length, 10);
  assert.equal(game.players[1].hand.length, 10);
  assert.equal(game.stock.length + game.discard.length + game.players.reduce((sum, player) => sum + player.hand.length, 0), 52);
  assert.equal(game.discard.length, 1);
  assert.equal(game.phase, 'draw');
});

test('protege el turno y las manos privadas', () => {
  const game = createGame(players);
  assert.throws(() => drawStock(game, 'p2'), /No es tu turno/);
  const view = serializeGame(game, 'p1');
  assert.equal(view.players.find(player => player.id === 'p1').hand.length, 10);
  assert.equal(view.players.find(player => player.id === 'p2').hand, undefined);
});

test('permite robar y descartar para avanzar el turno', () => {
  const game = createGame(players);
  const active = game.players[game.currentPlayer].id;
  drawStock(game, active);
  assert.equal(game.phase, 'discard');
  assert.equal(game.players[0].hand.length, 11);
  discardCard(game, active, 0);
  assert.equal(game.phase, 'draw');
  assert.equal(game.players[0].hand.length, 10);
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
  assert.equal(current.hand.length, 10);
});
