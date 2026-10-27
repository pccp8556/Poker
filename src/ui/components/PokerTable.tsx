import type { Card } from '../../domain/cards';
import { formatBB, pot, r2, type HandState, type PlaySeat } from '../../domain/play';
import type { Position } from '../../domain/types';
import { PlayingCard } from './PlayingCard';

function actionTone(action: string | null): string {
  if (!action) return '';
  if (action === 'Passe') return 'fold';
  if (action.startsWith('Tapis')) return 'allin';
  if (action === 'Parole' || action === 'Suivre' || action === 'Limp') return 'call';
  return 'raise';
}

function Chips({ amount, place }: { amount: number; place: string }) {
  if (amount <= 0) return null;
  return (
    <div className={`bet bet-${place}`}>
      <i className="chip-icon" aria-hidden />
      <span className="num">{formatBB(amount)}</span>
    </div>
  );
}

function Nameplate({ seat, acting }: { seat: PlaySeat; acting: boolean }) {
  const behind = r2(seat.stack - seat.bet);
  return (
    <div className={`nameplate${seat.folded ? ' folded' : ''}${acting ? ' acting' : ''}`}>
      <span className="np-avatar" aria-label={`Position ${seat.position}`}>
        {seat.position}
      </span>
      <span className="np-text">
        <span className="np-name">{seat.name}</span>
        <span className="np-stack num">{behind > 0 ? formatBB(behind) : 'Tapis'}</span>
      </span>
      {acting && <i className="np-clock" aria-hidden />}
    </div>
  );
}

function Opponent({ seat, place, acting }: { seat: PlaySeat; place: string; acting: boolean }) {
  return (
    <div className={`opp opp-${place}`} data-position={seat.position}>
      {!seat.folded && (
        <div className="card-backs" aria-hidden>
          <i />
          <i />
        </div>
      )}
      <Nameplate seat={seat} acting={acting} />
      {seat.dealer && <span className="dealer-btn">D</span>}
      {acting ? <span className="action-bubble thinking">réfléchit…</span> : seat.action && <span className={`action-bubble ${actionTone(seat.action)}`}>{seat.action}</span>}
    </div>
  );
}

/**
 * Poker table seen from the hero's seat, as in a real client: opponents with
 * their stacks and last action, chips in front of each player, pot in the middle.
 * `acting` is the opponent currently thinking (null: the hero is to act or the hand is over).
 */
export function PokerTable({ hand, cards, acting, dealKey }: { hand: HandState; cards: [Card, Card]; acting: Position | null; dealKey: string }) {
  const [me, ...others] = hand.seats;
  const places = others.length === 1 ? ['top'] : ['left', 'right'];
  const heroToAct = hand.status === 'hero' && acting === null;
  return (
    <div className={`ptable ptable-${hand.format}`}>
      <div className="ptable-rail">
        <div className="ptable-felt">
          <span className="ptable-mark" aria-hidden>
            Expresso Ranges
          </span>
        </div>
      </div>
      <div className="pot num" aria-label={`Pot ${formatBB(pot(hand))}`}>
        Pot : {formatBB(pot(hand))}
      </div>
      {others.map((s, i) => (
        <Opponent key={s.position} seat={s} place={places[i] ?? 'top'} acting={acting === s.position} />
      ))}
      {others.map((s, i) => (
        <Chips key={`b-${s.position}`} amount={s.bet} place={places[i] ?? 'top'} />
      ))}
      {me && <Chips amount={me.bet} place="hero" />}
      {me && (
        <div className="me" data-position={me.position}>
          <div className={`me-cards deal${me.folded ? ' folded' : ''}`} key={dealKey}>
            <PlayingCard card={cards[0]} />
            <PlayingCard card={cards[1]} />
          </div>
          <Nameplate seat={me} acting={heroToAct} />
          {me.dealer && <span className="dealer-btn">D</span>}
          {me.action && <span className={`action-bubble mine ${actionTone(me.action)}`}>{me.action}</span>}
        </div>
      )}
    </div>
  );
}
