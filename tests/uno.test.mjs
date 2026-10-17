import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, createGame, drawCard, isPlayable, playCard, COLORS } from '../games/uno.mjs';

const players = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bruno' }, { id: 'c', name: 'Cata' }];
const fixedRng = max => max - 1;

test('crea una baraja UNO completa de 108 cartas', () => {
  const deck = createDeck();
  assert.equal(deck.length, 108);
  assert.equal(deck.filter(card => card.color === 'black' && card.label === 'wild').length, 4);
  assert.equal(deck.filter(card => card.color === 'black' && card.label === 'wild4').length, 4);
  assert.deepEqual(new Set(deck.map(card => card.color)), new Set([...COLORS, 'black']));
});

test('reparte siete cartas a cada jugador y deja descarte inicial', () => {
  const game = createGame(players, fixedRng);
  assert.deepEqual(game.players.map(player => player.hand.length), [7, 7, 7]);
  assert.equal(game.discard.length, 1);
  assert.equal(game.currentColor, game.discard[0].color);
});

test('valida color, etiqueta y comodines', () => {
  const top = { color: 'blue', label: '5' };
  assert.equal(isPlayable({ color: 'blue', label: '9' }, top, 'blue'), true);
  assert.equal(isPlayable({ color: 'red', label: '5' }, top, 'blue'), true);
  assert.equal(isPlayable({ color: 'green', label: '9' }, top, 'blue'), false);
  assert.equal(isPlayable({ color: 'black', label: 'wild' }, top, 'blue'), true);
});

test('jugar carta cambia el turno y aplica salto', () => {
  const game = createGame(players, fixedRng);
  game.players[0].hand = [{ color: 'blue', label: 'skip' }, { color: 'red', label: '8' }];
  game.discard = [{ color: 'blue', label: '4' }]; game.currentColor = 'blue'; game.turn = 0;
  playCard(game, 'a', 0);
  assert.equal(game.turn, 2);
  assert.equal(game.lastAction.type, 'play');
});

test('robar carta consume el turno', () => {
  const game = createGame(players, fixedRng);
  const before = game.players[0].hand.length;
  drawCard(game, 'a');
  assert.equal(game.players[0].hand.length, before + 1);
  assert.equal(game.turn, 1);
});

test('ganar marca la partida y el ganador', () => {
  const game = createGame(players, fixedRng);
  game.players[0].hand = [{ color: 'red', label: '7' }];
  game.discard = [{ color: 'red', label: '2' }]; game.currentColor = 'red'; game.turn = 0;
  playCard(game, 'a', 0);
  assert.equal(game.finished, true);
  assert.equal(game.winnerId, 'a');
});
