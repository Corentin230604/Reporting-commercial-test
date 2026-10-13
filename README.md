# Oxigen Reporting

Transforme le reporting commercial mensuel en **présentation web animée** aux couleurs Oxigen, à partager au client par un lien. Le client peut l'**exporter en PDF** (A4 paysage) pour l'archiver.

## Fonctionnement

```
.pptx finalisé ──► import (serveur) ──► modèle de reporting (JSON) ──► viewer animé ──► export PDF
                                             ▲
Excel ──► calculs + rédaction (à venir) ─────┘
```

Le viewer ne connaît qu'un **modèle de reporting** (`shared/model.ts`), indépendant de la source. Aujourd'hui ce modèle est produit par l'import d'un `.pptx` terminé. Demain, l'automatisation (3 fichiers Excel → calculs → commentaires) produira ce même modèle. Les deux voies coexisteront.

### Import d'un .pptx

- Les textes, formes, couleurs, liens internes (renvois vers les annexes, bouton « Retour ») et positions sont repris tels quels.
- Les graphiques et tableaux collés depuis Excel (images EMF) sont convertis en **SVG vectoriels** par LibreOffice. Ils restent nets à tout niveau de zoom et cliquables pour agrandissement.
- La nature de chaque slide est déduite du nom de son gabarit Oxigen : page de garde, glossaire, sommaire, intercalaire, contenu, annexe, dernière page.
- Les éléments de gabarit (bandeau de navigation, filets décoratifs) sont remplacés par un habillage Oxigen modernisé.

### Viewer client

- Animations d'entrée en cascade : cartes, textes, révélation des graphiques, compteurs sur les chiffres clés, flèches de variation colorées.
- Navigation : flèches du clavier, balayage tactile, bandeau de sections cliquable, sommaire cliquable, barre de progression par section, vue d'ensemble (`G`), plein écran (`F`), rejouer l'animation (`R`).
- **Export PDF** : bouton orange ; une page par slide, A4 paysage.
- **Lien client** : `/r/<id>?client` masque les fonctions internes (retour à la liste, copie de lien).

## Démarrer en local

Prérequis : Node.js 20+ et LibreOffice (`soffice` dans le PATH ; sinon renseigner `SOFFICE_PATH`).

```bash
npm install
npm run dev          # API sur :3001 + application sur http://localhost:5173
```

Import en ligne de commande (optionnel) :

```bash
npm run import -- "OV - Reporting CA et Marge 202609.pptx"
```

## Mise en production

```bash
docker build -t oxigen-reporting .
docker run -p 3001:3001 -v oxigen-data:/data oxigen-reporting
```

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port HTTP | `3001` |
| `DATA_DIR` | Dossier de stockage des reportings | `./data` |
| `SOFFICE_PATH` | Chemin de LibreOffice | `soffice` |

Chaque reporting est stocké dans `DATA_DIR/reports/<id>/` : `report.json`, les images et graphiques convertis, et le `.pptx` d'origine.

## Structure

```
server/            API (Express), import pptx, conversion EMF → SVG, stockage
  pptx/            lecture OOXML : thème, masques, gabarits, formes, textes, tableaux
shared/model.ts    modèle de reporting commun (import pptx / automatisation)
src/               application web (React + Vite)
  slides/          moteur de rendu des slides + gabarits Oxigen + animations
  pages/           accueil (import), viewer, page d'impression PDF
```

## Prochaines étapes

1. **Accès client sécurisé** : connexion ou lien protégé, un espace par client.
2. **Graphiques natifs animés** : recréer les courbes, cascades et jauges à partir des données (au lieu des images Excel), avec survol des valeurs.
3. **Automatisation** : import des 3 fichiers Excel, calculs (réel / budget / N-1, mois et YTD), proposition de commentaires dans le style du reporting, relecture puis publication.
