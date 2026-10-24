import test from 'node:test';
import assert from 'node:assert/strict';

function computeNumberInputAdjustment({ value, direction, step = '1', min, max }) {
  const numericStep = step === 'any' ? 0.01 : Number(step) || 1;
  const minimum = min === undefined ? Number.NEGATIVE_INFINITY : Number(min);
  const maximum = max === undefined ? Number.POSITIVE_INFINITY : Number(max);
  const stepDecimals = String(numericStep).split('.')[1]?.length ?? 0;
  const valueDecimals = String(value ?? '').split('.')[1]?.length ?? 0;
  const precision = Math.min(12, Math.max(stepDecimals, valueDecimals));

  const current = value === '' || value === null || value === undefined ? NaN : Number(value);
  const base = Number.isFinite(current) ? current : (Number.isFinite(minimum) ? minimum : 0);
  const next = Math.min(maximum, Math.max(minimum, Number((base + numericStep * direction).toFixed(precision))));
  return next !== base ? String(next) : null;
}

function computeStepperDisabled({ value, min, max, disabled }) {
  const minimum = min === undefined ? Number.NEGATIVE_INFINITY : Number(min);
  const maximum = max === undefined ? Number.POSITIVE_INFINITY : Number(max);
  const numericValue = value === '' || value === null || value === undefined ? NaN : Number(value);

  const decrementDisabled = disabled || (Number.isFinite(numericValue) && numericValue <= minimum);
  const incrementDisabled = disabled || (Number.isFinite(numericValue) && numericValue >= maximum);
  return { decrementDisabled, incrementDisabled };
}

test('NumberInput logic - boundary and precision regression', async (t) => {
  await t.test('increments and decrements standard integers by 1', () => {
    assert.equal(computeNumberInputAdjustment({ value: '5', direction: 1 }), '6');
    assert.equal(computeNumberInputAdjustment({ value: '5', direction: -1 }), '4');
  });

  await t.test('respects min and max constraints without overflowing', () => {
    // At maximum boundary
    assert.equal(computeNumberInputAdjustment({ value: '10', direction: 1, min: 0, max: 10 }), null);
    // At minimum boundary
    assert.equal(computeNumberInputAdjustment({ value: '0', direction: -1, min: 0, max: 10 }), null);
    // Clamps to min/max if step would overshoot
    assert.equal(computeNumberInputAdjustment({ value: '9', direction: 1, step: '2', min: 0, max: 10 }), '10');
    assert.equal(computeNumberInputAdjustment({ value: '1', direction: -1, step: '2', min: 0, max: 10 }), '0');
  });

  await t.test('handles decimal stepping and float precision avoiding JS floating point drift', () => {
    // 0.1 + 0.2 floating point drift: in JS, 0.1 + 0.2 is 0.30000000000000004
    const result = computeNumberInputAdjustment({ value: '0.1', direction: 1, step: '0.2' });
    assert.equal(result, '0.3');

    const result2 = computeNumberInputAdjustment({ value: '1.25', direction: -1, step: '0.05' });
    assert.equal(result2, '1.2');
  });

  await t.test('handles empty, null or undefined initial values safely', () => {
    // Falls back to minimum if minimum is finite
    assert.equal(computeNumberInputAdjustment({ value: '', direction: 1, min: 5 }), '6');
    assert.equal(computeNumberInputAdjustment({ value: null, direction: 1, min: 0 }), '1');
    // Falls back to 0 if minimum is not finite
    assert.equal(computeNumberInputAdjustment({ value: '', direction: 1 }), '1');
    assert.equal(computeNumberInputAdjustment({ value: undefined, direction: -1 }), '-1');
  });

  await t.test('correctly evaluates disabled status for buttons', () => {
    // Component entirely disabled
    const allDisabled = computeStepperDisabled({ value: '5', min: 0, max: 10, disabled: true });
    assert.equal(allDisabled.decrementDisabled, true);
    assert.equal(allDisabled.incrementDisabled, true);

    // At minimum
    const atMin = computeStepperDisabled({ value: '0', min: 0, max: 10 });
    assert.equal(atMin.decrementDisabled, true);
    assert.equal(atMin.incrementDisabled, false);

    // At maximum
    const atMax = computeStepperDisabled({ value: '10', min: 0, max: 10 });
    assert.equal(atMax.decrementDisabled, false);
    assert.equal(atMax.incrementDisabled, true);

    // Middle value
    const mid = computeStepperDisabled({ value: '5', min: 0, max: 10 });
    assert.equal(mid.decrementDisabled, false);
    assert.equal(mid.incrementDisabled, false);
  });
});
