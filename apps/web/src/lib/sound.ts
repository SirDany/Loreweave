import { useSyncExternalStore } from 'react';

const SOUND_STORAGE_KEY = 'lw.sound.enabled';

function loadSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw === '0' || raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

let soundEnabled = loadSoundEnabled();
const listeners = new Set<() => void>();

export function isSoundEnabled(): boolean {
  return soundEnabled;
}

export function setSoundEnabled(next: boolean): void {
  soundEnabled = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

export function toggleSound(): boolean {
  const next = !soundEnabled;
  setSoundEnabled(next);
  if (next) playSwitch();
  return next;
}

function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSoundEnabled(): [boolean, (next: boolean) => void, () => boolean] {
  const enabled = useSyncExternalStore(subscribeSound, isSoundEnabled, () => true);
  return [enabled, setSoundEnabled, toggleSound];
}

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (!soundEnabled) return null;
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    if (!sharedCtx) {
      sharedCtx = new AudioCtx();
    }
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

export type SoundProfileId = 'ethereal' | 'cyber' | 'organic' | 'punk' | 'noir';

let currentProfile: SoundProfileId = 'ethereal';

export function setSoundProfile(profile: SoundProfileId): void {
  currentProfile = profile;
}

export function getSoundProfile(): SoundProfileId {
  return currentProfile;
}

let lastHoverAt = 0;
let lastRadialAt = 0;

/**
 * Skin-matched hover tick (throttled to 45ms).
 */
export function playHover(): void {
  const nowMs = Date.now();
  if (nowMs - lastHoverAt < 45) return;
  lastHoverAt = nowMs;

  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (currentProfile === 'organic') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, t);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.014);
      gain.gain.setValueAtTime(0.018, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.016);
      return;
    }

    if (currentProfile === 'punk') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, t);
      osc.type = 'square';
      osc.frequency.setValueAtTime(680, t);
      osc.frequency.exponentialRampToValueAtTime(340, t + 0.009);
      gain.gain.setValueAtTime(0.011, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.009);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.011);
      return;
    }

    if (currentProfile === 'noir') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(310, t);
      gain.gain.setValueAtTime(0.012, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.02);
      return;
    }

    if (currentProfile === 'ethereal') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1480, t);
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.016);
      return;
    }

    // cyber default
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, t);
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.008);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.01);
  } catch {
    /* ignore audio failures */
  }
}

/**
 * Tactile click tailored to the active skin archetype.
 */
export function playClick(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (currentProfile === 'organic') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(720, t);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.024);
      gain.gain.setValueAtTime(0.045, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.024);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.028);
      return;
    }

    if (currentProfile === 'punk') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1150, t);
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(95, t + 0.024);
      gain.gain.setValueAtTime(0.032, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.024);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.028);
      return;
    }

    if (currentProfile === 'noir') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.028);
      gain.gain.setValueAtTime(0.036, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.032);
      return;
    }

    if (currentProfile === 'ethereal') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.exponentialRampToValueAtTime(440, t + 0.032);
      gain.gain.setValueAtTime(0.028, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.035);
      return;
    }

    // cyber
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.022);
    gain.gain.setValueAtTime(0.035, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.025);
  } catch {
    /* ignore */
  }
}

/**
 * Smooth two-tone chime tailored to active sound profile.
 */
export function playSwitch(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pairs: Record<SoundProfileId, [number, number, OscillatorType]> = {
      ethereal: [587.33, 880, 'sine'],
      cyber: [520, 780, 'sine'],
      organic: [293.66, 440, 'triangle'],
      punk: [220, 329.63, 'square'],
      noir: [261.63, 392, 'sine'],
    };
    const [f1, f2, type] = pairs[currentProfile];
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.setValueAtTime(f2, t + 0.03);

    if (currentProfile === 'punk' || currentProfile === 'organic') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(currentProfile === 'punk' ? 1400 : 1200, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(currentProfile === 'punk' ? 0.024 : 0.032, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.03, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.065);
      osc.connect(gain);
    }

    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.075);
  } catch {
    /* ignore */
  }
}

/**
 * Pitch-stepped musical harp tick for sweeping across the radial Grimoire wheel.
 */
export function playRadialTick(stepIndex: number, totalSteps = 9): void {
  const nowMs = Date.now();
  if (nowMs - lastRadialAt < 30) return;
  lastRadialAt = nowMs;

  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const scales: Record<SoundProfileId, number[]> = {
      ethereal: [392.0, 440.0, 493.88, 587.33, 659.25, 783.99, 880.0, 987.77, 1174.66],
      cyber: [440, 523.25, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1567.98],
      organic: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99],
      punk: [164.81, 196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88],
      noir: [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25],
    };
    const notes = scales[currentProfile];
    const ratio = totalSteps <= 1 ? 0.5 : Math.max(0, Math.min(1, stepIndex / (totalSteps - 1)));
    const noteIdx = Math.min(notes.length - 1, Math.round(ratio * (notes.length - 1)));
    const freq = notes[noteIdx] ?? 440;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(
      currentProfile === 'punk' ? 1450 : currentProfile === 'organic' ? 1100 : 2400,
      t,
    );
    const gain = ctx.createGain();
    osc.type =
      currentProfile === 'punk'
        ? 'square'
        : currentProfile === 'organic'
          ? 'triangle'
          : 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(currentProfile === 'punk' ? 0.018 : 0.022, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  } catch {
    /* ignore */
  }
}

/**
 * Resonant chord sweep tailored to active skin archetype when changing themes.
 */
export function playThemeMorph(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    const masterGain = ctx.createGain();
    filter.connect(masterGain);
    masterGain.connect(ctx.destination);

    if (currentProfile === 'ethereal') {
      filter.frequency.setValueAtTime(600, t);
      filter.frequency.exponentialRampToValueAtTime(3400, t + 0.14);
      masterGain.gain.setValueAtTime(0.0001, t);
      masterGain.gain.linearRampToValueAtTime(0.036, t + 0.02);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      [392.0, 587.33, 783.99, 1174.66].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.022);
        osc.connect(filter);
        osc.start(t + idx * 0.022);
        osc.stop(t + 0.25);
      });
      return;
    }

    if (currentProfile === 'organic') {
      filter.frequency.setValueAtTime(1250, t);
      masterGain.gain.setValueAtTime(0.0001, t);
      masterGain.gain.linearRampToValueAtTime(0.04, t + 0.015);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      [293.66, 369.99, 440.0].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + idx * 0.018);
        osc.connect(filter);
        osc.start(t + idx * 0.018);
        osc.stop(t + 0.21);
      });
      return;
    }

    if (currentProfile === 'punk') {
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.exponentialRampToValueAtTime(2200, t + 0.08);
      filter.frequency.exponentialRampToValueAtTime(750, t + 0.17);
      masterGain.gain.setValueAtTime(0.0001, t);
      masterGain.gain.linearRampToValueAtTime(0.03, t + 0.015);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      [164.81, 246.94, 329.63].forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t);
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + 0.19);
      });
      return;
    }

    if (currentProfile === 'noir') {
      filter.frequency.setValueAtTime(340, t);
      filter.frequency.exponentialRampToValueAtTime(1150, t + 0.1);
      filter.frequency.exponentialRampToValueAtTime(520, t + 0.24);
      masterGain.gain.setValueAtTime(0.0001, t);
      masterGain.gain.linearRampToValueAtTime(0.038, t + 0.03);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      [220.0, 261.63, 329.63, 392.0].forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + 0.26);
      });
      return;
    }

    // cyber
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.exponentialRampToValueAtTime(2800, t + 0.09);
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    masterGain.gain.setValueAtTime(0.0001, t);
    masterGain.gain.linearRampToValueAtTime(0.04, t + 0.025);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    const freqs: Array<[number, OscillatorType]> = [
      [330, 'triangle'],
      [495, 'sine'],
      [660, 'sine'],
    ];
    for (const [freq, type] of freqs) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 0.19);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Ascending triad arpeggio (523.25Hz -> 659.25Hz -> 783.99Hz -> 1046.5Hz, 160ms, gain 0.035).
 */
export function playSuccess(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const start = t + idx * 0.035;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.035, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.06);
    });
  } catch {
    /* ignore */
  }
}

/**
 * Soft airy sweep for modal opening (380Hz -> 640Hz, 70ms, gain 0.025).
 */
export function playModalOpen(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(640, t + 0.07);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.025, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.075);
  } catch {
    /* ignore */
  }
}

/**
 * Soft airy sweep for modal closing (640Hz -> 360Hz, 70ms, gain 0.025).
 */
export function playModalClose(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, t);
    osc.frequency.exponentialRampToValueAtTime(360, t + 0.07);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.025, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.075);
  } catch {
    /* ignore */
  }
}

let globalInitialized = false;

/**
 * Attach delegated click and hover feedback listeners to document.
 * Safe in non-browser/test environments and idempotent across repeated calls.
 */
export function initGlobalSoundEffects(): void {
  if (globalInitialized) return;
  if (typeof document === 'undefined') return;
  globalInitialized = true;

  let lastHoverTarget: Element | null = null;

  document.addEventListener(
    'mousedown',
    (e) => {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;
      const hit = target.closest(
        'button, [role="button"], a, select, summary, [data-sound="click"]',
      );
      if (
        hit &&
        hit.getAttribute('data-sound') !== 'none' &&
        !(hit as HTMLButtonElement).disabled
      ) {
        playClick();
      }
    },
    { passive: true, capture: true },
  );

  document.addEventListener(
    'mouseover',
    (e) => {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== 'function') return;
      const hit = target.closest('button, [role="button"], [data-sound="hover"]');
      if (
        hit &&
        hit !== lastHoverTarget &&
        hit.getAttribute('data-sound') !== 'none' &&
        !(hit as HTMLButtonElement).disabled
      ) {
        lastHoverTarget = hit;
        playHover();
      } else if (!hit) {
        lastHoverTarget = null;
      }
    },
    { passive: true },
  );
}
