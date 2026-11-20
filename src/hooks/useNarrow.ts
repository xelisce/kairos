import { useEffect, useState } from 'react';

/** Phone-sized screen (the app switches to its one-column layout below this width). */
export const NARROW_PX = 900;

export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_PX);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < NARROW_PX);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return narrow;
}
