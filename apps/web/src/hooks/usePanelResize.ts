import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** If true, dragging RIGHT grows the panel (left-side panels).
   *  If false (default), dragging LEFT grows the panel (right-side panels). */
  growOnRight?: boolean;
}

function readStored(key: string, def: number, min: number, max: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v) return Math.max(min, Math.min(max, Number(v)));
  } catch {
    /* ignore */
  }
  return def;
}

/** Drag-to-resize hook with localStorage persistence. */
export function usePanelResize({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  growOnRight = false,
}: Options) {
  const [width, setWidth] = useState<number>(() =>
    readStored(storageKey, defaultWidth, minWidth, maxWidth),
  );

  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width));
    } catch {
      /* ignore */
    }
  }, [storageKey, width]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = width;
      e.preventDefault();
    },
    [width],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = growOnRight
        ? e.clientX - startX.current   // right-side panels: drag right grows
        : startX.current - e.clientX;  // left-side panels: drag left grows
      setWidth(Math.max(minWidth, Math.min(maxWidth, startW.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [growOnRight, minWidth, maxWidth]);

  return { width, handleMouseDown };
}
