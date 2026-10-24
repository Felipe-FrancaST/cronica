'use client';
import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { Input } from './ui';

// A blank draft is allowed while typing; only valid integers update the sheet.
export function IntegerInput({
  value,
  onValueChange,
  min = 1,
  max = 20,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'> & {
  value: number;
  onValueChange(value: number): void;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <Input
      {...props}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        const n = Number(next);
        if (next.trim() && Number.isInteger(n) && n >= min && n <= max) onValueChange(n);
      }}
      onBlur={(event) => {
        const n = Number(text);
        const next =
          text.trim() && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : value;
        setText(String(value));
        if (next !== value) onValueChange(next);
        props.onBlur?.(event);
      }}
    />
  );
}
