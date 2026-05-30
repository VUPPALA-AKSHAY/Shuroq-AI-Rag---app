"use client";

import React, { useEffect, useRef, useState } from "react";

const animateDigit = (
  prevElement,
  nextElement,
  isIncreasing
) => {
  if (!prevElement || !nextElement) return;

  if (isIncreasing) {
    prevElement.classList.add("slide-out-up");
    nextElement.classList.add("slide-in-up");
  } else {
    prevElement.classList.add("slide-out-down");
    nextElement.classList.add("slide-in-down");
  }

  const handleAnimationEnd = () => {
    prevElement.classList.remove("slide-out-up", "slide-out-down");
    nextElement.classList.remove("slide-in-up", "slide-in-down");
    prevElement.removeEventListener("animationend", handleAnimationEnd);
  };

  prevElement.addEventListener("animationend", handleAnimationEnd);
};

export function NumberFlow({
  value: controlledValue,
  onChange,
  min = 0.1,
  max = 0.9,
  step = 0.1,
  className = "",
  digitClassName = "",
  buttonClassName = "",
}) {
  const [internalValue, setInternalValue] = useState(() => controlledValue !== undefined ? controlledValue : 0.2);
  const value = controlledValue === undefined ? internalValue : controlledValue;

  const prevValueStateRef = useRef(value);
  const prevValue = prevValueStateRef.current;
  const currentValueSafe = Number(value.toFixed(4));
  const prevValueSafe = Number(prevValue.toFixed(4));
  const isIncreasing = currentValueSafe > prevValueSafe;

  const prevValueRef = useRef(null);
  const nextValueRef = useRef(null);
  const prevValueUnitsRef = useRef(null);
  const nextValueUnitsRef = useRef(null);

  const setValue = (val) => {
    const fixedVal = Number(val.toFixed(4));
    if (onChange) {
      onChange(fixedVal);
    } else {
      setInternalValue(fixedVal);
    }
  };

  const add = (e) => {
    e?.stopPropagation();
    if (value < max) {
      setValue(value + step);
    }
  };

  const subtract = (e) => {
    e?.stopPropagation();
    if (value > min) {
      setValue(value - step);
    }
  };

  useEffect(() => {

    const currentTenths = Math.round((value * 10) % 10);
    const prevTenths = Math.round((prevValue * 10) % 10);

    if (
      prevValueRef.current &&
      nextValueRef.current &&
      currentTenths !== prevTenths
    ) {
      animateDigit(
        prevValueRef.current,
        nextValueRef.current,
        isIncreasing
      );
    }

    const currentUnits = Math.floor(value);
    const prevUnits = Math.floor(prevValue);

    if (
      prevValueUnitsRef.current &&
      nextValueUnitsRef.current &&
      currentUnits !== prevUnits
    ) {
      animateDigit(
        prevValueUnitsRef.current,
        nextValueUnitsRef.current,
        isIncreasing
      );
    }

    prevValueStateRef.current = value;
  }, [value]);

  return (
    <div className={`flex items-center justify-between border border-outline-variant/40 rounded-lg bg-surface-container-lowest text-on-surface h-6 px-1 w-[90px] select-none ${className}`}>

      <button
        aria-label="Decrease number"
        className={`flex items-center justify-center cursor-pointer hover:bg-white/5 active:bg-white/10 text-on-surface-variant hover:text-primary rounded w-5 h-5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${buttonClassName}`}
        disabled={value <= min}
        onClick={subtract}
        type="button"
      >
        <span className="text-[12px] font-bold leading-none">-</span>
      </button>

      <div className={`flex items-center tabular-nums font-mono ${digitClassName}`}>

        <div className="relative h-5 w-2 overflow-hidden">
          <span
            className="absolute inset-0 flex items-center justify-center font-semibold text-xs text-on-surface"
            ref={prevValueUnitsRef}
            style={{ transform: "translateY(-100%)" }}
          >
            {Math.floor(prevValue)}
          </span>
          <span
            className="absolute inset-0 flex items-center justify-center font-semibold text-xs text-on-surface"
            ref={nextValueUnitsRef}
            style={{ transform: "translateY(0%)" }}
          >
            {Math.floor(value)}
          </span>
        </div>

        <span className="text-xs font-semibold text-on-surface/60">.</span>

        <div className="relative h-5 w-2 overflow-hidden">
          <span
            className="absolute inset-0 flex items-center justify-center font-semibold text-xs text-on-surface"
            ref={prevValueRef}
            style={{ transform: "translateY(-100%)" }}
          >
            {Math.round((prevValue * 10) % 10)}
          </span>
          <span
            className="absolute inset-0 flex items-center justify-center font-semibold text-xs text-on-surface"
            ref={nextValueRef}
            style={{ transform: "translateY(0%)" }}
          >
            {Math.round((value * 10) % 10)}
          </span>
        </div>
      </div>

      <button
        aria-label="Increase number"
        className={`flex items-center justify-center cursor-pointer hover:bg-white/5 active:bg-white/10 text-on-surface-variant hover:text-primary rounded w-5 h-5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${buttonClassName}`}
        disabled={value >= max}
        onClick={add}
        type="button"
      >
        <span className="text-[12px] font-bold leading-none">+</span>
      </button>
    </div>
  );
}
