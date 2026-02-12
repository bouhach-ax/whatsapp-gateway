# Comment rendre ce projet VIVANT

Tu as maintenant le code Frontend (React) et le code Backend (Node.js). Voici quoi faire :

## Etape 1 : Le Backend (Sur Render.com)

1. Crée un nouveau **Repository GitHub** (ex: `smartdoc-backend`) et mets-y **uniquement** les fichiers du dossier `backend/` (c'est-à-dire `package.json` et `server.js`).
2. Va sur [Render.com](https://render.com) > New > **Web Service**.
3. Connecte ton repo GitHub.
4. **Build Command:** `npm install`
5. **Start Command:** `node server.js`
6. Clique sur "Deploy". Render va te donner une URL (ex: `https://smartdoc-backend.onrender.com`).

**Note :** Le dossier `auth_info_baileys` (session) sera perdu à chaque redémarrage sur la version gratuite de Render. Pour la prod, il faudra ajouter une base de données, mais pour tester maintenant, c'est suffisant.

## Etape 2 : Lier le Frontend

1. Ouvre le fichier `services/api.ts` dans ton Frontend.
2. Change `MOCK_MODE = false`.
3. Change `http://localhost:3000` par l'URL que Render t'a donnée (ex: `https://smartdoc-backend.onrender.com`).

## Etape 3 : C'est parti

1. Ouvre ton app React.
2. Va dans l'onglet **Instance**.
3. Clique sur "Connect".
4. Le QR Code qui s'affiche vient maintenant VRAIMENT de ton serveur Render.
5. Scanne avec ton téléphone.
