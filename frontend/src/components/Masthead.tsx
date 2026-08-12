import { memo } from 'react';
import { SUITS, THEMES, type Theme } from '../theme';

interface MastheadProps {
  readonly full?: boolean;
  readonly theme: Theme;
}

export const Masthead = memo(function Masthead({ full = false, theme }: MastheadProps) {
  return (
    <header className="masthead">
      <div className="kicker">{THEMES[theme].kicker}</div>
      <h1>Sprint Planning Poker</h1>
      {full ? (
        <>
          <div className="suits" aria-hidden="true">
            {SUITS.map(({ name, Icon, red }) => <Icon className={red ? 'red' : undefined} key={name} />)}
          </div>
          <hr className="rule" />
        </>
      ) : null}
    </header>
  );
});
