"use client";

import React, { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type EditableNumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> & {
  value: number;
  onValueChange: (value: number) => void;
};

export function EditableNumberInput({ value, onValueChange, onBlur, onFocus, ...props }: EditableNumberInputProps) {
  const [draft, setDraft] = useState(() => formatValue(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(formatValue(value));
  }, [value]);

  return (
    <input
      {...props}
      type="number"
      value={draft}
      onFocus={(event) => {
        focused.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        setDraft(raw);
        if (raw === "" || !Number.isFinite(event.currentTarget.valueAsNumber)) return;
        onValueChange(event.currentTarget.valueAsNumber);
      }}
      onBlur={(event) => {
        focused.current = false;
        setDraft(formatValue(value));
        onBlur?.(event);
      }}
    />
  );
}

function formatValue(value: number) {
  return Number.isFinite(value) ? String(value) : "";
}
