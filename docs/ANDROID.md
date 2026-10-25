# Application Android (APK)

L’application Android embarque exactement le build web (`dist/`) dans un WebView natif via
**Capacitor 8**. Aucun code à réécrire : `npm run build` puis `npx cap sync android`.

| | |
|---|---|
| Identifiant | `fr.rangelab.app` (débogage : `fr.rangelab.app.debug`, installable à côté) |
| Nom | Range Lab |
| SDK | min 24 (Android 7), cible / compilation 36 |
| Version | `versionName 1.0.0`, `versionCode 1` (dans `android/app/build.gradle`) |
| Stockage | Capacitor Preferences (SharedPreferences) |
| Bouton retour | ferme une feuille ouverte, sinon page précédente, quitte depuis l’accueil |
| Hors ligne | 100 % (aucun accès réseau requis) |

Icônes et écran de démarrage : générés depuis `public/icon.svg` par `node scripts/android-assets.cjs`.

## APK de débogage ou de production

- **Débogage** (`app-debug.apk`) : signé automatiquement avec une clé de test Android. Pour essayer
  l’application sur son téléphone. Ne pas publier.
- **Production** (`app-release.apk`) : signé avec **votre** clé (keystore). C’est elle qui permet les
  mises à jour : la même clé doit être réutilisée pour toujours. Sans clé configurée, Gradle produit un
  APK de release non signé, non installable.

## Option 1 — GitHub Actions (rien à installer)

Le workflow `.github/workflows/android.yml` compile un APK de débogage à chaque push sur `main` ou
sur les branches `ccr-*` (ou manuellement : onglet **Actions → Android APK → Run workflow**).
Le fichier est téléchargeable dans l’onglet **Actions**, en bas de la page du run (« Artifacts »,
`range-lab-debug-apk`, archive zip contenant l’APK).

APK de production signé : créer une clé (voir plus bas), puis dans **Settings → Secrets and variables →
Actions** ajouter :

| Secret | Contenu |
|---|---|
| `RANGELAB_KEYSTORE_BASE64` | `base64 -w0 range-lab.jks` |
| `RANGELAB_KEYSTORE_PASSWORD` | mot de passe du keystore |
| `RANGELAB_KEY_ALIAS` | alias de la clé (ex. `rangelab`) |
| `RANGELAB_KEY_PASSWORD` | mot de passe de la clé |

Le run suivant publie aussi `range-lab-release-apk`.

## Option 2 — Sur un ordinateur

Prérequis : Node 22, JDK 21, Android SDK (via Android Studio ou les command line tools) avec
« Android SDK Platform 36 » et « Build-Tools 36 ».

```bash
npm ci
npm run android:debug        # build web + sync + ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Si Gradle ne trouve pas le SDK : créer `android/local.properties` avec `sdk.dir=/chemin/vers/Android/Sdk`.

Ouvrir le projet dans Android Studio : `npx cap open android`.

### Créer la clé de production (une seule fois, à conserver précieusement)

```bash
keytool -genkeypair -v -keystore range-lab.jks -alias rangelab -keyalg RSA -keysize 2048 -validity 10000
```

Puis créer `android/keystore.properties` (ignoré par git) :

```properties
storeFile=/chemin/absolu/range-lab.jks
storePassword=…
keyAlias=rangelab
keyPassword=…
```

```bash
npm run android:release
# → android/app/build/outputs/apk/release/app-release.apk
```

Pour publier sur le Play Store, préférer un bundle : `cd android && ./gradlew bundleRelease`.
Avant chaque nouvelle version : incrémenter `versionCode` et `versionName`.

## Installer l’APK sur le téléphone

Copier l’APK sur le téléphone, l’ouvrir et autoriser l’installation depuis cette source
(« Installer des applis inconnues »).

## Vérifications déjà faites

- `assembleDebug` compilé dans l’environnement de développement : APK de 4,9 Mo, paquet
  `fr.rangelab.app.debug`, cible API 36, signature de débogage valide (`apksigner verify`), build web
  et ranges bien embarqués.
- `assembleRelease` compilé et signé avec une clé de test jetable (supprimée ensuite) : la chaîne de
  signature fonctionne.
- Non vérifié : exécution sur un appareil ou un émulateur réel (aucun appareil disponible dans
  l’environnement cloud).
