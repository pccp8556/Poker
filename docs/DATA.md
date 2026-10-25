# Données des ranges

## Source

| | |
|---|---|
| Fichier | `Ranges_Expresso_KillTilt (1).pdf` (racine du dépôt) |
| Titre | KILL TILT — Ranges Expresso · Bien démarrer en Spin & Go |
| Pages | 19 : sommaire (p. 1) + 18 ranges (p. 2 à 19) |
| Empreinte | SHA-256 enregistrée dans `src/data/ranges.json` (`source.sha256`) |

## Ranges intégrées (18/18)

| Format | Spot | Profondeurs | Situation (libellé du PDF) | Pages |
|---|---|---|---|---|
| 3-max | BTN | 25 / 15 / 10 BB | Open raise, premier à parler | 2–4 |
| 3-max | SB vs BTN | 25 / 15 BB | vs minraise | 5–6 |
| 3-max | SB vs BTN | 10 BB | vs open shove | 7 |
| 3-max | SB vs BB | 25 / 15 / 10 BB | Open SB (BTN fold) | 8–10 |
| 3-max | BB vs SB | 25 / 15 BB | vs open (raise) | 11–12 |
| 3-max | BB vs SB | 10 BB | vs shove | 13 |
| Heads-up | HU SB | 15 / 12 / 8 BB | premier à parler | 14–16 |
| Heads-up | HU BB | 15 BB | vs minraise | 17 |
| Heads-up | HU BB | 12 BB | vs limp | 18 |
| Heads-up | HU BB | 8 BB | vs open shove | 19 |

Aucune range du document n’est laissée de côté.

## Méthode d’extraction

Le PDF est généré par WeasyPrint : chaque main de la grille 13×13 est un rectangle vectoriel coloré
et chaque entrée de légende est un petit carré de la même couleur suivi du libellé de l’action.
`scripts/extract_ranges.py` lit directement ces objets vectoriels (pas d’OCR, pas d’estimation) et
**échoue** au lieu de produire une donnée plausible si :

- une page ne contient pas exactement 169 cases alignées en 13 lignes ;
- le texte d’une case n’est pas exactement la main attendue à cette position (AA, AKs, AKo…) ;
- la couleur d’une case ne correspond à aucune couleur de la légende ;
- un libellé de légende est inconnu (table `ACTIONS` du script) ou dupliqué.

## Contrôles

1. **Contrôle indépendant par image** (`scripts/verify_ranges.py`) : chaque page est rendue en image
   avec `pdftoppm`, la couleur de chaque case est mesurée sur l’image et comparée à la couleur de
   l’action enregistrée. Résultat : **3 042 cases vérifiées, 0 écart**. Le script produit aussi des
   images côte à côte (PDF / grille reconstruite) pour une vérification visuelle, faite sur plusieurs pages.
2. **Tests automatisés** (`tests/data.test.ts`) : 18 ranges, 169 mains chacune, fréquences valides,
   comptes de mains par action pour chaque range (valeurs de référence), et 24 mains contrôlées
   visuellement sur le PDF (ex. HU BB 8 BB : K7s = « Profil dépendant », A2o = Call, 22 = Fold).
3. **Validation au démarrage** : l’application revalide le fichier et affiche une erreur explicite
   s’il est incohérent (main manquante, fréquence invalide, action absente de la légende).

## Format

```jsonc
{
  "id": "3max-sb-vs-btn-25",
  "format": "3max", "spot": "sb-vs-btn", "hero": "SB", "villain": "BTN",
  "stackBb": 25, "scenario": "vs-minraise",
  "title": "SB vs BTN", "subtitle": "vs minraise / open shove", "scenarioLabel": "VS MINRAISE",
  "source": { "page": 5 },
  "actions": [{ "id": "3bet-allin", "label": "3bet All-in", "sourceLabel": "3bet All-in", "sourceColor": "#5a4fa0" }],
  "hands": { "AA": { "3bet-allin": 1 }, "…": {} }
}
```

Les fréquences sont explicites (`{ action: fréquence }`) pour pouvoir représenter des stratégies mixtes
si une autre source en fournit. Les identifiants d’actions sont communs à toutes les ranges.

## Ranges modifiées ou ajoutées dans l’application

Le fichier `src/data/ranges.json` n’est jamais modifié par l’application. Les modifications et les
ranges créées sont enregistrées à part sur l’appareil (`rl.ranges.v1`), revalidées au démarrage (une
donnée invalide est écartée et signalée), marquées « Modifiée » ou « Personnalisée » partout, et incluses
dans l’export de sauvegarde. Une range du PDF modifiée peut être restaurée à tout moment. Voir
[RANGES.md](RANGES.md).

## Points d’attention (à valider par vous)

- **Pas de fréquences dans le document** : chaque case est d’une seule couleur, donc chaque main a une
  seule action (100 %). Les modes de correction « tolérant » et « strict » donnent ici le même résultat.
  Rien n’a été inventé pour simuler des fréquences.
- **« Profil dépendant »** (HU BB 8 BB vs open shove, 10 mains : K7s, K6s, Q8s, J8s, T9s, T8s, 98s,
  Q9o, K8o, K7o) : le document ne tranche pas. C’est donc la réponse attendue pour ces mains ; aucune
  interprétation (call/fold) n’a été ajoutée.
- **Tailles non précisées** : la taille du « 3bet non all-in » et celle de l’open raise de la SB
  (BB vs SB 25/15 BB) ne sont pas indiquées ; l’application ne les affiche pas.
- **Libellés unifiés** : « 3bet NAI / Call » (p. 11, 12, 17) et « 3bet Non all in / call » (p. 5, 6)
  désignent la même action (NAI = non all-in) et partagent l’identifiant `3bet-nai-call`. Le libellé
  d’origine reste stocké dans `sourceLabel`.
- **Libellés conditionnels conservés tels quels** : « Limp/call vs 3bet, fold sinon »,
  « Limp/call vs 2.5x, fold sinon », « Limp/reraise vs 2.5x » restent des actions distinctes de
  « Limp / Call » et « Limp / Reraise ».
- **Fold présent dans la légende sans aucune main** (HU SB 15 / 12 / 8 BB) : il est proposé comme
  réponse ; il n’est jamais correct dans ces ranges (la SB ne se couche jamais).
- **Profondeur** : le PDF indique « 25bb », « 15bb »… sans préciser s’il s’agit du tapis effectif ;
  l’application affiche « Profondeur 25 BB ».
