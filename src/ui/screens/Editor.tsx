import { useMemo, useState } from 'react';
import { goBack, navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { ACTION_LABELS, sortActionIds } from '../../domain/actions';
import { countByAction, handsWithAction, paintHands, removeAction, setHandStrategy, strategyFromPercents, type Hands } from '../../domain/editor';
import { validateRange } from '../../domain/library';
import { formatRangeNotation, parseRangeNotation } from '../../domain/notation';
import type { ActionDef } from '../../domain/types';
import { makeAction, sameHands } from '../../domain/userRanges';
import { BackHeader, Empty, Sheet } from '../components/common';
import { colorOf, RangeGrid, useColorMode } from '../components/RangeGrid';
import { IconCopy, IconPlus, IconRefresh, IconTrash, IconUndo } from '../icons';

interface Snapshot {
  hands: Hands;
  actions: ActionDef[];
}

export function EditorScreen({ id }: { id: string }) {
  const library = useLibrary();
  const base = useStore((s) => s.base);
  const mode = useColorMode();
  const original = library.get(id);
  const pdfOriginal = base?.ranges.find((r) => r.id === id);
  const isCustom = original?.origin === 'custom';

  const [hands, setHands] = useState<Hands>(() => original?.hands ?? {});
  const [actions, setActions] = useState<ActionDef[]>(() => original?.actions ?? []);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [brush, setBrush] = useState<string>(() => sortActionIds((original?.actions ?? []).map((a) => a.id)).find((a) => a !== 'fold' && a !== 'check') ?? original?.actions[0]?.id ?? '');
  const [tool, setTool] = useState<'paint' | 'freq'>('paint');
  const [freqHand, setFreqHand] = useState<string | null>(null);
  const [percents, setPercents] = useState<Record<string, number>>({});
  const [notation, setNotation] = useState('');
  const [notationError, setNotationError] = useState<string | null>(null);
  const [leave, setLeave] = useState(false);
  const [newAction, setNewAction] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const draft = useMemo(() => (original ? { ...original, actions, hands } : null), [original, actions, hands]);
  const counts = useMemo(() => countByAction(hands), [hands]);
  const dirty = !!original && (!sameHands(original.hands, hands) || JSON.stringify(original.actions) !== JSON.stringify(actions));

  if (!original || !draft) {
    return (
      <main className="screen no-nav">
        <BackHeader title="Range introuvable" fallback="/ranges" />
        <Empty title="Cette range n’existe pas">Elle a peut-être été supprimée.</Empty>
      </main>
    );
  }

  const snapshot = () => setHistory((h) => [...h.slice(-49), { hands, actions }]);
  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHands(last.hands);
    setActions(last.actions);
    setHistory(history.slice(0, -1));
  };

  const onPaint = (hand: string, first: boolean) => {
    if (first) snapshot();
    setHands((h) => paintHands(h, [hand], brush));
  };

  const openFreq = (hand: string) => {
    const s = hands[hand] ?? {};
    setPercents(Object.fromEntries(actions.map((a) => [a.id, Math.round((s[a.id] ?? 0) * 100)])));
    setFreqHand(hand);
  };

  const applyFreq = () => {
    if (!freqHand) return;
    const strategy = strategyFromPercents(percents);
    if (!strategy) return;
    snapshot();
    setHands((h) => setHandStrategy(h, freqHand, strategy));
    setFreqHand(null);
  };

  const applyNotation = () => {
    const parsed = parseRangeNotation(notation);
    if (parsed.errors.length) {
      setNotationError(`Non reconnu : ${parsed.errors.join(', ')}`);
      return;
    }
    if (!parsed.hands.length) {
      setNotationError('Aucune main saisie.');
      return;
    }
    snapshot();
    setHands((h) => paintHands(h, parsed.hands, brush));
    setNotationError(null);
    setNotation('');
    store.showToast(`${parsed.hands.length} mains passées en « ${actions.find((a) => a.id === brush)?.label} »`, 'success');
  };

  const addAction = () => {
    const value = newAction.trim();
    if (!value) return;
    const action = makeAction(value, store.pdfColors(), actions.length);
    if (actions.some((a) => a.id === action.id)) {
      store.showToast('Cette action est déjà dans la légende.', 'info');
      return;
    }
    snapshot();
    setActions([...actions, action]);
    setBrush(action.id);
    setNewAction('');
  };

  const dropAction = (actionId: string) => {
    const replacement = actions.find((a) => a.id === 'fold' && a.id !== actionId) ?? actions.find((a) => a.id !== actionId);
    if (!replacement) return;
    snapshot();
    const next = removeAction({ ...draft, actions, hands }, actionId, replacement.id);
    setActions(next.actions);
    setHands(next.hands);
    if (brush === actionId) setBrush(replacement.id);
  };

  const save = () => {
    const errs = validateRange(draft, draft.id);
    if (errs.length) {
      setErrors(errs.slice(0, 5));
      return;
    }
    if (isCustom) store.saveCustomRange(draft);
    else store.saveRangeHands(draft.id, hands);
    store.showToast(isCustom || !sameHands(pdfOriginal?.hands ?? {}, hands) ? 'Range enregistrée' : 'Range identique au PDF : version d’origine conservée', 'success');
    navigate(`/ranges/${draft.id}`, { replace: true });
  };

  const brushHands = handsWithAction(hands, brush);
  const sortedActions = sortActionIds(actions.map((a) => a.id)).map((aid) => actions.find((a) => a.id === aid)!);
  const freqTotal = Object.values(percents).reduce((s, p) => s + (p || 0), 0);
  const available = Object.keys(ACTION_LABELS).filter((aid) => !actions.some((a) => a.id === aid));

  return (
    <main className="screen no-nav editor">
      <BackHeader
        eyebrow={isCustom ? 'Range personnalisée' : `Range du PDF · page ${original.source.page}`}
        title={`${original.title} · ${original.stackBb} BB`}
        fallback={`/ranges/${id}`}
        onBack={dirty ? () => setLeave(true) : undefined}
        right={
          <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty}>
            Enregistrer
          </button>
        }
      />

      {!isCustom && (
        <div className="banner banner-info">
          <span>
            Tes modifications sont enregistrées à part : la grille du PDF reste intacte et peut être restaurée à tout moment. Les questions utiliseront ta version.
          </span>
        </div>
      )}

      <div className="editor-tools">
        <div className="seg" role="group" aria-label="Outil">
          <button type="button" aria-pressed={tool === 'paint'} onClick={() => setTool('paint')}>
            Pinceau
          </button>
          <button type="button" aria-pressed={tool === 'freq'} onClick={() => setTool('freq')}>
            Fréquences
          </button>
        </div>
        <button type="button" className="icon-btn square" onClick={undo} disabled={!history.length} aria-label="Annuler la dernière modification">
          <IconUndo />
        </button>
      </div>

      <div className="brushes" role="radiogroup" aria-label="Action à appliquer">
        {sortedActions.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={brush === a.id} className="brush" onClick={() => setBrush(a.id)}>
            <i className="legend-dot" style={{ background: colorOf(draft, a.id, mode) }} />
            <span>{a.label}</span>
            <small className="num">{counts[a.id] ?? 0}</small>
          </button>
        ))}
      </div>
      <p className="hint">
        {tool === 'paint'
          ? 'Touche ou fais glisser le doigt sur les mains pour leur donner l’action sélectionnée.'
          : 'Touche une main pour régler ses fréquences (stratégie mixte).'}
      </p>

      <RangeGrid range={draft} hands={hands} size="normal" onPaint={tool === 'paint' ? onPaint : undefined} onSelect={tool === 'freq' ? openFreq : undefined} />

      <section className="section">
        <h2 className="section-title">Saisie rapide</h2>
        <div className="notation-row">
          <input
            className="input"
            id="notation"
            value={notation}
            onChange={(e) => {
              setNotation(e.target.value);
              setNotationError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && applyNotation()}
            placeholder="22+, A2s+, KTo+, QJs"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="Mains en notation poker"
          />
          <button type="button" className="btn" onClick={applyNotation}>
            Appliquer
          </button>
        </div>
        {notationError ? <p className="hint error-text">{notationError}</p> : <p className="hint">Les mains saisies prennent l’action « {actions.find((a) => a.id === brush)?.label} ».</p>}
        <div className="notation-current">
          <span className="faint">{actions.find((a) => a.id === brush)?.label} :</span>
          <code>{brushHands.length ? formatRangeNotation(brushHands) : 'aucune main'}</code>
          {brushHands.length > 0 && (
            <button
              type="button"
              className="icon-btn plain"
              aria-label="Copier la liste"
              onClick={() => {
                navigator.clipboard?.writeText(formatRangeNotation(brushHands)).then(
                  () => store.showToast('Liste copiée', 'success'),
                  () => store.showToast('Copie impossible ici', 'error'),
                );
              }}
            >
              <IconCopy />
            </button>
          )}
        </div>
      </section>

      {isCustom && (
        <section className="section">
          <h2 className="section-title">Actions de la légende</h2>
          <div className="list">
            {sortedActions.map((a) => (
              <div key={a.id} className="row">
                <i className="legend-dot" style={{ background: colorOf(draft, a.id, mode) }} />
                <div className="row-main">
                  <div className="row-title">{a.label}</div>
                  <div className="row-sub num">{counts[a.id] ?? 0} mains</div>
                </div>
                {actions.length > 1 && (
                  <button type="button" className="icon-btn plain" aria-label={`Retirer ${a.label}`} onClick={() => dropAction(a.id)}>
                    <IconTrash />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="notation-row" style={{ marginTop: 10 }}>
            <input className="input" id="new-action" list="known-actions" value={newAction} onChange={(e) => setNewAction(e.target.value)} placeholder="Ajouter une action (ex. Call, Raise 2.5x / Fold)" aria-label="Nouvelle action" />
            <datalist id="known-actions">
              {available.map((aid) => (
                <option key={aid} value={ACTION_LABELS[aid]} />
              ))}
            </datalist>
            <button type="button" className="btn" onClick={addAction} aria-label="Ajouter l’action">
              <IconPlus />
            </button>
          </div>
          <p className="hint">Choisis une action connue dans la liste, ou écris un libellé libre. Une action retirée rend ses mains à « Fold » (ou à la première action).</p>
        </section>
      )}

      {!isCustom && pdfOriginal && !sameHands(pdfOriginal.hands, hands) && (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          style={{ marginTop: 16 }}
          onClick={() => {
            snapshot();
            setHands(pdfOriginal.hands);
          }}
        >
          <IconRefresh /> Revenir à la grille du PDF
        </button>
      )}

      {errors.length > 0 && (
        <div className="banner banner-error" style={{ marginTop: 12 }}>
          <div>
            <strong>Impossible d’enregistrer :</strong>
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        </div>
      )}

      <Sheet open={freqHand !== null} onClose={() => setFreqHand(null)} label="Fréquences de la main">
        <h2 className="title-sm">Fréquences · {freqHand}</h2>
        <p className="muted" style={{ marginTop: 4, fontSize: 13.5 }}>
          Total {freqTotal} % · normalisé à 100 % à l’enregistrement.
        </p>
        <div className="freq-list">
          {sortedActions.map((a) => (
            <div key={a.id} className="freq-row">
              <i className="legend-dot" style={{ background: colorOf(draft, a.id, mode) }} />
              <label htmlFor={`freq-${a.id}`}>{a.label}</label>
              <input
                id={`freq-${a.id}`}
                type="range"
                min={0}
                max={100}
                step={5}
                value={percents[a.id] ?? 0}
                onChange={(e) => setPercents({ ...percents, [a.id]: Number(e.target.value) })}
              />
              <button type="button" className="freq-value num" onClick={() => setPercents(Object.fromEntries(actions.map((x) => [x.id, x.id === a.id ? 100 : 0])))}>
                {percents[a.id] ?? 0} %
              </button>
            </div>
          ))}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setFreqHand(null)}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={applyFreq} disabled={freqTotal <= 0}>
            Appliquer
          </button>
        </div>
      </Sheet>

      <Sheet open={leave} onClose={() => setLeave(false)} label="Modifications non enregistrées">
        <h2 className="title-sm">Quitter sans enregistrer ?</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Tes modifications de cette grille seront perdues.
        </p>
        <div className="sheet-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setLeave(false);
              goBack(`/ranges/${id}`);
            }}
          >
            Quitter
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setLeave(false);
              save();
            }}
          >
            Enregistrer
          </button>
        </div>
      </Sheet>
    </main>
  );
}
