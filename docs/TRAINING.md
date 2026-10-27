# Moteur d’entraînement

Code : `src/domain/` (sans dépendance à l’interface, couvert par `tests/`).

## Questions

Une question = une range + une main. L’application tire deux cartes réelles cohérentes avec la main
(assorties, dépareillées ou paire) et **distribue une main à une vraie table** (voir « Main simulée »
ci-dessous) : on ne choisit pas une réponse dans une liste, on joue avec les boutons d’un client de
poker. Le coup joué est ensuite comparé aux actions de la légende de la range.

Génération (`quiz.ts`) :

- tirage pondéré **sans remise** : pas de répétition tant que la sélection contient assez de mains ;
  au-delà, nouveau cycle et jamais deux fois la même main d’affilée ;
- option « mains limites » (par défaut) : les mains dont l’action diffère d’une voisine dans la grille
  sont tirées 3 fois plus souvent ; les mains évidentes (72o…) restent présentes mais plus rares ;
- rappel d’erreur : une main ratée est reposée 3 questions plus tard (une fois, hors examen), dans la
  limite d’un tiers de la session ;
- sessions de 10, 25 ou 50 questions, ou **illimitées** (nouvelles questions ajoutées au fil de l’eau,
  bouton « Terminer la session ») ;
- option « Inclure Profil dépendant » : si elle est désactivée, les 10 mains concernées ne sont pas posées ;
- correction « Rapide » : après une bonne réponse, la question suivante s’affiche seule ; « Détaillée » :
  la correction reste affichée jusqu’à « Main suivante ».

## Main simulée (`play.ts`)

L’écran d’entraînement reproduit une table de Spin & Go (paysage sur Android, plein écran ; le reste de
l’application reste en portrait). Tous les joueurs commencent avec la profondeur de la range, les
blindes sont posées (0,5 / 1 BB), les pseudos sont neutres, la position de chacun est affichée.

Commandes : **Passer**, **Parole** ou **Suivre X BB**, **Relancer à X BB** (ou **Tapis**), raccourcis
**Min.**, **3 BB** (ou **3×** face à une relance), **Pot**, **Max.**, curseur et boutons − / + (pas de
0,5 BB). Clavier : 1 / 2 / 3, Entrée pour la main suivante.

Action avant le héros (d’après le spot du PDF) :

| Spot | Ce qui se passe avant toi |
|---|---|
| BTN (open) | rien : tu parles en premier |
| SB vs BTN | le BTN relance à 2 BB (ou fait tapis à 10 BB) |
| SB vs BB (open) | le BTN passe |
| BB vs SB | le BTN passe, la SB relance à 3 BB à 25 BB, 2 BB à 15 BB (tapis à 10 BB) |
| HU BB | la SB relance à 2 BB (15 BB), limp (12 BB) ou fait tapis (8 BB) |

Tailles attendues : **minraise = relance à 2 BB exactement**, **3x = 3 BB exactement**,
**open shove / 3bet all-in = Max.** ; « 3bet non all-in » et « Iso » acceptent toute relance qui n’est
pas un tapis. Une autre taille est une erreur (elle ne correspond à aucune action de la range).

**L’adversaire va au bout de l’action.** Quand le plan attendu a une deuxième partie, l’adversaire joue
la ligne qui t’oblige à prendre cette deuxième décision :

| Plan | Réaction adverse | Deuxième décision attendue |
|---|---|---|
| Minraise / Fold, Minraise / Call, 3x / Fold, 3x / Call | relance à 3 × ta relance (6 BB après un minraise, 9 BB après 3 BB) ; si tu ouvres du BTN, la SB ou la BB au hasard | Passer / Suivre |
| 3bet non all-in / Fold ou Call, Iso / Fold ou Call | tapis | Passer / Suivre |
| Limp / Fold, Limp / Call, Limp / Reraise | relance (2,5 BB en heads-up, 3 à 5 BB en 3-max) | Passer / Suivre / sur-relancer (tapis accepté) |
| Limp/call vs 3bet, fold sinon | relance de 3 à 5 BB **ou** tapis, au hasard | Suivre la relance, passer sur le tapis |
| Limp/call vs 2.5x, fold sinon | relance à 2,5 BB **ou** tapis, au hasard | Suivre la relance, passer sur le tapis |
| Limp / Reraise vs 2.5x | relance à 2,5 BB | sur-relancer |

Les autres joueurs passent. Une relance qui dépasse le tapis adverse devient un tapis.

Correction : la ligne jouée (ex. « Relance à 2 BB → SB relance à 6 BB → Suivre ») est rattachée à
l’action de la légende qu’elle réalise ; elle est juste si cette action est acceptée par la règle de
correction. Une ligne qui ne correspond à aucune action (mauvaise taille, limp non prévu…) est
enregistrée telle quelle et comptée fausse. Si la première décision est déjà fausse (par exemple
relancer une main à passer), la main s’arrête là. **Profil dépendant** : suivre ou passer sont acceptés,
avec la mention dans la correction (l’option pour exclure ces mains reste disponible).

Le test `tests/play.test.ts` joue la ligne de référence de chacune des 3 042 mains du PDF avec
plusieurs réactions adverses et vérifie qu’elle est notée juste, et qu’une première décision étrangère
à la range est notée fausse.

## Modes

| Mode | Contenu |
|---|---|
| Rapide | Toutes les ranges, tirage pondéré ; les révisions dues sont posées 3 fois plus souvent |
| Aléatoire / par range | Mains de la sélection, tirage pondéré ci-dessus |
| Personnalisé | Filtres combinés : format, situation, profondeur, ranges, **type d’action attendu** (libellés exacts) |
| Mains marginales | Uniquement les mains marginales de chaque range (frontière calculée ou sélection personnelle) |
| Ciblé | Priorité aux mains ratées, à faible réussite lissée, puis aux mains jamais vues |
| Erreurs | Uniquement les mains en cours de révision (ratées et pas encore maîtrisées) |
| Révision | Uniquement les mains ratées dont la révision est due |
| Examen | Pas de correction avant la fin ; option de temps par décision (8 / 15 / 30 s) |

## Règles de correction (`grading.ts`)

- **Tolérante** : toute action jouée par la range (fréquence > 0) est correcte.
- **Stricte** : pour une main mixte, un nombre aléatoire 1-100 (« RNG ») est affiché ; l’action attendue
  est celle dont l’intervalle cumulé de fréquences contient ce nombre. Pour une main pure, seule
  l’action de la range est correcte.
- **Examen** : score de précision = fréquence de l’action choisie (1 pour la bonne action d’une main pure,
  0,3 pour une action jouée 30 % du temps, 0 sinon). Temps écoulé = 0.

Le PDF actuel ne contient que des mains pures : les trois règles donnent le même verdict. Les cas mixtes
sont testés avec des données de test synthétiques (`tests/fixtures.ts`), jamais injectées dans l’application.

## Révision espacée (`review.ts`)

Boîtes de Leitner, volontairement simples et affichées dans l’application :

- erreur → la main revient 10 minutes plus tard ;
- bonne réponse **à la date prévue** → 1 jour, puis 3 jours, puis 7 jours ;
- après 4 bonnes réponses espacées, la main est maîtrisée et sort de la liste ;
- une nouvelle erreur la remet au départ. Les bonnes réponses données avant la date prévue ne font
  pas avancer la main (c’est l’espacement qui consolide la mémoire).

## Statistiques (`stats.ts`)

Calculées uniquement à partir des réponses enregistrées :

- totaux par main (illimités dans le temps), totaux par jour, journal des 3 000 dernières réponses
  (pour les périodes 7 / 30 jours) et des 300 dernières sessions ;
- réussite globale avec fourchette probable (intervalle de Wilson à 95 %) ;
- ventilation par range, position, spot, profondeur, format ; moins de 10 réponses = grisé « peu de
  données » ; les « ranges à travailler » ne retiennent que les catégories avec assez de réponses ;
- comparaison « 7 derniers jours vs avant » affichée seulement si les deux échantillons sont suffisants.

## Sauvegarde

Écriture après chaque réponse (`storage/`). Sur Android : Capacitor Preferences (SharedPreferences),
sur le web : localStorage. Une donnée illisible n’est jamais effacée en silence : elle est copiée sous
une clé de secours et l’utilisateur est prévenu ; un échec d’écriture est signalé avec un bouton
« Réessayer ». Export / import JSON dans Réglages.
