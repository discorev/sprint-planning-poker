import { memo } from 'react';
import { SUITS } from '../theme';

interface CardDeckProps {
  readonly cards: readonly string[];
  readonly selection?: string;
  readonly disabled: boolean;
  readonly onChoose: (choice: string) => void;
}

export const CardDeck = memo(function CardDeck({ cards, selection, disabled, onChoose }: CardDeckProps) {
  return (
    <div className="deck">
      {cards.map((card, index) => {
        const chosen = card === selection;
        const suit = SUITS[index % SUITS.length];
        const red = suit.red ? ' red' : '';
        return (
          <button
            aria-label={card}
            aria-pressed={chosen}
            className={`card${chosen ? ' selected' : ''}`}
            disabled={disabled}
            key={card}
            onClick={() => onChoose(card)}
            type="button"
          >
            <span aria-hidden="true" className={`corner tl${red}`}>{card}</span>
            <span aria-hidden="true" className={`corner br${red}`}>{card}</span>
            <span aria-hidden="true" className="value">{card}</span>
            <i aria-hidden="true" className={`suit-mark fa-solid ${suit.icon}${red}`} />
          </button>
        );
      })}
    </div>
  );
});
