import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brain, Diamond, Eye, MicrochipAi, Moon, Snooze, Spade, User } from './icons';
import type { Player } from '../protocol';
import type { Theme } from '../theme';

interface PlayerCardProps {
  readonly index: number;
  readonly isYou: boolean;
  readonly player: Player;
  readonly showReset: boolean;
  readonly theme: Theme;
  readonly onSnooze: (name: string) => void;
}

interface PopoverPosition {
  readonly left: number;
  readonly top: number;
  readonly flipUp: boolean;
}

export const PlayerCard = memo(function PlayerCard({ index, isYou, player, showReset, theme, onSnooze }: PlayerCardProps) {
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const positionPopover = useCallback(() => {
    const button = buttonRef.current;
    const popover = popoverRef.current;
    if (!button || !popover) {
      return;
    }
    const rect = button.getBoundingClientRect();
    const margin = 10;
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, margin), window.innerWidth - width - margin);
    const below = rect.bottom + 10;
    const flipUp = below + height > window.innerHeight - margin && rect.top - 10 - height > margin;
    setPosition({ left, top: flipUp ? rect.top - 10 - height : below, flipUp });
  }, []);

  useEffect(() => {
    if (!rationaleOpen) {
      return;
    }
    positionPopover();
    const closeOutside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && !buttonRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setRationaleOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRationaleOpen(false);
      }
    };
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, { passive: true });
    document.addEventListener('click', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('resize', positionPopover);
      window.removeEventListener('scroll', positionPopover);
      document.removeEventListener('click', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [positionPopover, rationaleOpen]);

  const classes = [
    'player',
    player.selected && !showReset ? 'voted' : '',
    isYou ? 'is-you' : '',
    player.type === 'agent' ? 'is-agent' : '',
    player.disconnected ? 'disconnected' : '',
    player.snoozed ? 'snoozed' : '',
  ].filter(Boolean).join(' ');

  const playerSub = player.observer
    ? 'observer'
    : player.disconnected
      ? 'left after voting'
      : player.snoozed
        ? 'sitting this one out'
        : showReset
          ? player.choice === undefined ? 'no vote' : ''
          : player.selected ? 'vote is in' : 'deciding…';

  return (
    <article aria-label={`Player ${player.name}`} className={classes}>
      <div className="corner-status">
        {player.observer ? <span className="badge watch">watching</span> : player.disconnected ? (
          <span className="badge gone">left</span>
        ) : (
          <button
            className={`snooze-btn${player.snoozed ? ' active' : ''}`}
            onClick={() => onSnooze(player.name)}
            type="button"
          >
            {player.snoozed ? <Snooze aria-hidden="true" /> : <Moon aria-hidden="true" />}
            <span className="sr-only">Click to {player.snoozed ? 'un-snooze' : 'snooze'} player {player.name}</span>
          </button>
        )}
      </div>
      <div className="mini-wrap">
        {player.observer ? (
          <div aria-label="observer" className="mini empty" title="observer">
            <Eye aria-hidden="true" />
          </div>
        ) : player.choice !== undefined ? (
          <div aria-label={`voted ${player.choice}`} className="mini face" style={{ animationDelay: `${index * 90}ms` }}>
            {player.choice}
          </div>
        ) : player.selected ? (
          <div aria-label="vote hidden" className="mini back" title="vote is in">
            {theme === 'felt' ? <Spade aria-hidden="true" /> : <Diamond aria-hidden="true" />}
          </div>
        ) : player.snoozed ? (
          <div aria-label="snoozed" className="mini empty"><span className="pill-snoozed">snoozed</span></div>
        ) : (
          <div aria-label="not voted yet" className="mini empty">·</div>
        )}
      </div>
      <h5 className="player-name">
        {player.type === 'agent' ? <MicrochipAi aria-hidden="true" /> : <User aria-hidden="true" />}
        <span className="sr-only">{player.type === 'agent' ? 'ai player' : 'human player'}</span>
        {player.name}
      </h5>
      <div className="player-sub">{playerSub}</div>
      {showReset && player.rationale ? (
        <>
          <button
            aria-expanded={rationaleOpen}
            className="rationale-btn"
            onClick={() => setRationaleOpen((open) => !open)}
            ref={buttonRef}
            title={player.rationale}
            type="button"
          >
            <Brain aria-hidden="true" />why {player.choice}?
            <span className="sr-only">rationale: {player.rationale}</span>
          </button>
          {rationaleOpen ? createPortal(
            <div
              className={`rationale-pop${position?.flipUp ? ' flip-up' : ''}`}
              ref={popoverRef}
              role="note"
              style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
            >
              {player.rationale}
            </div>,
            document.body,
          ) : null}
        </>
      ) : null}
    </article>
  );
});
