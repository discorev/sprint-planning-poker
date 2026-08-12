import { useCallback, useLayoutEffect, useState } from 'react';

export type Theme = 'felt' | 'night';

export const SUITS = [
  { icon: 'fa-spade', red: false },
  { icon: 'fa-heart', red: true },
  { icon: 'fa-diamond', red: true },
  { icon: 'fa-club', red: false },
] as const;

interface ThemeText {
  readonly join: string;
  readonly kicker: string;
  readonly placeholder: string;
  readonly consensus: string;
  readonly confetti: readonly string[];
  readonly toggleWord: string;
}

export const THEMES: Readonly<Record<Theme, ThemeText>> = {
  felt: {
    join: 'Take a seat',
    kicker: 'The Card Room · Session: Default',
    placeholder: 'Your name at the table',
    consensus: 'Consensus — well played.',
    confetti: ['#d8b366', '#efd9a7', '#f6eeda', '#7e2836'],
    toggleWord: 'Night',
  },
  night: {
    join: 'Jack in',
    kicker: 'session // default',
    placeholder: 'handle_',
    consensus: 'Consensus locked',
    confetti: ['#5ff2ff', '#ff5ca8', '#6b7bff', '#ffc86b'],
    toggleWord: 'Day',
  },
};

function initialTheme(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'felt' || stored === 'night') {
    return stored;
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'night' : 'felt';
}

export function useTheme(): readonly [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useLayoutEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'felt' ? 'night' : 'felt';
      localStorage.setItem('theme', next);
      return next;
    });
  }, []);

  return [theme, toggle];
}
