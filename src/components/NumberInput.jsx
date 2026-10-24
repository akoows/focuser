import { forwardRef } from 'react';
import { Minus, Plus } from 'lucide-react';

const NumberInput = forwardRef(function NumberInput({ value, onValueChange, className = '', step = '1', min, max, disabled, ...inputProps }, ref) {
  const numericStep = step === 'any' ? 0.01 : Number(step) || 1;
  const minimum = min === undefined ? Number.NEGATIVE_INFINITY : Number(min);
  const maximum = max === undefined ? Number.POSITIVE_INFINITY : Number(max);
  const stepDecimals = String(numericStep).split('.')[1]?.length ?? 0;
  const valueDecimals = String(value ?? '').split('.')[1]?.length ?? 0;
  const precision = Math.min(12, Math.max(stepDecimals, valueDecimals));
  const label = inputProps['aria-label'] || 'valor';

  const adjustValue = (direction) => {
    const current = value === '' || value === null || value === undefined ? NaN : Number(value);
    const base = Number.isFinite(current) ? current : (Number.isFinite(minimum) ? minimum : 0);
    const next = Math.min(maximum, Math.max(minimum, Number((base + numericStep * direction).toFixed(precision))));
    if (next !== base) onValueChange(String(next));
  };

  const numericValue = value === '' || value === null || value === undefined ? NaN : Number(value);
  const decrementDisabled = disabled || (Number.isFinite(numericValue) && numericValue <= minimum);
  const incrementDisabled = disabled || (Number.isFinite(numericValue) && numericValue >= maximum);

  return (
    <div className={`number-input-control${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="number-input-stepper"
        aria-label={`Diminuir ${label}`}
        disabled={decrementDisabled}
        onClick={() => adjustValue(-1)}
      >
        <Minus size={15} aria-hidden="true" />
      </button>
      <input
        {...inputProps}
        ref={ref}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        className="number-input-field"
        onChange={(event) => onValueChange(event.target.value)}
      />
      <button
        type="button"
        className="number-input-stepper"
        aria-label={`Aumentar ${label}`}
        disabled={incrementDisabled}
        onClick={() => adjustValue(1)}
      >
        <Plus size={15} aria-hidden="true" />
      </button>
    </div>
  );
});

export default NumberInput;
