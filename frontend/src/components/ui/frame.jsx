import React from "react";

export function Frame({ children, className = "", ...props }) {
  return (
    <div className={`rounded-xl border border-white/[0.08] bg-[#1a1a1a] shadow-2xl overflow-hidden ${className}`} {...props}>
      {children}
    </div>
  );
}

export default Frame;
