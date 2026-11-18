import { useMemo } from 'react';
import { buildPatternDataUrl } from '../theme/skins.js';
import { useSkin } from '../theme/SkinProvider.js';

interface ParticleSpec {
  id: number;
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
}

const PARTICLES: readonly ParticleSpec[] = [
  { id: 1, left: '8%', top: '22%', size: 3, delay: '0s', duration: '13s' },
  { id: 2, left: '16%', top: '74%', size: 2, delay: '1.8s', duration: '16s' },
  { id: 3, left: '24%', top: '42%', size: 4, delay: '3.2s', duration: '15s' },
  { id: 4, left: '34%', top: '86%', size: 2, delay: '0.7s', duration: '18s' },
  { id: 5, left: '43%', top: '18%', size: 3, delay: '4.1s', duration: '14s' },
  { id: 6, left: '52%', top: '62%', size: 3, delay: '2.3s', duration: '17s' },
  { id: 7, left: '61%', top: '31%', size: 2, delay: '5.5s', duration: '12s' },
  { id: 8, left: '69%', top: '80%', size: 4, delay: '1.1s', duration: '19s' },
  { id: 9, left: '77%', top: '47%', size: 2, delay: '3.9s', duration: '15s' },
  { id: 10, left: '84%', top: '16%', size: 3, delay: '0.4s', duration: '16s' },
  { id: 11, left: '91%', top: '68%', size: 3, delay: '2.9s', duration: '14s' },
  { id: 12, left: '48%', top: '92%', size: 2, delay: '6.0s', duration: '18s' },
];

const SHARD_GLYPHS = [
  { id: 1, glyph: '✕', left: '12%', top: '18%', delay: '0s', duration: '11s', size: 15 },
  { id: 2, glyph: '△', left: '28%', top: '78%', delay: '1.5s', duration: '13s', size: 16 },
  { id: 3, glyph: '◇', left: '46%', top: '24%', delay: '2.8s', duration: '12s', size: 14 },
  { id: 4, glyph: '+', left: '64%', top: '82%', delay: '0.8s', duration: '10s', size: 18 },
  { id: 5, glyph: '⚡', left: '79%', top: '28%', delay: '3.4s', duration: '14s', size: 15 },
  { id: 6, glyph: '◆', left: '88%', top: '72%', delay: '2.1s', duration: '12s', size: 13 },
];

const BOTANICAL_LEAVES = [
  { id: 1, left: '10%', top: '16%', size: 140, delay: '0s' },
  { id: 2, left: '74%', top: '12%', size: 180, delay: '2.2s' },
  { id: 3, left: '22%', top: '74%', size: 160, delay: '4.1s' },
  { id: 4, left: '80%', top: '68%', size: 130, delay: '1.3s' },
];

/**
 * Spatial ambient canvas — renders injectable pattern tiles alongside archetype-specific
 * motion atmospheres (`aurora-stars`, `cyber-scan`, `pastel-breeze`, `punk-shards`, `deco-shimmer`).
 */
export function AmbientBackground() {
  const { skin, pattern } = useSkin();
  const isLight = skin.tokens.scheme === 'light';
  const motion = pattern.motion;

  const patternUrl = useMemo(
    () => buildPatternDataUrl(pattern.svg, skin.tokens.primary),
    [pattern.svg, skin.tokens.primary],
  );

  const backdropStyle = useMemo(() => {
    if (motion === 'pastel-breeze') {
      return `radial-gradient(ellipse 85% 65% at 15% 10%, hsl(var(--primary) / 0.16), transparent 62%), radial-gradient(ellipse 75% 60% at 88% 88%, hsl(var(--ring) / 0.15), transparent 64%), hsl(var(--background))`;
    }
    if (motion === 'punk-shards') {
      return `radial-gradient(circle at 82% 16%, hsl(var(--ring) / 0.22), transparent 50%), radial-gradient(circle at 12% 88%, hsl(var(--primary) / 0.18), transparent 50%), hsl(var(--background))`;
    }
    if (motion === 'deco-shimmer') {
      return `radial-gradient(ellipse 80% 70% at 50% 45%, hsl(var(--primary) / 0.2), transparent 70%), radial-gradient(circle at 50% 105%, hsl(var(--ring) / 0.22), transparent 62%), hsl(var(--background))`;
    }
    return `radial-gradient(ellipse 90% 70% at 50% -10%, hsl(var(--primary) / ${isLight ? '0.22' : '0.32'}), transparent 68%), radial-gradient(ellipse 80% 60% at 85% 110%, hsl(var(--ring) / ${isLight ? '0.18' : '0.28'}), transparent 65%), radial-gradient(ellipse 65% 50% at 10% 90%, hsl(var(--accent) / ${isLight ? '0.26' : '0.32'}), transparent 62%), hsl(var(--background))`;
  }, [motion, isLight]);

  return (
    <div
      data-ambient-skin={skin.id}
      data-ambient-pattern={pattern.id}
      data-ambient-motion={motion}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none transition-colors duration-500"
      style={{ background: backdropStyle }}
    >
      {/* Injectable Pattern Tile Layer */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: pattern.opacity,
          backgroundImage: patternUrl,
          backgroundSize: pattern.size,
          maskImage:
            motion === 'pastel-breeze' || motion === 'punk-shards'
              ? undefined
              : 'radial-gradient(ellipse 110% 105% at 50% 50%, rgba(0,0,0,1) 55%, rgba(0,0,0,0.65) 100%)',
          WebkitMaskImage:
            motion === 'pastel-breeze' || motion === 'punk-shards'
              ? undefined
              : 'radial-gradient(ellipse 110% 105% at 50% 50%, rgba(0,0,0,1) 55%, rgba(0,0,0,0.65) 100%)',
        }}
      />

      {/* Archetype Motion 1: Aurora Stars (Cosmic Glass) */}
      {motion === 'aurora-stars' && (
        <>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
          <div
            className="animate-aurora-slow absolute -top-36 -left-24 h-[36rem] w-[36rem] rounded-full blur-3xl transition-colors duration-700"
            style={{
              background: `radial-gradient(circle, hsl(var(--primary) / 0.36) 0%, transparent 72%)`,
            }}
          />
          <div
            className="animate-aurora-reverse absolute -bottom-40 -right-24 h-[40rem] w-[40rem] rounded-full blur-3xl transition-colors duration-700"
            style={{
              background: `radial-gradient(circle, hsl(var(--ring) / 0.32) 0%, hsl(var(--accent) / 0.4) 45%, transparent 74%)`,
            }}
          />
          {PARTICLES.map((p) => (
            <span
              key={p.id}
              className="animate-float-up absolute rounded-full"
              style={{
                left: p.left,
                top: p.top,
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: `hsl(var(--primary))`,
                boxShadow: `0 0 ${p.size * 3.5}px hsl(var(--primary) / 0.85)`,
                animationDelay: p.delay,
                animationDuration: p.duration,
              }}
            />
          ))}
        </>
      )}

      {/* Archetype Motion 2: Cyber Scan (Sci-Fi HUD) */}
      {motion === 'cyber-scan' && (
        <>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/90 to-transparent" />
          <div
            className="animate-scan-sweep absolute inset-x-0 h-24 pointer-events-none"
            style={{
              background:
                'linear-gradient(180deg, transparent 0%, hsl(var(--primary) / 0.2) 50%, hsl(var(--ring) / 0.24) 98%, hsl(var(--primary) / 0.65) 100%)',
            }}
          />
          {PARTICLES.map((p) => (
            <span
              key={p.id}
              className="animate-float-up absolute"
              style={{
                left: p.left,
                top: p.top,
                width: `${p.size + 1}px`,
                height: `${p.size + 1}px`,
                backgroundColor: p.id % 3 === 0 ? `hsl(var(--ring))` : `hsl(var(--primary))`,
                boxShadow: `0 0 ${p.size * 3}px hsl(var(--primary) / 0.85)`,
                animationDelay: p.delay,
                animationDuration: p.duration,
              }}
            />
          ))}
        </>
      )}

      {/* Archetype Motion 3: Pastel Breeze (Matte Pastel Tactile Paper) */}
      {motion === 'pastel-breeze' && (
        <>
          {BOTANICAL_LEAVES.map((leaf) => (
            <div
              key={leaf.id}
              className="animate-petal-breeze absolute rounded-full border border-primary/25"
              style={{
                left: leaf.left,
                top: leaf.top,
                width: `${leaf.size}px`,
                height: `${leaf.size}px`,
                background:
                  leaf.id % 2 === 0
                    ? 'radial-gradient(circle, hsl(var(--primary) / 0.14) 0%, transparent 72%)'
                    : 'radial-gradient(circle, hsl(var(--ring) / 0.14) 0%, transparent 72%)',
                animationDelay: leaf.delay,
              }}
            />
          ))}
          <div className="absolute inset-3 rounded-2xl border border-primary/20 pointer-events-none" />
        </>
      )}

      {/* Archetype Motion 4: Punk Shards (Punk Brutalist) */}
      {motion === 'punk-shards' && (
        <>
          <div
            className="absolute -top-10 -right-12 h-48 w-80 rotate-6 border-2 border-primary/60 bg-ring/18"
          />
          <div
            className="absolute -bottom-12 -left-10 h-44 w-72 -rotate-3 border-2 border-ring/60 bg-primary/18"
          />
          {SHARD_GLYPHS.map((shard) => (
            <span
              key={shard.id}
              className="animate-shard-drift absolute font-mono font-bold select-none"
              style={{
                left: shard.left,
                top: shard.top,
                fontSize: `${shard.size}px`,
                color: shard.id % 2 === 0 ? `hsl(var(--ring) / 0.58)` : `hsl(var(--primary) / 0.58)`,
                animationDelay: shard.delay,
                animationDuration: shard.duration,
              }}
            >
              {shard.glyph}
            </span>
          ))}
        </>
      )}

      {/* Archetype Motion 5: Deco Shimmer (Art-Deco Noir) */}
      {motion === 'deco-shimmer' && (
        <>
          <svg
            viewBox="0 0 600 600"
            className="animate-spin-slow absolute left-1/2 top-1/2 h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2 opacity-[0.24]"
            style={{ color: `hsl(var(--primary))` }}
          >
            <circle cx="300" cy="300" r="260" fill="none" stroke="currentColor" strokeWidth="1.15" />
            <circle cx="300" cy="300" r="220" fill="none" stroke="currentColor" strokeWidth="0.9" strokeDasharray="4 8" />
            <polygon
              points="300,30 340,260 570,300 340,340 300,570 260,340 30,300 260,260"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.15"
            />
            <polygon
              points="110,110 300,245 490,110 355,300 490,490 300,355 110,490 245,300"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.9"
            />
          </svg>
          <div className="absolute inset-4 border border-primary/30 pointer-events-none" />
          <div className="absolute inset-6 border border-primary/18 pointer-events-none" />
        </>
      )}

      {/* HUD Corner Reticles (enabled for telemetry patterns) */}
      {pattern.hudReticles && (
        <>
          <div className="absolute top-3 left-3 h-4 w-4 border-l-2 border-t-2 border-primary/50" />
          <div className="absolute top-3 right-3 h-4 w-4 border-r-2 border-t-2 border-primary/50" />
          <div className="absolute bottom-3 left-3 h-4 w-4 border-l-2 border-b-2 border-primary/50" />
          <div className="absolute bottom-3 right-3 h-4 w-4 border-r-2 border-b-2 border-primary/50" />
        </>
      )}
    </div>
  );
}
