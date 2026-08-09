import { memo } from 'react';
import type { Player } from '../protocol';

interface PlayerCardProps {
  readonly player: Player;
  readonly onSnooze: (name: string) => void;
}

export const PlayerCard = memo(function PlayerCard({ player, onSnooze }: PlayerCardProps) {
  return (
    <div className={`player-choice relative rounded border bg-white ${player.selected ? 'border-[#007bff]' : 'border-black/15'}`}>
      <div className="p-5 text-center">
        {!player.observer ? (
          <span className={`absolute right-[5px] top-[2px] ${player.snoozed ? 'text-fuchsia-500' : 'text-[#d8d8d8]'}`}>
            <span className="sr-only">{player.snoozed ? 'snoozed' : 'active'} player</span>
            <button
              className="border-0 bg-transparent p-0 text-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-500"
              onClick={() => onSnooze(player.name)}
              type="button"
            >
              <i aria-hidden="true" className={`${player.snoozed ? 'far' : 'fal'} fa-snooze`} />
              <span className="sr-only">Click to {player.snoozed ? 'un-snooze' : 'snooze'} player {player.name}</span>
            </button>
          </span>
        ) : (
          <span className="absolute right-[5px] top-[2px] text-[#d8d8d8]">
            <i aria-hidden="true" className="fa-regular fa-eyes" title="observer" />
            <span className="sr-only">observer</span>
          </span>
        )}
        <h5 className="mb-3 text-xl font-medium leading-tight">{player.name}</h5>
        <p className="mb-0">{player.choice ?? ' '}</p>
      </div>
    </div>
  );
});
