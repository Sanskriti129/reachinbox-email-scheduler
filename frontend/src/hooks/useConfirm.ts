import { useEffect, useState } from 'react';

/**
 * Two-step confirm for destructive buttons: the first click arms it, a second
 * click within `ms` confirms, otherwise it disarms itself.
 */
export function useConfirm(ms = 3000) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ms);
    return () => clearTimeout(t);
  }, [armed, ms]);
  return { armed, arm: () => setArmed(true), disarm: () => setArmed(false) };
}
