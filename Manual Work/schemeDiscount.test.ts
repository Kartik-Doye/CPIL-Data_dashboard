import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateSchemeDiscount } from './schemeDiscount.js';

test('keeps numeric Scheme totals unchanged', () => {
  assert.equal(estimateSchemeDiscount(150, 100, 50, 2), 150);
  assert.equal(estimateSchemeDiscount('1,250.50', 100, 50, 2), 1250.5);
});

test('estimates percentage schemes against the full daily sales value', () => {
  assert.equal(estimateSchemeDiscount('5% DISCOUNT ON PURCHASES ABOVE Rs. 300', 100, 50, 2), 250);
});

test('uses fixed rupee amount from text and scales per-litre schemes', () => {
  assert.equal(estimateSchemeDiscount('RS. 20 DISCOUNT OVER RS. 300 FILLING', 100, 50, 2), 20);
  assert.equal(estimateSchemeDiscount('₹2 per litre discount', 100, 50, 2), 200);
});

test('treats blank and NA schemes as no discount', () => {
  assert.equal(estimateSchemeDiscount('', 100, 50, 2), 0);
  assert.equal(estimateSchemeDiscount('NA', 100, 50, 2), 0);
});

test('reports text that does not contain an estimateable discount', () => {
  assert.throws(
    () => estimateSchemeDiscount('SPECIAL OFFER', 100, 50, 7),
    /Row 7, column "SCHEME".*could not estimate discount/
  );
});
