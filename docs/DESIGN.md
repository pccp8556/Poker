# Design

## Principes

- Thème sombre unique, inspiré du tapis de jeu (vert profond) sans pastiche ; accent jade, or pour les
  séries et révisions dues, rouge réservé aux erreurs.
- Conception mobile d’abord : actions principales en bas de l’écran (zone du pouce), cibles tactiles
  ≥ 44 px, marges latérales de 16 px, zones sûres (encoches) respectées, pas de défilement horizontal.
- Typographies embarquées (fonctionnent hors ligne) : Inter (interface, chiffres tabulaires) et
  Space Grotesk (titres, cartes).
- Animations courtes (distribution des cartes, apparition de la correction) ; désactivées si le système
  demande de réduire les animations.
- Paysage : sur téléphone, table à gauche et réponses à droite.

## Couleurs des actions

Les couleurs des grilles sont propres à l’application (les couleurs du PDF ne sont conservées que pour
la traçabilité). Chaque famille d’actions garde une teinte stable dans toutes les ranges :

| Famille | Couleur |
|---|---|
| Fold | gris ardoise `#2b3533` |
| Check | gris bleuté `#3e4a56` |
| Call | bleu clair `#8cbcf2` |
| Relance puis call (minraise / 3x / iso / 3bet NAI) | vert `#199e70` |
| Relance puis fold | corail `#f4a3a3` |
| Tapis (open shove, 3bet all-in, iso all-in) | violet `#5a48c8` |
| Limp / Call | vert foncé `#005c00` |
| Limp / Fold | jaune `#ecc94b` |
| Limp / Call conditionnel (vs 3bet, vs 2.5x) | orange `#d95926` |
| Limp / Reraise | prune `#97305a` |
| Profil dépendant | magenta `#d55181` |

Les luminosités ont été choisies par calcul pour que **chaque paire d’actions présente dans une même
range** reste distinguable : écart OKLab ≥ 15 en vision normale et ≥ 8 en simulation de daltonisme
(protanopie / deutéranopie), y compris contre le gris du fold. Encodage secondaire : chaque case porte
le nom de la main, la légende permet d’isoler une action, et toucher une case affiche son action en texte.
La correction n’utilise jamais la couleur seule (icône + texte).
