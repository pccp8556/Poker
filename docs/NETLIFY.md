# Mise en ligne sur Netlify

La configuration est dans `netlify.toml` (aucune clé ni secret nécessaire) :

| Réglage | Valeur |
|---|---|
| Commande de build | `npm run build` |
| Dossier publié | `dist` |
| Node | 22 |
| Routage | URLs en `#/…` : fonctionne après actualisation sans réécriture serveur (règle de repli ajoutée par sécurité) |
| Cache | assets versionnés en cache 1 an ; `index.html` et `sw.js` toujours revalidés |

L’application n’appelle aucun serveur : tout (ranges, polices, icônes) est inclus dans le build.

## Étapes à faire une fois (compte Netlify requis)

1. Se connecter sur <https://app.netlify.com> (connexion possible avec GitHub).
2. **Add new site → Import an existing project → GitHub**, autoriser Netlify, choisir `pccp8556/Poker`.
3. Branche à déployer : choisir la branche de développement `ccr-85b356fa-bgyfdv`
   (la production ne suivra `main` qu’après validation et fusion).
   Les champs build / publish sont lus depuis `netlify.toml` : ne rien changer.
4. **Deploy**. Netlify fournit une URL du type `https://<nom>.netlify.app`, à ouvrir sur ordinateur et
   sur téléphone.
5. Recommandé : **Site configuration → Build & deploy → Branches and deploy contexts** :
   - *Branch deploys* : « All » (chaque branche obtient son URL `https://<branche>--<nom>.netlify.app`) ;
   - *Deploy Previews* : activé (chaque pull request obtient une URL de prévisualisation).

Chaque `git push` redéploie automatiquement.

## Vérifier un déploiement

- La page d’accueil indique « 18 ranges préflop ».
- `…/#/range/hu-bb-8` affiche la grille après actualisation.
- Couper le réseau puis recharger : l’application reste utilisable (cache hors ligne après une première visite).
- Sur téléphone : menu du navigateur → « Ajouter à l’écran d’accueil » pour l’utiliser comme une application.

## Alternative sans connecter le dépôt

`npm run build`, puis glisser le dossier `dist/` sur <https://app.netlify.com/drop>.
