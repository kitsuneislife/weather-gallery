const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getWeatherTheme,
  getWeatherDescription,
  getArtKeywords,
  formatTemperature,
  scoreArtwork,
} = require('../script.js');

test('classifica chuva durante o dia', () => {
  assert.equal(getWeatherTheme({ weatherCode: 63, isDay: 1 }), 'rain');
});

test('classifica noite quando não há condição extrema', () => {
  assert.equal(getWeatherTheme({ weatherCode: 1, isDay: 0 }), 'night');
});

test('gera descrição em português para céu limpo', () => {
  assert.equal(getWeatherDescription(0), 'Céu limpo');
});

test('gera palavras-chave coerentes com neve', () => {
  assert.deepEqual(getArtKeywords('snow'), ['snow', 'winter landscape', 'skating', 'ice', 'blizzard']);
});

test('pontua obra de paisagem com neve acima de obra religiosa', () => {
  const winter = { title: 'Winter Landscape', classification: 'Paintings', tags: [{ term: 'Snow' }, { term: 'Landscapes' }] };
  const saint = { title: 'The Martyrdom of Saint Barbara', classification: 'Paintings', tags: [{ term: 'Saints' }, { term: 'Men' }] };
  assert.ok(scoreArtwork(winter, 'snow') > 0);
  assert.ok(scoreArtwork(saint, 'snow') < 0);
  assert.ok(scoreArtwork(winter, 'snow') > scoreArtwork(saint, 'snow'));
});

test('penaliza retrato sem relação com o tema', () => {
  const portrait = { title: 'Portrait of a Man', classification: 'Paintings', tags: [{ term: 'Portraits' }, { term: 'Men' }] };
  assert.ok(scoreArtwork(portrait, 'rain') < 0);
});

test('formata temperatura com unidade Celsius', () => {
  assert.equal(formatTemperature(21.6), '22 °C');
});
