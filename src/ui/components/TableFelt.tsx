import type { ReactNode } from 'react';
import { seatsFor, type SeatState } from '../../domain/situation';
import type { RangeDef } from '../../domain/types';

function Seat({ seat, place }: { seat: SeatState; place: string }) {
  return (
    <div className={`seat seat-${place} k-${seat.kind}`}>
      <span className="seat-pill">
        {seat.position}
        {seat.dealer && (
          <i className="dealer" aria-label="Bouton dealer">
            D
          </i>
        )}
      </span>
      {seat.action ? <span className="seat-action">{seat.action}</span> : <span className="seat-wait">à parler</span>}
    </div>
  );
}

/** Poker table seen from the hero's seat; the hero's cards sit on the felt. */
export function TableFelt({ range, children }: { range: RangeDef; children?: ReactNode }) {
  const seats = seatsFor(range);
  const [hero, ...others] = seats;
  const places = others.length === 1 ? ['top'] : ['left', 'right'];
  return (
    <div className={`felt felt-${range.format}`}>
      <div className="felt-rail">
        <div className="felt-surface" />
      </div>
      {others.map((s, i) => (
        <Seat key={s.position} seat={s} place={places[i] ?? 'top'} />
      ))}
      <div className="felt-center">
        <span className="felt-label">Tapis</span>
        <span className="felt-stack num">{range.stackBb} BB</span>
      </div>
      <div className="felt-cards">{children}</div>
      <div className="hero-pill">
        Toi · {hero?.position}
        {hero?.dealer && <i className="dealer">D</i>}
      </div>
    </div>
  );
}
