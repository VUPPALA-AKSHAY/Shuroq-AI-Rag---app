"use client"

import React, { createContext, useContext, useId } from "react"
import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field"
import { cva } from "class-variance-authority"

const cn = (...classes) => classes.filter(Boolean).join(" ");

const NumberFieldContext = createContext(null)

const numberFieldGroupVariants = cva(
  "relative flex w-full justify-between items-center border border-outline-variant/40 rounded-lg bg-surface-container-lowest text-on-surface transition-colors focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/20",
  {
    variants: {
      size: {
        sm: "h-7 text-xs",
        default: "h-9 text-sm",
        lg: "h-11 text-sm",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const numberFieldButtonVariants = cva(
  "relative flex shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-white/5 active:bg-white/10 text-on-surface-variant hover:text-primary select-none h-full",
  {
    variants: {
      size: {
        sm: "px-2",
        default: "px-3",
        lg: "px-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const numberFieldInputVariants = cva(
  "w-full min-w-0 flex-1 bg-transparent text-center tabular-nums outline-none border-none text-on-surface focus:ring-0 focus:outline-none py-1",
  {
    variants: {
      size: {
        sm: "px-2 text-xs",
        default: "px-3 text-sm",
        lg: "px-4 text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function NumberField({
  id,
  className,
  size = "default",
  ...props
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const sizeValue = size ?? "default"

  return (
    <NumberFieldContext.Provider value={{ fieldId, size: sizeValue }}>
      <NumberFieldPrimitive.Root
        className={cn("flex w-full flex-col items-start gap-1.5", className)}
        data-size={sizeValue}
        data-slot="number-field"
        id={fieldId}
        {...props}
      />
    </NumberFieldContext.Provider>
  )
}

function NumberFieldGroup({
  className,
  size: sizeProp,
  ...props
}) {
  const context = useContext(NumberFieldContext)
  if (!context) {
    throw new Error(
      "NumberFieldGroup must be used within a NumberField component."
    )
  }
  const size = sizeProp ?? context.size

  return (
    <NumberFieldPrimitive.Group
      className={cn(numberFieldGroupVariants({ size }), className)}
      data-slot="number-field-group"
      {...props}
    />
  )
}

function NumberFieldDecrement({
  className,
  size: sizeProp,
  children,
  ...props
}) {
  const context = useContext(NumberFieldContext)
  if (!context) {
    throw new Error(
      "NumberFieldDecrement must be used within a NumberField component."
    )
  }
  const size = sizeProp ?? context.size

  return (
    <NumberFieldPrimitive.Decrement
      className={cn(
        numberFieldButtonVariants({ size }),
        "rounded-s-lg border-r border-outline-variant/30",
        className
      )}
      data-slot="number-field-decrement"
      {...props}
    >
      {children ?? (
        <span className="material-symbols-outlined text-[18px]">remove</span>
      )}
    </NumberFieldPrimitive.Decrement>
  )
}

function NumberFieldIncrement({
  className,
  size: sizeProp,
  children,
  ...props
}) {
  const context = useContext(NumberFieldContext)
  if (!context) {
    throw new Error(
      "NumberFieldIncrement must be used within a NumberField component."
    )
  }
  const size = sizeProp ?? context.size

  return (
    <NumberFieldPrimitive.Increment
      className={cn(
        numberFieldButtonVariants({ size }),
        "rounded-e-lg border-l border-outline-variant/30",
        className
      )}
      data-slot="number-field-increment"
      {...props}
    >
      {children ?? (
        <span className="material-symbols-outlined text-[18px]">add</span>
      )}
    </NumberFieldPrimitive.Increment>
  )
}

const NumberFieldInput = React.forwardRef(({
  className,
  size: sizeProp,
  ...props
}, ref) => {
  const context = useContext(NumberFieldContext)
  if (!context) {
    throw new Error(
      "NumberFieldInput must be used within a NumberField component."
    )
  }
  const size = sizeProp ?? context.size

  return (
    <NumberFieldPrimitive.Input
      ref={ref}
      className={cn(numberFieldInputVariants({ size }), className)}
      data-slot="number-field-input"
      {...props}
    />
  )
})
NumberFieldInput.displayName = "NumberFieldInput"

function NumberFieldScrubArea({
  className,
  label,
  ...props
}) {
  const context = useContext(NumberFieldContext)
  if (!context) {
    throw new Error(
      "NumberFieldScrubArea must be used within a NumberField component for accessibility."
    )
  }

  return (
    <NumberFieldPrimitive.ScrubArea
      className={cn("flex cursor-ew-resize items-center gap-1.5", className)}
      data-slot="number-field-scrub-area"
      {...props}
    >
      <label
        className="cursor-ew-resize text-[10px] uppercase text-on-surface-variant/60 font-bold tracking-wider select-none"
        htmlFor={context.fieldId}
      >
        {label}
      </label>
      <NumberFieldPrimitive.ScrubAreaCursor className="drop-shadow-[0_1px_1px_#0008] filter">
        <CursorGrowIcon />
      </NumberFieldPrimitive.ScrubAreaCursor>
    </NumberFieldPrimitive.ScrubArea>
  )
}

function CursorGrowIcon(props) {
  return (
    <svg
      fill="white"
      height="10"
      stroke="black"
      strokeWidth="1"
      viewBox="0 0 24 14"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M19.5 5.5L6.49737 5.51844V2L1 6.9999L6.5 12L6.49737 8.5L19.5 8.5V12L25 6.9999L19.5 2V5.5Z" />
    </svg>
  )
}

export {
  NumberField,
  NumberFieldScrubArea,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldGroup,
  NumberFieldInput,
}
