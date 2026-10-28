import { useEffect } from 'react';
import type { ThemePref } from '../domain/types';

/** Aplica el tema (claro, oscuro o el del sistema) a <html>. */
export function useTheme(pref: ThemePref) {
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'oscuro' || (pref === 'sistema' && !!mq?.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121614' : '#2f6f4f');
    };
    apply();
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [pref]);
}
