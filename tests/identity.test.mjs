import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePseudo, loginToEmail, displayLogin } from '../js/domain/identity.js';

test('pseudo → adresse interne, et retour', () => {
  assert.equal(loginToEmail('Antoine'), 'antoine@carnet-muscu.app');
  assert.equal(loginToEmail('  Jérôme B '), 'jerome-b@carnet-muscu.app');
  assert.equal(displayLogin('jerome-b@carnet-muscu.app'), 'jerome-b');
  assert.equal(displayLogin('Antoine@Carnet-Muscu.app'), 'Antoine');
});

test('une vraie adresse e-mail reste acceptée telle quelle', () => {
  assert.equal(loginToEmail('Antoine+Test@gmail.com'), 'antoine+test@gmail.com');
  assert.equal(displayLogin('antoine+test@gmail.com'), 'antoine+test@gmail.com');
  assert.equal(loginToEmail('pas@valide'), null);
});

test('pseudos refusés : trop court, trop long, vide', () => {
  assert.equal(normalizePseudo('a'), null);
  assert.equal(normalizePseudo('!!!'), null);
  assert.equal(normalizePseudo('x'.repeat(31)), null);
  assert.equal(loginToEmail(''), null);
  assert.equal(normalizePseudo('-Max_'), 'max');
});
