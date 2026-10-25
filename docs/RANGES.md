# Consulter, modifier et ajouter des ranges

Code : `src/domain/userRanges.ts`, `src/domain/editor.ts`, `src/domain/notation.ts` (testés), écrans
`Explorer`, `Editor`, `NewRange`, `Marginal`.

## Principe : le PDF reste la référence

- Les 18 ranges du PDF (`src/data/ranges.json`) ne sont jamais réécrites.
- Une modification d’une range du PDF est enregistrée à part ; la range est marquée **Modifiée**
  (✎) dans l’explorateur, les filtres, l’onglet Entraîner et la correction. « Restaurer le PDF » remet
  la grille d’origine. Enregistrer une grille identique au PDF supprime simplement la modification.
- Une range créée dans l’application est marquée **Personnalisée** (★).
- Chaque range modifiée ou créée est validée (169 mains, fréquences qui totalisent 100 %, actions de la
  légende) avant l’enregistrement et à chaque démarrage ; une donnée invalide est écartée et signalée.
- Les questions et les corrections utilisent la version enregistrée.

## Explorateur (onglet Ranges)

- Choix du format, de la situation et de la profondeur ; page du PDF indiquée.
- Recherche d’une main (« KTo », « A5s ») ou d’un ensemble (« 77+, A2s+ » : les mains trouvées sont
  marquées d’un point).
- Zoom de la grille, affichage des mains marginales, légende avec comptes et part des combos (toucher une
  action pour l’isoler), détail d’une main avec comparaison aux autres profondeurs et ta réussite.
- Couleurs : thème sombre de l’application ou couleurs exactes du PDF (bouton palette ou Réglages).
- Actions : S’entraîner, Modifier, Dupliquer, Restaurer le PDF (si modifiée), Supprimer (si personnalisée).

## Éditeur

- **Pinceau** : choisir une action de la légende, puis toucher ou faire glisser le doigt sur la grille.
- **Fréquences** : toucher une main pour régler une stratégie mixte (curseurs par pas de 5 %, total
  normalisé à 100 %). La règle stricte (RNG) s’applique alors à ces mains.
- **Saisie rapide** : notation poker appliquée à l’action sélectionnée ; la liste actuelle de l’action
  est affichée en notation compacte et peut être copiée.
- **Annuler** (50 étapes), « Revenir à la grille du PDF », avertissement si l’on quitte sans enregistrer.
- Ranges personnalisées : ajout d’actions (actions connues ou libellé libre, couleur attribuée),
  retrait d’une action (ses mains passent à Fold ou à la première action restante).

### Notation

| Écriture | Mains |
|---|---|
| `77`, `AKs`, `AKo` | une main |
| `AK` | AKs et AKo |
| `77+` | 77 à AA |
| `A2s+`, `KTo+` | du kicker indiqué jusqu’au rang juste sous la première carte (A2s…AKs ; KTo, KJo, KQo) |
| `99-66`, `A5s-A2s` | un intervalle |

Une écriture non reconnue est signalée ; aucune main n’est ajoutée à sa place.

## Nouvelle range

1. Format (3-max ou heads-up).
2. Situation : seules les situations cohérentes préflop sont proposées (par exemple BTN uniquement en
   open en 3-max ; BB face à la SB ou au BTN).
3. Profondeur (raccourcis ou valeur libre). Une range qui existe déjà (même situation et profondeur) est
   refusée avec un lien pour la modifier.
4. Actions de la légende (suggestions selon la situation, actions connues, libellés libres).
5. Action par défaut de toutes les mains, puis la grille s’ouvre dans l’éditeur.

« Dupliquer » part d’une range existante (actions et grille copiées) pour créer, par exemple, une autre
profondeur. Une nouvelle profondeur d’un spot du PDF rejoint le même groupe (ex. BTN 25 / 20 / 15 / 10 BB)
et apparaît dans la comparaison « autres profondeurs ».

## Mains marginales

Par défaut, une main est marginale quand une de ses voisines dans la grille a une autre action (frontière
calculée). L’écran « Définir mes mains marginales » permet, range par range, d’ajouter ou de retirer des
mains ; « Calculées » revient à la frontière automatique. Le mode « Mains marginales » ne pose que ces
mains.
