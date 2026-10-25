import { useMemo } from 'react';
import { navigate } from '../../app/router';
import { useLibrary, useStore } from '../../app/store';
import { spotSubtitle } from '../../domain/situation';
import { reviewQueue } from '../../domain/stats';
import { plural } from '../format';
import { IconCalendar, IconChevron, IconCrosshair, IconExam, IconPencil, IconPlay, IconRefresh, IconShuffle, IconSliders, IconTarget } from '../icons';
import { spotGroups } from '../selection';
import { launch } from './Home';

export function TrainScreen() {
  const library = useLibrary();
  const progress = useStore((s) => s.data.progress);
  const settings = useStore((s) => s.data.settings);
  const queue = useMemo(() => reviewQueue(library, progress, Date.now()), [library, progress]);
  const groups = useMemo(() => spotGroups(library.ranges), [library]);
  const allIds = library.ranges.map((r) => r.id);

  const modes = [
    {
      icon: IconShuffle,
      tone: 't-green',
      title: 'Entraînement rapide',
      sub: 'Toutes les ranges mélangées, priorité aux révisions dues',
      run: () => launch(allIds, 'random', settings.defaultCount, { label: 'Entraînement rapide' }),
    },
    { icon: IconSliders, tone: 't-green', title: 'Personnalisé', sub: 'Format, situation, profondeur, type d’action', run: () => navigate('/custom') },
    {
      icon: IconRefresh,
      tone: 't-red',
      title: 'Mes erreurs',
      sub: queue.inReview.length ? `${plural(queue.inReview.length, 'main')} à corriger, jusqu’à maîtrise` : 'Aucune erreur à corriger',
      run: () => launch(allIds, 'errors', 50, { label: 'Mes erreurs' }),
    },
    {
      icon: IconCalendar,
      tone: 't-green',
      title: 'Révisions espacées',
      sub: queue.dueCount ? `${plural(queue.dueCount, 'situation')} à revoir aujourd’hui` : 'Rien à revoir pour l’instant',
      run: () => launch(allIds, 'review', 50, { label: 'Révisions espacées' }),
    },
    {
      icon: IconCrosshair,
      tone: 't-gold',
      title: 'Mains marginales',
      sub: 'Les frontières de chaque range (ou ta sélection)',
      run: () => launch(allIds, 'marginal', settings.defaultCount, { label: 'Mains marginales' }),
    },
    {
      icon: IconTarget,
      tone: 't-grey',
      title: 'Ciblé',
      sub: 'Priorité aux mains les moins réussies et jamais vues',
      run: () => launch(allIds, 'targeted', settings.defaultCount, { label: 'Entraînement ciblé' }),
    },
    {
      icon: IconExam,
      tone: 't-grey',
      title: 'Examen',
      sub: settings.examTimerSec ? `Correction à la fin · ${settings.examTimerSec} s par question` : 'Correction à la fin, score de précision',
      run: () => launch(allIds, 'exam', settings.defaultCount || 25, { label: 'Examen' }),
    },
    { icon: IconPencil, tone: 't-grey', title: 'Définir mes mains marginales', sub: 'Visualiser et modifier la sélection de chaque range', run: () => navigate('/marginal') },
  ];

  return (
    <main className="screen train">
      <header className="screen-head">
        <h1 className="title">Entraînement</h1>
      </header>

      <div className="list">
        {modes.map((m) => (
          <button key={m.title} type="button" className="row mode-row" onClick={m.run}>
            <span className={`tile-icon ${m.tone}`}>
              <m.icon />
            </span>
            <div className="row-main">
              <div className="row-title">{m.title}</div>
              <div className="row-sub">{m.sub}</div>
            </div>
            <IconChevron className="chev" />
          </button>
        ))}
      </div>

      <section className="section">
        <h2 className="section-title">Par range</h2>
        <div className="list">
          {groups.map((g) => (
            <div key={g.key} className="row by-range">
              <div className="row-main">
                <div className="row-title">{g.title}</div>
                <div className="row-sub ellipsis">{spotSubtitle(g.ranges[0]!)}</div>
              </div>
              <div className="stack-btns">
                {g.ranges.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`stack-btn num ${r.origin === 'custom' ? 'custom' : ''} ${r.modified ? 'modified' : ''}`}
                    aria-label={`S’entraîner sur ${r.title} ${r.stackBb} BB`}
                    onClick={() => launch([r.id], 'random', settings.defaultCount, { label: `${r.title} · ${r.stackBb} BB` })}
                  >
                    {r.stackBb}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="hint">
          <IconPlay style={{ width: 12, height: 12, verticalAlign: -1 }} /> Touche une profondeur pour lancer {settings.defaultCount ? `${settings.defaultCount} questions` : 'une session illimitée'} sur cette range.
        </p>
      </section>
    </main>
  );
}
