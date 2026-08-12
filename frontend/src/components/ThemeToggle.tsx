import { memo } from 'react';
import { Moon, SunBright } from './icons';
import { THEMES, type Theme } from '../theme';

interface ThemeToggleProps {
  readonly theme: Theme;
  readonly onToggle: () => void;
}

export const ThemeToggle = memo(function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const offeringNight = theme === 'felt';
  return (
    <button aria-label={`Switch to ${THEMES[theme].toggleWord} theme`} className="theme-toggle" onClick={onToggle} type="button">
      {offeringNight ? <Moon aria-hidden="true" className="orb" /> : <SunBright aria-hidden="true" className="orb" />}
      <span>{THEMES[theme].toggleWord}</span>
    </button>
  );
});
