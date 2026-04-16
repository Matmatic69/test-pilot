# Souvenir QR

Site web de souvenirs commémoratifs avec codes QR personnalisés.

## Description

Souvenir QR permet de créer des mémoriaux numériques pour honorer la mémoire de vos proches. Les utilisateurs peuvent :

- Créer un espace souvenir avec photos, vidéos et messages
- Générer un code QR unique pour chaque mémorial
- Partager le souvenir via le code QR ou un lien direct
- Commander une plaque commémorative personnalisée

## Fonctionnalités

- ✅ Formulaire de création de souvenir
- ✅ Upload de photos et vidéos sur Firebase Storage
- ✅ Sauvegarde des données dans Firestore
- ✅ Génération automatique de codes QR
- ✅ Page de visualisation responsive
- ✅ Design moderne et épuré

## Technologies utilisées

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Firebase (Firestore, Storage)
- **QR Code**: qrcode.min.js
- **Déploiement**: Netlify

## Structure du projet

```
├── index.html          # Page d'accueil
├── create.html         # Formulaire de création
├── souvenir.html       # Page d'affichage du souvenir
├── css/
│   └── style.css       # Styles CSS
├── js/
│   ├── firebase-config.js  # Configuration Firebase
│   ├── main.js             # Script page d'accueil
│   ├── create.js           # Script création souvenir
│   └── souvenir.js         # Script affichage souvenir
├── cors.json           # Configuration CORS
├── netlify.toml        # Configuration Netlify
└── .gitignore          # Fichiers à ignorer
```

## Installation

1. Clonez le dépôt :
```bash
git clone https://github.com/[username]/souvenirs-eternels.git
cd souvenirs-eternels
```

2. Configurez Firebase dans `js/firebase-config.js` avec vos propres clés.

3. Lancez un serveur local :
```bash
python3 -m http.server
```

4. Ouvrez http://localhost:8000

## Configuration Firebase

Assurez-vous d'avoir activé :
- ✅ Firebase Storage
- ✅ Cloud Firestore
- ✅ Règles de sécurité configurées

## Déploiement

Le site est prêt pour le déploiement sur Netlify. Uploadez simplement les fichiers ou connectez votre dépôt GitHub.

## Licence

MIT License
