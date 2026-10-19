import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, currencyForCountry } from './money';

test('formats minor units', () => {
  assert.equal(formatMoney({ amount: 10000000, currency: 'INR' }, 'en-IN'), '₹1,00,000.00');
  assert.equal(formatMoney({ amount: 12345, currency: 'USD' }, 'en-US'), '$123.45');
  assert.equal(formatMoney({ amount: 5000, currency: 'JPY' }, 'en-US'), '¥5,000');
});

test('country to currency', () => {
  assert.equal(currencyForCountry('in'), 'INR');
  assert.equal(currencyForCountry('ZZ'), 'USD');
});

import { toMinor, fromMinor } from './money';
test('minor unit conversion', () => {
  assert.equal(toMinor(85000.5, 'INR'), 8500050);
  assert.equal(toMinor(1.005, 'USD'), 101);
  assert.equal(toMinor(5000, 'JPY'), 5000);
  assert.equal(fromMinor(8500050, 'INR'), 85000.5);
});
