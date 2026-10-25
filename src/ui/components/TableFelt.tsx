import type { ReactNode } from 'react';
import { seatsFor, type SeatState } from '../../domain/situation';
import type { RangeDef } from '../../domain/types';

function Seat({ seat, place }: { seat: SeatState; place: string }) {
  return (
    <div className={`seat seat-${place} k-${seat.kind}`}>
      <div className="seat-avatar">
        <span>{seat.position}</span>
        {seat.dealer && (
          <i className="dealer" aria-label="Bouton dealer">
            D
          </i>
        )}
      </div>
      {seat.action && <div className="seat-action">{seat.action}</div>}
      {!seat.action && !seat.hero && <div className="seat-wait">à parler</div>}
    </div>
  );
}

/** Mini table showing positions and the action before the hero. */
export function TableFelt({ range, children }: { range: RangeDef; children?: ReactNode }) {
  const seats = seatsFor(range);
  const [, ...others] = seats;
  const places = others.length === 1 ? ['top'] : ['left', 'right'];
  return (
    <div className={`felt felt-${range.format}`}>
      <div className="felt-surface">
        <div className="felt-center">
          <span className="felt-stack num">{range.stackBb} BB</span>
          <span className="felt-label">profondeur</span>
        </div>
      </div>
      {others.map((s, i) => (
        <Seat key={s.position} seat={s} place={places[i] ?? 'top'} />
      ))}
      <div className="felt-hero">
        <div className="hero-tag">
          <span>{seats[0]?.position}</span>
          {seats[0]?.dealer && <i className="dealer">D</i>}
        </div>
        {children}
      </div>
    </div>
  );
}
