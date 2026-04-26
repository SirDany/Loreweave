import {
  AlertTriangle,
  Compass,
  Database,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Separator } from '../components/ui/separator.js';
import type { DumpPayload } from '../lib/lw.js';
import { cn } from '../lib/utils.js';
import { ActionsMenu } from './ActionsMenu.js';

interface ShelfProps {
  data: DumpPayload;
  loading: boolean;
  tomeLens: string | null;
  onSelectTomeLens: (id: string | null) => void;
  onPickSaga: () => void;
  onReload: () => void;

  // Dialog triggers
  onExport: () => void;
  onImport: () => void;
  onSearch: () => void;
  onBackups: () => void;
  onSettings: () => void;
  onComposeLens: () => void;
  onRules: () => void;
  onToggleAssistant: () => void;
  assistantOpen: boolean;
}

/**
 * Left sidebar — Saga brand, the Actions dropdown, the Tome lens
 * selector, and the diagnostics status. Replaces the old 6-button
 * action grid with a compact dropdown so the Shelf stays calm.
 */
export function Shelf({
  data,
  loading,
  tomeLens,
  onSelectTomeLens,
  onPickSaga,
  onReload,
  onExport,
  onImport,
  onSearch,
  onBackups,
  onSettings,
  onComposeLens,
  onRules,
  onToggleAssistant,
  assistantOpen,
}: ShelfProps) {
  const errors = data.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = data.diagnostics.filter(
    (d) => d.severity === 'warning',
  ).length;

  return (
    <aside className="w-60 shrink-0 flex flex-col gap-5 border-r border-border bg-card/60 px-4 py-5 bg-parchment-grain">
      <div>
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-primary" />
          <span className="label-rune">Shelf</span>
        </div>
        <div className="mt-2 font-serif text-xl leading-tight text-foreground">
          {data.saga.title ?? data.saga.id}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground truncate">
          {data.saga.id}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full justify-start gap-2"
          onClick={onPickSaga}
        >
          <Database className="h-3.5 w-3.5" />
          Open Saga…
        </Button>
        <div className="mt-2">
          <ActionsMenu
            onExport={onExport}
            onImport={onImport}
            onSearch={onSearch}
            onBackups={onBackups}
            onSettings={onSettings}
            onComposeLens={onComposeLens}
            onRules={onRules}
            onToggleAssistant={onToggleAssistant}
            assistantOpen={assistantOpen}
          />
        </div>
      </div>

      <Separator />

      <div>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary/80" />
          <span className="label-rune">Tome lens</span>
        </div>
        <ul className="mt-2 space-y-0.5">
          <TomeItem
            active={tomeLens === null}
            onClick={() => onSelectTomeLens(null)}
            label="All Tomes"
          />
          {data.tomes.map((t) => (
            <TomeItem
              key={t.id}
              active={tomeLens === t.id}
              onClick={() => onSelectTomeLens(t.id)}
              label={t.title}
            />
          ))}
        </ul>
      </div>

      <div className="mt-auto space-y-2">
        <Separator />
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="label-rune">Status</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant={errors ? 'danger' : 'success'}>
            {errors} error{errors !== 1 ? 's' : ''}
          </Badge>
          <Badge variant={warnings ? 'warning' : 'secondary'}>
            {warnings} warn{warnings !== 1 ? 's' : ''}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={onReload}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          {loading ? 'Reloading…' : 'Reload'}
        </Button>
      </div>
    </aside>
  );
}

function TomeItem({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={cn(
          'w-full rounded-md px-2 py-1 text-left text-sm transition-colors',
          active
            ? 'bg-accent text-accent-foreground'
            : 'text-foreground/85 hover:bg-muted hover:text-foreground',
        )}
      >
        {label}
      </button>
    </li>
  );
}
