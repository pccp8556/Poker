# Range Lab — entraînement aux ranges préflop

Application d’entraînement aux ranges **Spin & Go (3-max et heads-up)**, construite à partir du PDF
`Ranges_Expresso_KillTilt (1).pdf` présent dans ce dépôt. Une seule base de code sert la version web
(Netlify, utilisable hors ligne) et l’application Android (Capacitor).

- 18 ranges extraites du PDF et vérifiées case par case (3 042 mains, aucun écart)
- Quiz contextualisé : table, positions, action adverse, profondeur, cartes réelles
- Correction fondée uniquement sur la range de référence, avec la même main aux autres profondeurs
- Modes aléatoire, ciblé (mains faibles), erreurs, révision espacée et examen (chronométré ou non)
- Statistiques (globales, par range, position, spot, profondeur, format, par main), historique
- Favoris, sessions récentes, reprise de session après fermeture
- Données stockées sur l’appareil, sans compte ; export / import de sauvegarde

## Démarrer

Prérequis : Node 22.

```bash
npm ci
npm run dev          # http://localhost:5173
npm test             # tests unitaires (Vitest)
npm run build        # build de production dans dist/
npm run test:e2e     # parcours utilisateur Playwright sur le build (après npm run build)
npm run check        # tout : typecheck + unitaires + build + e2e
```

Pour les tests e2e hors de l’environnement cloud : `npx playwright install chromium` une fois.

## Structure

```
src/
  data/ranges.json     données extraites du PDF (générées, ne pas éditer à la main)
  domain/              logique métier pure, sans React (testée)
    library.ts         validation des données, mains limites, répartition des actions
    grading.ts         règles de correction (tolérante, stricte, examen)
    quiz.ts            génération des sessions, rappels d’erreurs, bilan
    review.ts          révision espacée (boîtes de Leitner)
    progress.ts        enregistrement des réponses
    stats.ts           statistiques et file de révision
    situation.ts       contexte d’un spot (sièges, action précédente)
  storage/             persistance locale (localStorage / Capacitor Preferences)
  app/                 store, routeur (hash), intégration Android
  ui/                  composants et écrans
scripts/
  extract_ranges.py    PDF → src/data/ranges.json
  verify_ranges.py     contrôle indépendant par rendu raster du PDF
  android-assets.cjs   icônes et splash Android depuis public/icon.svg
tests/                 tests unitaires
e2e/                   tests de parcours (Playwright)
android/               projet Android natif (Capacitor)
docs/                  documentation détaillée
```

## Documentation

- [docs/DATA.md](docs/DATA.md) — extraction, contrôles et points d’attention sur les ranges
- [docs/TRAINING.md](docs/TRAINING.md) — règles de correction, modes, révision, statistiques
- [docs/NETLIFY.md](docs/NETLIFY.md) — mise en ligne et prévisualisation
- [docs/ANDROID.md](docs/ANDROID.md) — compilation des APK (débogage et production)
- [docs/DESIGN.md](docs/DESIGN.md) — choix visuels et accessibilité des couleurs

## Mettre à jour les ranges

```bash
pip install pdfplumber pillow        # + poppler-utils pour pdftoppm
npm run data:extract                 # régénère src/data/ranges.json (échoue au moindre doute)
npm run data:verify                  # compare chaque case à un rendu image du PDF
npm test                             # les comptes de référence par action doivent rester valides
```
