import React from 'react';
import { AnimatedThemeToggle } from './ui/animated-theme-toggle';

const TopHeader = ({ title, subtitle, showSearch = false, onSearchChange, actionButton }) => {
  return (
    <header className="app-top-header sticky top-0 z-40 flex min-h-[72px] w-full items-center border-b border-outline-variant/30 bg-surface/85 px-4 shadow-sm shadow-slate-900/5 backdrop-blur-md sm:px-6 lg:px-12">
      <div className="flex w-full min-w-0 items-center gap-4 lg:gap-6">
        <h1 className="min-w-[128px] shrink-0 truncate text-lg font-extrabold leading-none text-primary sm:text-headline-md sm:font-headline-md">{title}</h1>
        {subtitle && (
          <>
            <div className="hidden h-5 w-px bg-outline-variant sm:block"></div>
            <div className="min-w-0 flex flex-1 items-center gap-2 text-on-surface-variant">
              {subtitle}
            </div>
          </>
        )}
        {showSearch && (
          <div className="relative hidden w-full max-w-[420px] sm:block">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
            <input
              className="h-10 w-full rounded-lg border border-outline-variant/30 bg-surface-container-lowest pl-10 pr-4 text-sm text-on-surface transition-all duration-200 placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/30"
              placeholder="Search analytics, files, or parameters..."
              type="text"
              onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3 lg:gap-4">
        <div className="flex items-center gap-2 text-on-surface-variant sm:gap-3">
          <AnimatedThemeToggle />
        </div>

        {actionButton && <div className="shrink-0">{actionButton}</div>}

        <div className="hidden items-center gap-3 border-l border-outline-variant/30 pl-4 sm:flex lg:pl-6">
          <img
            alt="User Profile"
            className="w-8 h-8 rounded-full border border-outline-variant/50 object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDrTFYGJhD7cWbUGqEA1uxksnic40FlQloNPI56-hULnJgWlAygjXSgOlYaU_vnlVdNe6dgklLQtq7BDRAFcvq5dKz5Fkmi_QsLPwXRylrvpLPL7Sa25EyVEkLl9ZEl7Ep-1Kq7LKw7OAahrDuPlV3b7EOv4sUAnsSqpqBns10r5MTW_6-fFMMoIvjdBKQffko_FFuyTwFFir_kAZgAnu1zfHRngD2L7dq0NTp5JKX5U5rtJ-hepkRlhk3EFUuCXtVPmf_VPXC3vXpLcA"
          />
        </div>
      </div>
    </header>
  );
};

export default TopHeader;
