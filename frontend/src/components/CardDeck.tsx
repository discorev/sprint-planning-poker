import { memo } from 'react';

interface CardDeckProps {
  readonly cards: readonly string[];
  readonly selection?: string;
  readonly disabled: boolean;
  readonly onChoose: (choice: string) => void;
}

export const CardDeck = memo(function CardDeck({ cards, selection, disabled, onChoose }: CardDeckProps) {
  return (
    <div className="flex w-full">
      <div className="-mx-[15px] flex w-full">
        {cards.map((card) => {
          const chosen = card === selection;
          return (
            <button
              aria-pressed={chosen}
              className={`relative mx-[15px] min-w-0 flex-1 rounded-[0.7rem] border bg-white text-[#212529] transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007bff] ${
                chosen
                  ? '-translate-y-[0.6em] border-[#007bff]'
                  : 'border-black/15 hover:border-black/30'
              } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
              disabled={disabled}
              key={card}
              onClick={() => onChoose(card)}
              style={{ aspectRatio: '2.5 / 3.5' }}
              type="button"
            >
              <span className="absolute inset-0 flex items-center justify-center p-5">{card}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
