# Moteur d’entraînement

Code : `src/domain/` (sans dépendance à l’interface, couvert par `tests/`).

## Questions

Une question = une range + une main. L’application tire deux cartes réelles cohérentes avec la main
(assorties, dépareillées ou paire), affiche la table (positions, bouton, action adverse), la
profondeur et l’action précédente telle que décrite par le PDF. Les réponses proposées sont
**exactement les actions de la légende de la range** (jamais d’action étrangère au spot), dans un ordre
constant : fold → check / call → limp → relance → tapis.

Génération (`quiz.ts`) :

- tirage pondéré **sans remise** : pas de répétition tant que la sélection contient assez de mains ;
  au-delà, nouveau cycle et jamais deux fois la même main d’affilée ;
- option « mains limites » (par défaut) : les mains dont l’action diffère d’une voisine dans la grille
  sont tirées 3 fois plus souvent ; les mains évidentes (72o…) restent présentes mais plus rares ;
- rappel d’erreur : une main ratée est reposée 3 questions plus tard (une fois, hors examen), dans la
  limite d’un tiers de la session.

## Modes

| Mode | Contenu |
|---|---|
| Aléatoire | Mains de la sélection, tirage pondéré ci-dessus |
| Ciblé | Priorité aux mains ratées, à faible réussite lissée, puis aux mains jamais vues |
| Erreurs | Uniquement les mains en cours de révision (ratées et pas encore maîtrisées) |
| Révision | Uniquement les mains ratées dont la révision est due |
| Examen | Pas de correction avant la fin ; option de temps par question (8 / 15 / 30 s) |

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
