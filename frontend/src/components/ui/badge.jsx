import React from "react";

export function Badge({ children, variant = "default", className = "", ...props }) {
  const baseStyle = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors";

  const variants = {
    default: "bg-primary/10 text-primary border-primary/20",
    outline: "border-outline-variant/30 bg-white/5 text-on-surface",
    secondary: "bg-surface-container-high text-on-surface border-outline-variant/30",
  };

  return (
    <span className={`${baseStyle} ${variants[variant] || variants.default} ${className}`} {...props}>
      {children}
    </span>
  );
}

export default Badge;
