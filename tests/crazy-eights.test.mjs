import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, drawCard, isPlayable, playCard, serializeGame } from '../games/crazy-eights.mjs';

const players = [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }];

test('crea Crazy Eights con siete cartas y descarte inicial no comodín', () => {
  const game = createGame(players);
  assert.equal(game.players[0].hand.length, 7);
  assert.equal(game.players[1].hand.length, 7);
  assert.notEqual(game.discard[0].rank, '8');
  assert.equal(game.stock.length + game.discard.length + game.players.reduce((sum, player) => sum + player.hand.length, 0), 52);
});

test('valida palo, rango y ocho como comodín', () => {
  const top = { rank: 'Q', suit: '♥' };
  assert.equal(isPlayable({ rank: '2', suit: '♥' }, top, '♥'), true);
  assert.equal(isPlayable({ rank: 'Q', suit: '♣' }, top, '♥'), true);
  assert.equal(isPlayable({ rank: '8', suit: '♣' }, top, '♥'), true);
  assert.equal(isPlayable({ rank: '3', suit: '♣' }, top, '♥'), false);
});

test('protege turnos, robo y manos privadas', () => {
  const game = createGame(players);
  assert.throws(() => drawCard(game, 'p2'), /No es tu turno/);
  const active = game.players[game.currentPlayer].id;
  drawCard(game, active);
  assert.equal(game.players[0].hand.length, 8);
  const view = serializeGame(game, 'p1');
  assert.equal(view.hand.length, 8);
  assert.equal(view.players.find(player => player.id === 'p2').hand, undefined);
});

test('jugar un ocho exige palo y avanza la ronda', () => {
  const game = createGame(players);
  const active = game.players[game.currentPlayer];
  active.hand[0] = { rank: '8', suit: '♠' };
  assert.throws(() => playCard(game, active.id, 0), /palo válido/);
  playCard(game, active.id, 0, '♦');
  assert.equal(game.currentSuit, '♦');
  assert.equal(game.currentPlayer, 1);
});

test('revela las manos de todos los jugadores al terminar', () => {
  const game = createGame(players);
  game.finished = true;
  const view = serializeGame(game, 'p1');
  assert.ok(view.players.every(player => Array.isArray(player.hand)));
});
