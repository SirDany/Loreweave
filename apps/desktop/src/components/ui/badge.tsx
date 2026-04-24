import * as React from 'react';

import { cn } from '@/lib/utils';

const Badge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'danger';
  }
>(({ className, variant = 'default', ...props }, ref) => {
  const styles: Record<string, string> = {
    default: 'bg-primary/20 text-primary border border-primary/30',
    secondary: 'bg-secondary text-secondary-foreground border border-border',
    outline: 'border border-border text-foreground',
    success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  };
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
});
Badge.displayName = 'Badge';

export { Badge };
