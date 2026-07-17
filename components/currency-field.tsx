"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";
import { centsFromInput, centsToInput } from "@/lib/invoice";

type CurrencyFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: number;
  onChange: (cents: number) => void;
};

export function CurrencyField({ value, onChange, onBlur, ...props }: CurrencyFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = centsToInput(value);
    }
  }, [value]);

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      defaultValue={centsToInput(value)}
      onChange={(event) => {
        const next = event.target.value;
        if (!/^\d*(?:[.,]\d{0,2})?$/.test(next)) {
          event.target.value = centsToInput(value);
          return;
        }
        const cents = centsFromInput(next);
        if (cents !== null) onChange(cents);
      }}
      onBlur={(event) => {
        event.currentTarget.value = centsToInput(value);
        onBlur?.(event);
      }}
    />
  );
}
