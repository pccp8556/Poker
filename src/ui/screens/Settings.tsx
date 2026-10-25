import { Capacitor } from '@capacitor/core';
import { useRef, useState, type ReactNode } from 'react';
import { store, useLibrary, useStore } from '../../app/store';
import { GLOSSARY } from '../../domain/actions';
import { SaveIndicator, Segmented, Sheet, Switch } from '../components/common';
import { PlayingCard } from '../components/PlayingCard';
import { IconDownload, IconTrash, IconUpload } from '../icons';

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

const APP_VERSION = '1.0.0';

export function SettingsScreen() {
  const library = useLibrary();
  const settings = useStore((s) => s.data.settings);
  const answered = useStore((s) => Object.values(s.data.progress.days).reduce((n, d) => n + d.n, 0));
  const [importOpen, setImportOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mixed = library.hasMixedStrategies();
  const set = store.updateSettings.bind(store);

  const exportData = async () => {
    const text = store.exportBackup();
    const name = `range-lab-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    if (Capacitor.isNativePlatform()) {
      try {
        await navigator.clipboard.writeText(text);
        store.showToast('Sauvegarde copiée dans le presse-papiers : collez-la dans un fichier ou un message.', 'success');
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
        <h2 className="section-title" style={{ marginBottom: 10 }}>
          Entraînement
        </h2>
        <div className="list">
          <div className="row setting-row stacked">
            <div className="row-main">
              <div className="row-title">Règle de correction</div>
              <div className="row-sub">
                {settings.grading === 'tolerant'
                  ? 'Tolérante : toute action jouée par la range (fréquence > 0) est acceptée.'
                  : 'Stricte : pour une main mixte, un nombre aléatoire (RNG 1-100) désigne l’action attendue selon les fréquences.'}
              </div>
              {!mixed && <div className="row-sub faint" style={{ marginTop: 4 }}>Les ranges actuelles n’ont qu’une action par main : les deux règles donnent le même résultat.</div>}
            </div>
            <Segmented<'tolerant' | 'strict'>
              label="Règle de correction"
              value={settings.grading}
              onChange={(v) => set({ grading: v })}
              options={[
                { value: 'tolerant', label: 'Tolérante' },
                { value: 'strict', label: 'Stricte' },
              ]}
            />
          </div>
          <div className="row setting-row stacked">
            <div className="row-main">
              <div className="row-title">Questions par session</div>
            </div>
            <Segmented<number>
              label="Questions par session"
              value={settings.defaultCount}
              onChange={(v) => set({ defaultCount: v })}
              options={[10, 20, 30, 50].map((v) => ({ value: v, label: String(v) }))}
            />
          </div>
          <SettingRow title="Priorité aux mains limites" sub="Pose plus souvent les mains situées à la frontière entre deux actions (×3).">
            <Switch label="Priorité aux mains limites" checked={settings.focusBoundary} onChange={(v) => set({ focusBoundary: v })} />
          </SettingRow>
          <SettingRow title="Rappel des erreurs" sub="Une main ratée est reposée 3 questions plus tard (hors examen).">
            <Switch label="Rappel des erreurs" checked={settings.recallMistakes} onChange={(v) => set({ recallMistakes: v })} />
          </SettingRow>
          <SettingRow title="Enchaînement automatique" sub="Passe à la question suivante après une bonne réponse.">
            <Switch label="Enchaînement automatique" checked={settings.autoAdvance} onChange={(v) => set({ autoAdvance: v })} />
          </SettingRow>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title" style={{ marginBottom: 10 }}>
          Affichage
        </h2>
        <div className="list">
          <SettingRow
            title="Jeu 4 couleurs"
            sub={
              <span className={`suit-preview ${settings.fourColor ? '' : 'two-color'}`}>
                <PlayingCard card={{ rank: 'A', suit: 's' }} width={30} />
                <PlayingCard card={{ rank: 'K', suit: 'h' }} width={30} />
                <PlayingCard card={{ rank: 'Q', suit: 'd' }} width={30} />
                <PlayingCard card={{ rank: 'J', suit: 'c' }} width={30} />
              </span>
            }
          >
            <Switch label="Jeu 4 couleurs" checked={settings.fourColor} onChange={(v) => set({ fourColor: v })} />
          </SettingRow>
          <SettingRow title="Vibrations" sub="Retour haptique sur les réponses (si l’appareil le permet).">
            <Switch label="Vibrations" checked={settings.haptics} onChange={(v) => set({ haptics: v })} />
          </SettingRow>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title" style={{ marginBottom: 10 }}>
          Données
        </h2>
        <div className="banner banner-info" style={{ marginBottom: 10 }}>
          <span>
            Tout est stocké sur cet appareil, sans compte ni serveur ({answered} réponses enregistrées). Exportez une sauvegarde pour changer d’appareil ou de navigateur.
          </span>
        </div>
        <div className="data-actions">
          <button type="button" className="btn" onClick={exportData}>
            <IconDownload /> Exporter
          </button>
          <button type="button" className="btn" onClick={() => setImportOpen(true)}>
            <IconUpload /> Importer
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setResetOpen(true)}>
            <IconTrash /> Réinitialiser
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title" style={{ marginBottom: 10 }}>
          Source des ranges
        </h2>
        <div className="card about">
          <p>
            <b>{library.data.source.title}</b>
          </p>
          <p className="muted">
            Fichier : {library.data.source.file} · {library.ranges.length} ranges (pages 2 à {library.data.source.pages}).
          </p>
          <p className="muted">
            Extraction automatique des grilles vectorielles du PDF, vérifiée case par case contre un rendu image (3 042 mains, aucun écart). Les couleurs de l’application sont propres à Range
            Lab ; les libellés d’actions sont ceux du document.
          </p>
          <ul className="notes">
            <li>Le document ne donne pas de fréquences : chaque main a une seule action (100 %).</li>
            <li>« Profil dépendant » (HU BB 8 BB, 10 mains) : le document ne tranche pas ; c’est la réponse attendue pour ces mains.</li>
            <li>Les tailles de 3bet « non all-in » et d’open raise de la SB (BB vs SB) ne sont pas précisées par le document.</li>
          </ul>
          <p className="faint" style={{ fontSize: 12 }}>
            Empreinte SHA-256 : {library.data.source.sha256.slice(0, 16)}… · Range Lab {APP_VERSION}
          </p>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title" style={{ marginBottom: 10 }}>
          Lexique
        </h2>
        <div className="list">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="row glossary-row">
              <b>{g.term}</b>
              <span className="muted">{g.definition}</span>
            </div>
          ))}
        </div>
      </section>

      <Sheet open={importOpen} onClose={() => setImportOpen(false)} label="Importer une sauvegarde">
        <h2 className="title-sm">Importer une sauvegarde</h2>
        <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
          La progression actuelle sera remplacée par celle du fichier.
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
        <textarea className="input" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{"app":"range-lab", …}' aria-label="Contenu de la sauvegarde" />
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
          Statistiques, historique et révisions seront supprimés de cet appareil ({answered} réponses). Les réglages et favoris sont conservés. Pensez à exporter une sauvegarde avant.
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
