import { memo } from 'react';
import { THEMES, type Theme } from '../theme';

interface ThemeToggleProps {
  readonly theme: Theme;
  readonly onToggle: () => void;
}

export const ThemeToggle = memo(function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const offeringNight = theme === 'felt';
  return (
    <button aria-label={`Switch to ${THEMES[theme].toggleWord} theme`} className="theme-toggle" onClick={onToggle} type="button">
      <i aria-hidden="true" className={`orb fa-light ${offeringNight ? 'fa-moon' : 'fa-sun-bright'}`} />
      <span>{THEMES[theme].toggleWord}</span>
    </button>
  );
});
