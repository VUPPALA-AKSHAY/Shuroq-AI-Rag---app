import React from "react";

export function Table({ children, variant = "default", className = "", wrapperClassName = "", ...props }) {
  const variantStyles = {
    default: "",
    card: "border-separate border-spacing-0",
  };

  return (
    <div className={`relative w-full overflow-x-auto ${wrapperClassName}`}>
      <table className={`w-full text-sm text-left ${variantStyles[variant] || ""} ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, className = "", ...props }) {
  return (
    <thead className={`sticky top-0 z-10 ${className}`} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ children, className = "", ...props }) {
  return (
    <tbody className={`divide-y divide-white/[0.06] ${className}`} {...props}>
      {children}
    </tbody>
  );
}

export function TableFooter({ children, className = "", ...props }) {
  return (
    <tfoot className={`border-t border-white/10 ${className}`} {...props}>
      {children}
    </tfoot>
  );
}

export function TableRow({ children, className = "", ...props }) {
  return (
    <tr className={`transition-colors hover:bg-white/[0.03] ${className}`} {...props}>
      {children}
    </tr>
  );
}

export function TableHead({ children, className = "", ...props }) {
  return (
    <th className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60 whitespace-nowrap ${className}`} {...props}>
      {children}
    </th>
  );
}

export function TableCell({ children, className = "", ...props }) {
  return (
    <td className={`px-4 py-3.5 text-sm text-on-surface whitespace-nowrap ${className}`} {...props}>
      {children}
    </td>
  );
}
