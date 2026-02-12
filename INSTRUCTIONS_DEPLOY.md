
# Comment rendre ce projet VIVANT

Tu as maintenant le code Frontend (React) et le code Backend (Node.js). Voici quoi faire :

## Etape 0 : La Base de Données (CRITIQUE)

1. Connecte-toi à [Supabase](https://supabase.com).
2. Ouvre ton projet `jccqciuptsyniaxcyfra`.
3. Va dans **SQL Editor**.
4. Copie le contenu du fichier `SUPABASE_SETUP.sql` de ce projet.
5. Colle-le dans Supabase et clique sur **RUN**.
6. Si tu vois "Success", c'est bon. Sans ça, rien ne marchera.

## Etape 1 : Le Backend (Sur Render.com)

1. Crée un nouveau **Repository GitHub** (ex: `smartdoc-backend`) et mets-y **uniquement** les fichiers du dossier `backend/` (c'est-à-dire `package.json` et `server.js`).
2. Va sur [Render.com](https://render.com) > New > **Web Service**.
3. Connecte ton repo GitHub.
4. **Build Command:** `npm install`
5. **Start Command:** `node server.js`
6. Clique sur "Deploy". Render va te donner une URL (ex: `https://smartdoc-backend.onrender.com`).

## Etape 2 : Lier le Frontend

1. Ouvre le fichier `services/api.ts` dans ton Frontend.
2. Vérifie que la variable `API_URL` pointe bien vers ton URL Render (c'est déjà configuré, mais vérifie).

## Etape 3 : C'est parti

1. Ouvre ton app React.
2. Va dans l'onglet **Instance**.
3. Clique sur "Connect".
4. Le QR Code qui s'affiche vient maintenant VRAIMENT de ton serveur Render via la base de données Supabase.
5. Scanne avec ton téléphone.
