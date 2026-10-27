import { Capacitor } from '@capacitor/core';
import { useRef, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { store, useLibrary, useStore } from '../../app/store';
import { GLOSSARY } from '../../domain/actions';
import { SaveIndicator, Segmented, Sheet, Switch } from '../components/common';
import { COUNT_OPTIONS } from './Home';
import { IconChevron, IconDatabase, IconDownload, IconGrid, IconPlus, IconTrash, IconUpload } from '../icons';

function SettingRow({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="row setting-row">
      <div className="row-main">
        <div className="row-title">{title}</div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function StackedRow({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="row setting-row stacked">
      <div className="row-main">
        <div className="row-title">{title}</div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export const APP_VERSION = '1.2.0';

export function SettingsScreen() {
  const library = useLibrary();
  const settings = useStore((s) => s.data.settings);
  const userRanges = useStore((s) => s.data.ranges);
  const persisted = useStore((s) => s.storagePersisted);
  const answered = useStore((s) => Object.values(s.data.progress.days).reduce((n, d) => n + d.n, 0));
  const [importOpen, setImportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mixed = library.hasMixedStrategies();
  const set = store.updateSettings.bind(store);
  const modifiedCount = library.ranges.filter((r) => r.modified).length;
  const customCount = library.ranges.filter((r) => r.origin === 'custom').length;
  const marginalCount = Object.keys(userRanges.marginal).length;

  const exportData = async () => {
    const text = store.exportBackup();
    const name = `expresso-ranges-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    if (Capacitor.isNativePlatform()) {
      try {
        await navigator.clipboard.writeText(text);
        store.showToast('Sauvegarde copiée dans le presse-papiers : colle-la dans un fichier ou un message.', 'success');
      } catch {
        store.showToast('Copie impossible sur cet appareil.', 'error');
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.showToast('Sauvegarde téléchargée', 'success');
  };

  const doImport = (text: string) => {
    try {
      store.importBackup(text);
      setImportOpen(false);
      setImportText('');
      setImportError(null);
      store.showToast('Sauvegarde restaurée', 'success');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="screen settings">
      <header className="screen-head">
        <h1 className="title">Réglages</h1>
        <SaveIndicator />
      </header>

      <section className="section" style={{ marginTop: 0 }}>
        <h2 className="section-title">Entraînement</h2>
        <div className="list">
          <StackedRow title="Questions par session">
            <Segmented<number>
              label="Questions par session"
              value={settings.defaultCount}
              onChange={(v) => set({ defaultCount: v })}
              options={COUNT_OPTIONS.map((o) => (o.value === 0 ? { ...o, label: 'Illimité' } : o))}
            />
          </StackedRow>
          <StackedRow
            title="Correction"
            sub={settings.correction === 'fast' ? 'Rapide : enchaîne automatiquement après une bonne réponse.' : 'Détaillée : la correction reste affichée jusqu’à ce que tu continues.'}
          >
            <Segmented<'detailed' | 'fast'>
              label="Correction"
              value={settings.correction}
              onChange={(v) => set({ correction: v })}
              options={[
                { value: 'detailed', label: 'Détaillée' },
                { value: 'fast', label: 'Rapide' },
              ]}
            />
          </StackedRow>
          <StackedRow
            title="Règle des fréquences"
            sub={
              <>
                {settings.grading === 'tolerant'
                  ? 'Tolérante : toute action jouée par la range (fréquence > 0) est acceptée.'
                  : 'Stricte : pour une main mixte, un nombre aléatoire (RNG 1-100) désigne l’action attendue.'}
                {!mixed && <span className="faint"> Tes ranges n’ont qu’une action par main : les deux règles donnent le même résultat.</span>}
              </>
            }
          >
            <Segmented<'tolerant' | 'strict'>
              label="Règle des fréquences"
              value={settings.grading}
              onChange={(v) => set({ grading: v })}
              options={[
                { value: 'tolerant', label: 'Tolérante' },
                { value: 'strict', label: 'Stricte' },
              ]}
            />
          </StackedRow>
          <SettingRow title="Chronomètre" sub="Affiche le temps de réflexion (toujours enregistré dans les statistiques).">
            <Switch label="Chronomètre" checked={settings.showTimer} onChange={(v) => set({ showTimer: v })} />
          </SettingRow>
          <SettingRow title="Revoir les erreurs dans la session" sub="Une question ratée revient quelques questions plus tard.">
            <Switch label="Revoir les erreurs dans la session" checked={settings.recallMistakes} onChange={(v) => set({ recallMistakes: v })} />
          </SettingRow>
          <SettingRow title="Priorité aux mains limites" sub="Les mains à la frontière entre deux actions sont posées 3 fois plus souvent.">
            <Switch label="Priorité aux mains limites" checked={settings.focusBoundary} onChange={(v) => set({ focusBoundary: v })} />
          </SettingRow>
          <SettingRow title="Inclure « Profil dépendant »" sub="10 mains HU BB 8 BB. La réponse attendue est « Profil dépendant » : le document ne tranche pas.">
            <Switch label="Inclure Profil dépendant" checked={settings.includeProfileDependent} onChange={(v) => set({ includeProfileDependent: v })} />
          </SettingRow>
          <StackedRow title="Temps par décision en examen" sub="Sans action dans le temps imparti, la main est comptée fausse.">
            <Segmented<number>
              label="Temps par décision en examen"
              value={settings.examTimerSec ?? 0}
              onChange={(v) => set({ examTimerSec: v || null })}
              options={[
                { value: 0, label: 'Libre' },
                { value: 8, label: '8 s' },
                { value: 15, label: '15 s' },
                { value: 30, label: '30 s' },
              ]}
            />
          </StackedRow>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Affichage et retours</h2>
        <div className="list">
          <SettingRow title="Jeu 4 couleurs" sub="Pique noir, cœur rouge, carreau bleu, trèfle vert.">
            <Switch label="Jeu 4 couleurs" checked={settings.fourColor} onChange={(v) => set({ fourColor: v })} />
          </SettingRow>
          <StackedRow title="Couleurs des matrices" sub="« PDF » reproduit les couleurs exactes du document, Fold compris.">
            <Segmented<'dark' | 'pdf'>
              label="Couleurs des matrices"
              value={settings.matrixColors}
              onChange={(v) => set({ matrixColors: v })}
              options={[
                { value: 'dark', label: 'Thème sombre' },
                { value: 'pdf', label: 'Fidèle au PDF' },
              ]}
            />
          </StackedRow>
          <SettingRow title="Effets sonores" sub="Sons discrets après chaque réponse.">
            <Switch label="Effets sonores" checked={settings.sounds} onChange={(v) => set({ sounds: v })} />
          </SettingRow>
          <SettingRow title="Vibrations" sub="Courte vibration de confirmation (Android).">
            <Switch label="Vibrations" checked={settings.haptics} onChange={(v) => set({ haptics: v })} />
          </SettingRow>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Mes ranges</h2>
        <div className="list">
          <button type="button" className="row" onClick={() => navigate('/ranges')}>
            <span className="tile-icon t-grey">
              <IconGrid />
            </span>
            <div className="row-main">
              <div className="row-title">Consulter et modifier</div>
              <div className="row-sub">
                {library.ranges.length} ranges · {modifiedCount} modifiée{modifiedCount > 1 ? 's' : ''} · {customCount} personnalisée{customCount > 1 ? 's' : ''}
              </div>
            </div>
            <IconChevron className="chev" />
          </button>
          <button type="button" className="row" onClick={() => navigate('/new')}>
            <span className="tile-icon t-green">
              <IconPlus />
            </span>
            <div className="row-main">
              <div className="row-title">Ajouter une range</div>
              <div className="row-sub">Nouvelle situation ou nouvelle profondeur, grille à peindre</div>
            </div>
            <IconChevron className="chev" />
          </button>
          <button type="button" className="row" onClick={() => navigate('/marginal')}>
            <span className="tile-icon t-gold">
              <IconGrid />
            </span>
            <div className="row-main">
              <div className="row-title">Mains marginales</div>
              <div className="row-sub">{marginalCount ? `${marginalCount} sélection${marginalCount > 1 ? 's' : ''} personnelle${marginalCount > 1 ? 's' : ''}` : 'Frontières calculées automatiquement'}</div>
            </div>
            <IconChevron className="chev" />
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Mes données</h2>
        <div className="list">
          <div className="row">
            <span className="tile-icon t-grey">
              <IconDatabase />
            </span>
            <div className="row-main">
              <div className="row-title">Stockage local actif</div>
              <div className="row-sub">
                {answered} réponse{answered > 1 ? 's' : ''} enregistrée{answered > 1 ? 's' : ''} sur cet appareil ·{' '}
                {persisted ? 'protégé contre l’effacement automatique' : 'le navigateur peut l’effacer en cas de manque d’espace : exporte une sauvegarde de temps en temps'}
              </div>
            </div>
          </div>
          <button type="button" className="row" onClick={exportData}>
            <span className="tile-icon t-green">
              <IconDownload />
            </span>
            <div className="row-main">
              <div className="row-title">Exporter ma progression</div>
              <div className="row-sub">Statistiques, réglages, favoris et ranges modifiées</div>
            </div>
          </button>
          <button type="button" className="row" onClick={() => setImportOpen(true)}>
            <span className="tile-icon t-grey">
              <IconUpload />
            </span>
            <div className="row-main">
              <div className="row-title">Importer une sauvegarde</div>
              <div className="row-sub">Remplace les données de cet appareil</div>
            </div>
          </button>
          <button type="button" className="row" onClick={() => setResetOpen(true)}>
            <span className="tile-icon t-red">
              <IconTrash />
            </span>
            <div className="row-main">
              <div className="row-title">Réinitialiser la progression</div>
              <div className="row-sub">Les ranges et réglages sont conservés</div>
            </div>
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Source des ranges</h2>
        <div className="card about">
          <p>
            <b>{library.data.source.title}</b>
          </p>
          <p className="muted">
            Fichier : {library.data.source.file} · 18 ranges (pages 2 à {library.data.source.pages}).
          </p>
          <p className="muted">
            Extraction automatique des grilles vectorielles du PDF, vérifiée case par case contre un rendu image (3 042 mains, aucun écart). Les ranges modifiées gardent leur
            version d’origine, restaurable à tout moment.
          </p>
          <ul className="notes">
            <li>Le document ne donne pas de fréquences : chaque main a une seule action (100 %). Tu peux en ajouter dans l’éditeur.</li>
            <li>« Profil dépendant » (HU BB 8 BB, 10 mains) : le document ne tranche pas ; c’est la réponse attendue pour ces mains.</li>
            <li>Les tailles de 3bet « non all-in » et d’open raise de la SB (BB vs SB) ne sont pas précisées par le document.</li>
          </ul>
          <p className="faint" style={{ fontSize: 12 }}>
            Empreinte SHA-256 : {library.data.source.sha256.slice(0, 16)}… · Expresso Ranges {APP_VERSION}
          </p>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Lexique</h2>
        <div className="list">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="row glossary-row">
              <b>{g.term}</b>
              <span className="muted">{g.definition}</span>
            </div>
          ))}
          <div className="row glossary-row">
            <b>Notation</b>
            <span className="muted">« 22+ » toutes les paires, « A2s+ » de A2s à AKs, « KTo+ » KTo, KJo, KQo, « A5s-A2s » un intervalle.</span>
          </div>
        </div>
      </section>

      <Sheet open={importOpen} onClose={() => setImportOpen(false)} label="Importer une sauvegarde">
        <h2 className="title-sm">Importer une sauvegarde</h2>
        <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
          La progression et les ranges de cet appareil seront remplacées par celles du fichier.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) doImport(await f.text());
            e.target.value = '';
          }}
        />
        <button type="button" className="btn btn-block" style={{ marginTop: 14 }} onClick={() => fileRef.current?.click()}>
          <IconUpload /> Choisir un fichier .json
        </button>
        <div className="field-label">ou coller le contenu</div>
        <textarea className="input" id="import-text" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"app":"range-lab", …}' aria-label="Contenu de la sauvegarde" />
        {importError && (
          <div className="banner banner-error" style={{ marginTop: 10 }}>
            {importError}
          </div>
        )}
        <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 12 }} disabled={!importText.trim()} onClick={() => doImport(importText)}>
          Restaurer
        </button>
      </Sheet>

      <Sheet open={resetOpen} onClose={() => setResetOpen(false)} label="Réinitialiser la progression">
        <h2 className="title-sm">Effacer toute la progression ?</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Statistiques, historique et révisions seront supprimés de cet appareil ({answered} réponses). Les ranges, réglages et favoris sont conservés. Pense à exporter une
          sauvegarde avant.
        </p>
        <div className="sheet-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setResetOpen(false)}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              store.resetProgress();
              setResetOpen(false);
              store.showToast('Progression effacée', 'success');
            }}
          >
            Tout effacer
          </button>
        </div>
      </Sheet>
    </main>
  );
}
