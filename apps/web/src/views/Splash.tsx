import { useState, type FormEvent } from 'react';
import {
  BookPlus,
  Compass,
  FolderCog,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { slugify } from '../lib/helpers.js';
import { createSaga } from '../lib/lw.js';

interface SplashProps {
  message: string;
  subtitle?: string;
  detail?: string;
  noSagas?: boolean;
  discoveryRoot?: string;
  onCreateSaga?: (createdPath: string) => void;
  onOpenImport?: () => void;
  onOpenSettings?: () => void;
  onRetry?: () => void;
  onResetDefault?: () => void;
}

/**
 * Centered loading, onboarding, and recovery screen. Uses glassmorphism so the
 * active skin's AmbientBackground shines through cleanly.
 */
export function Splash({
  message,
  subtitle,
  detail,
  noSagas = false,
  discoveryRoot = 'sagas',
  onCreateSaga,
  onOpenImport,
  onOpenSettings,
  onRetry,
  onResetDefault,
}: SplashProps) {
  const [title, setTitle] = useState('');
  const [tomeTitle, setTomeTitle] = useState('Book One');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const normalizedRoot = (discoveryRoot || 'sagas').replace(/\\/g, '/').replace(/\/+$/, '');
  const derivedSlug =
    slugify(title).replace(/^-+|-+$/g, '') || 'new-saga';
  const showOnboardingCard = Boolean(onCreateSaga && (noSagas || showCreateForm || !detail));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!onCreateSaga) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setCreateError('Please enter a title for your new Saga.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createSaga({
        title: trimmedTitle,
        id: derivedSlug,
        parentDir: normalizedRoot,
        tomeTitle: tomeTitle.trim() || 'Book One',
      });
      onCreateSaga(created.path);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative h-full w-full overflow-y-auto flex flex-col items-center justify-center p-6 bg-transparent text-muted-foreground">
      <div className="w-full max-w-xl flex flex-col items-center gap-6 my-auto">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-16 w-16 rounded-full border border-primary/30 animate-ping opacity-25" />
            <div className="h-12 w-12 rounded-2xl panel-glass border border-primary/40 flex items-center justify-center shadow-lg shadow-primary/15">
              {noSagas ? (
                <Sparkles className="h-6 w-6 text-primary" />
              ) : (
                <Compass className="h-6 w-6 text-primary animate-pulse" />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {message}
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              {subtitle ??
                (noSagas
                  ? 'Create a fresh Saga, import an archive, or point Loreweave to an existing Saga folder.'
                  : 'Initializing local workbench workspace')}
            </p>
          </div>
        </div>

        {detail && (
          <pre className="w-full text-xs text-rose-300 font-mono whitespace-pre-wrap rounded-xl border border-rose-500/30 bg-rose-950/35 backdrop-blur-md p-4 shadow-inner">
            {detail}
          </pre>
        )}

        {showOnboardingCard && onCreateSaga && (
          <form
            onSubmit={handleCreate}
            className="w-full panel-glass rounded-2xl p-5 shadow-2xl space-y-4 text-left"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-3">
              <div className="flex items-center gap-2 text-foreground">
                <BookPlus className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Create a New Saga</h3>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                {normalizedRoot}/
              </span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="splash-saga-title"
                  className="block text-xs font-medium text-foreground/90"
                >
                  Saga Title
                </label>
                <input
                  id="splash-saga-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (createError) setCreateError(null);
                  }}
                  placeholder="e.g. The Shattered Crown"
                  disabled={creating}
                  autoFocus
                  className="w-full rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  → {normalizedRoot}/{derivedSlug}
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="splash-tome-title"
                  className="block text-xs font-medium text-foreground/90"
                >
                  First Tome Title
                </label>
                <input
                  id="splash-tome-title"
                  type="text"
                  value={tomeTitle}
                  onChange={(e) => setTomeTitle(e.target.value)}
                  placeholder="Book One"
                  disabled={creating}
                  className="w-full rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            {createError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-950/35 px-3 py-2 text-xs text-rose-300">
                {createError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button
                type="submit"
                size="sm"
                disabled={creating || !title.trim()}
                className="gap-2 rounded-xl interactive-lift"
              >
                <Plus className="h-3.5 w-3.5" />
                {creating ? 'Creating Saga…' : 'Create & Open Saga'}
              </Button>
            </div>
          </form>
        )}

        {(onOpenImport || onOpenSettings || onRetry || onResetDefault || (onCreateSaga && detail && !showCreateForm)) && (
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {onCreateSaga && detail && !showCreateForm && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowCreateForm(true)}
                className="gap-2 rounded-xl interactive-lift"
              >
                <BookPlus className="h-3.5 w-3.5" />
                New Saga…
              </Button>
            )}
            {onOpenImport && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenImport}
                className="gap-2 rounded-xl panel-glass interactive-lift"
              >
                <Upload className="h-3.5 w-3.5" />
                Import Saga (.zip)…
              </Button>
            )}
            {onOpenSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSettings}
                className="gap-2 rounded-xl panel-glass interactive-lift"
              >
                <FolderCog className="h-3.5 w-3.5" />
                Discovery & AI Settings…
              </Button>
            )}
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="gap-2 rounded-xl panel-glass interactive-lift"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Connection
              </Button>
            )}
            {onResetDefault && (
              <Button
                variant="outline"
                size="sm"
                onClick={onResetDefault}
                className="gap-2 rounded-xl panel-glass interactive-lift"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to Default Saga
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
