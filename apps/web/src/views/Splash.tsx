import { Compass, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button.js';

interface SplashProps {
  message: string;
  detail?: string;
  onRetry?: () => void;
}

/**
 * Centered loading / error screen. Used while the Saga is still
 * loading or when it failed to load.
 */
export function Splash({ message, detail, onRetry }: SplashProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground bg-parchment-grain">
      <Compass className="h-10 w-10 text-primary/70 animate-pulse" />
      <div className="font-serif text-xl text-foreground">{message}</div>
      {detail && (
        <pre className="max-w-2xl text-xs text-rose-300 whitespace-pre-wrap rounded-md border border-border bg-card p-3">
          {detail}
        </pre>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
