import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary } from '../../app/store';
import { ACTION_LABELS, sortActionIds } from '../../domain/actions';
import type { Format, Scenario } from '../../domain/types';
import { createRange, findDuplicate, makeAction, newRangeId, spotChoices } from '../../domain/userRanges';
import { BackHeader, Segmented } from '../components/common';
import { IconCheck, IconPlus } from '../icons';

/** Actions proposed by default for each kind of situation. */
const SUGGESTED: Record<Scenario, string[]> = {
  open: ['fold', 'minraise-fold', 'minraise-call', 'shove'],
  'vs-minraise': ['fold', 'call', '3bet-nai-call', '3bet-allin'],
  'vs-open': ['fold', 'call', '3bet-nai-call', '3bet-allin'],
  'vs-shove': ['fold', 'call'],
  'vs-limp': ['check', 'iso-fold', 'iso-call', 'iso-allin'],
};

const STACKS = [30, 25, 20, 15, 12, 10, 8, 6];

export function NewRangeScreen({ copyOf }: { copyOf?: string }) {
  const library = useLibrary();
  const source = copyOf ? library.get(copyOf) : undefined;
  const [format, setFormat] = useState<Format>(source?.format ?? '3max');
  const choices = useMemo(() => spotChoices(format), [format]);
  const initialChoice = source ? choices.findIndex((c) => c.hero === source.hero && c.villain === source.villain && c.scenario === source.scenario) : 0;
  const [choiceIdx, setChoiceIdx] = useState(Math.max(0, initialChoice));
  const choice = choices[choiceIdx] ?? choices[0]!;
  const [stack, setStack] = useState<string>(source ? '' : '20');
  const [selected, setSelected] = useState<string[]>(source ? source.actions.map((a) => a.id) : SUGGESTED[choice.scenario]);
  const [customLabels, setCustomLabels] = useState<string[]>(source ? source.actions.filter((a) => !ACTION_LABELS[a.id]).map((a) => a.label) : []);
  const [customInput, setCustomInput] = useState('');
  const [fill, setFill] = useState<string>(source ? '' : 'fold');

  const stackBb = Number(stack.replace(',', '.'));
  const stackValid = Number.isFinite(stackBb) && stackBb > 0 && stackBb <= 500;
  const input = { format, hero: choice.hero, villain: choice.villain, scenario: choice.scenario, stackBb };
  const duplicate = stackValid ? findDuplicate(library, input) : undefined;
  const knownIds = sortActionIds(Object.keys(ACTION_LABELS));
  const allActions = [...selected.filter((id) => ACTION_LABELS[id]), ...customLabels];
  const fillOptions = allActions;
  const effectiveFill = fillOptions.includes(fill) ? fill : (fillOptions.find((a) => a === 'fold' || a === 'check') ?? fillOptions[0] ?? '');
  const canCreate = stackValid && !duplicate && allActions.length > 0;

  const pickChoice = (i: number) => {
    setChoiceIdx(i);
    if (!source) setSelected(SUGGESTED[choices[i]!.scenario]);
  };

  const create = () => {
    if (!canCreate) return;
    const colors = store.pdfColors();
    const actions = allActions.map((a, i) => makeAction(a, colors, i));
    const fillId = actions.find((a) => a.id === effectiveFill || a.label === effectiveFill)?.id ?? actions[0]!.id;
    const id = newRangeId(input, new Set(library.byId.keys()));
    const range = createRange({ ...input, actions, fill: fillId }, id, Date.now());
    if (source) {
      // Start from the copied grid; hands whose action no longer exists take the default action.
      const ids = new Set(actions.map((a) => a.id));
      for (const [h, s] of Object.entries(source.hands)) {
        const kept = Object.fromEntries(Object.entries(s).filter(([a]) => ids.has(a)));
        const total = Object.values(kept).reduce((x, y) => x + y, 0);
        range.hands[h] = total > 0.999 ? kept : { [fillId]: 1 };
      }
    }
    store.saveCustomRange(range);
    store.showToast('Range créée : peins maintenant les mains', 'success');
    navigate(`/edit/${id}`, { replace: true });
  };

  return (
    <main className="screen no-nav new-range">
      <BackHeader eyebrow={source ? `Copie de ${source.title} ${source.stackBb} BB` : 'Ajouter une range'} title="Nouvelle range" fallback="/ranges" />

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">01</span> Format
        </h2>
        <Segmented<Format>
          label="Format"
          value={format}
          onChange={(f) => {
            setFormat(f);
            setChoiceIdx(0);
            if (!source) setSelected(SUGGESTED.open);
          }}
          options={[
            { value: '3max', label: '3-max' },
            { value: 'hu', label: 'Heads-Up' },
          ]}
        />
      </section>

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">02</span> Situation
        </h2>
        <div className="choice-list">
          {choices.map((c, i) => (
            <button key={c.label} type="button" className="choice" aria-pressed={i === choiceIdx} onClick={() => pickChoice(i)}>
              <span className="check">{i === choiceIdx && <IconCheck />}</span>
              {c.label}
            </button>
          ))}
        </div>
      </section>

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">03</span> Profondeur
        </h2>
        <div className="chip-wrap">
          {STACKS.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={stackBb === s} onClick={() => setStack(String(s))}>
              {s} BB
            </button>
          ))}
        </div>
        <label className="inline-field">
          <span>Autre profondeur</span>
          <input className="input" id="stack" inputMode="decimal" value={stack} onChange={(e) => setStack(e.target.value)} aria-label="Profondeur en BB" placeholder="ex. 18" />
          <span>BB</span>
        </label>
        {duplicate && (
          <div className="banner banner-error" style={{ marginTop: 10 }}>
            <div>
              Cette range existe déjà ({duplicate.title} {duplicate.stackBb} BB).{' '}
              <button type="button" className="link-btn" onClick={() => navigate(`/edit/${duplicate.id}`)}>
                La modifier
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">04</span> Actions de la légende
        </h2>
        <div className="chip-wrap">
          {knownIds.map((id) => (
            <button key={id} type="button" className="chip" aria-pressed={selected.includes(id)} onClick={() => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])}>
              {ACTION_LABELS[id]}
            </button>
          ))}
          {customLabels.map((l) => (
            <button key={l} type="button" className="chip" aria-pressed onClick={() => setCustomLabels(customLabels.filter((x) => x !== l))}>
              {l} ✕
            </button>
          ))}
        </div>
        <div className="notation-row" style={{ marginTop: 10 }}>
          <input className="input" id="custom-action" value={customInput} onChange={(e) => setCustomInput(e.target.value)} placeholder="Action libre (ex. Raise 2.5x / Fold)" aria-label="Action libre" />
          <button
            type="button"
            className="btn"
            aria-label="Ajouter l’action libre"
            onClick={() => {
              const v = customInput.trim();
              if (v && !customLabels.includes(v)) setCustomLabels([...customLabels, v]);
              setCustomInput('');
            }}
          >
            <IconPlus />
          </button>
        </div>
      </section>

      <section className="step">
        <h2 className="step-title">
          <span className="step-no">05</span> Action par défaut
        </h2>
        <p className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
          {source ? 'Les mains de la copie gardent leur action ; celles dont l’action a été retirée prennent celle-ci.' : 'Toutes les mains commencent avec cette action ; tu peindras ensuite les autres.'}
        </p>
        <div className="chip-wrap">
          {fillOptions.map((a) => (
            <button key={a} type="button" className="chip" aria-pressed={effectiveFill === a} onClick={() => setFill(a)}>
              {ACTION_LABELS[a] ?? a}
            </button>
          ))}
        </div>
      </section>

      <div className="launch-bar">
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!canCreate} onClick={create}>
          Créer et peindre la grille
        </button>
      </div>
    </main>
  );
}
