import { rankLabel, SUIT_SYMBOL, type Card } from '../../domain/cards';

const SUIT_NAME = { s: 'pique', h: 'cœur', d: 'carreau', c: 'trèfle' } as const;

export function PlayingCard({ card, width }: { card: Card; width?: number }) {
  return (
    <div
      className={`pcard ${card.suit}`}
      style={width ? ({ '--w': `${width}px` } as React.CSSProperties) : undefined}
      role="img"
      aria-label={`${rankLabel(card.rank)} de ${SUIT_NAME[card.suit]}`}
    >
      <span className="pc-rank">{rankLabel(card.rank)}</span>
      <span className="pc-suit-sm">{SUIT_SYMBOL[card.suit]}</span>
      <span className="pc-suit">{SUIT_SYMBOL[card.suit]}</span>
    </div>
  );
}

export function Hand({ cards, width, dealKey }: { cards: [Card, Card]; width?: number; dealKey?: string }) {
  return (
    <div className="pcards deal" key={dealKey}>
      <PlayingCard card={cards[0]} width={width} />
      <PlayingCard card={cards[1]} width={width} />
    </div>
  );
}
