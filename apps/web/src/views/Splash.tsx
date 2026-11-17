import { Compass, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui/button.js';

interface SplashProps {
  message: string;
  detail?: string;
  onRetry?: () => void;
  onResetDefault?: () => void;
}

/**
 * Centered loading / error screen. Designed with high-precision engineering aesthetics.
 */
export function Splash({ message, detail, onRetry, onResetDefault }: SplashProps) {
  return (
    <div className="relative h-full flex flex-col items-center justify-center gap-5 text-muted-foreground bg-background p-6">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-16 w-16 rounded-full border border-primary/30 animate-ping opacity-30" />
        <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/40 flex items-center justify-center shadow-lg shadow-primary/10">
          <Compass className="h-6 w-6 text-primary animate-pulse" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{message}</h2>
        <p className="text-xs text-muted-foreground">Initializing local workbench workspace</p>
      </div>
      {detail && (
        <pre className="max-w-2xl text-xs text-rose-300 font-mono whitespace-pre-wrap rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 shadow-inner">
          {detail}
        </pre>
      )}
      {(onRetry || onResetDefault) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-2 rounded-xl interactive-lift">
              <RefreshCw className="h-3.5 w-3.5" />
              Retry Connection
            </Button>
          )}
          {onResetDefault && (
            <Button
              variant="default"
              size="sm"
              onClick={onResetDefault}
              className="gap-2 rounded-xl interactive-lift"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to Default Saga
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
