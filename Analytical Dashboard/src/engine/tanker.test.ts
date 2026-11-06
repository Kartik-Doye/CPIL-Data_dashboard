import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendTanker } from './tanker.js';

test('selects the smallest available tanker for the calculated three-day refill', () => {
  assert.deepEqual(recommendTanker(3000, 1000), {
    requiredVolumeLtr: 8000,
    tankerLabel: '10 KL tanker',
  });
  assert.equal(recommendTanker(2500, 1000).tankerLabel, '7.5 KL tanker');
  assert.equal(recommendTanker(5000, 1000).tankerLabel, '20 KL tanker');
});

test('uses multiple 20 KL tankers when the refill exceeds one tanker', () => {
  assert.deepEqual(recommendTanker(15000, 0), {
    requiredVolumeLtr: 45000,
    tankerLabel: '20 KL tanker × 3',
  });
});

test('does not recommend a refill when stock already covers the target', () => {
  assert.deepEqual(recommendTanker(1000, 4000), {
    requiredVolumeLtr: 0,
    tankerLabel: 'No refill needed for 3-day target',
  });
});
