# Correctif de sécurité Next.js — 17 novembre 2026

Mandat explicite de Philippe : corriger Next.js, consolider la recette, vérifier
et livrer sans fusion, déploiement ni fermeture de carte. Le rappel d’activité
actuel est conservé. Aucun schéma, donnée de recette ou règle produit ne change.

## Cible et portée

Base `dev` : `e663a2ea93d918163d88e0d82f4f94bdc6441863`.
Commit applicatif : `65d865872b11f7da1b5faf852599f193312bfe19`.
Next.js et eslint-config-next passent de 16.4.3 à 16.4.6. Le lockfile ne change
que les paquets de la famille Next (runtime, env, SWC et ESLint). React 19.3.0,
Auth.js et le serveur personnalisé sont inchangés.

Cette branche indépendante ne contient pas les cinq PR de recette encore
ouvertes. Leur recette humaine est [consolidée séparément](../human-2026-11-17/README.md).
Le bouton de création appartient au suivi de #205, pas à ce correctif de dépendances.

## Motif et revue de sécurité

Avis officiels consultés :

- [GHSA-mfr8-8qww-v76h](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h).
- [GHSA-pc58-hwjq-p385](https://github.com/vercel/next.js/security/advisories/GHSA-pc58-hwjq-p385).
- [GHSA-rhh4-g77r-r9qj](https://github.com/vercel/next.js/security/advisories/GHSA-rhh4-g77r-r9qj).
- [GHSA-vvgp-ww4w-46vf](https://github.com/vercel/next.js/security/advisories/GHSA-vvgp-ww4w-46vf).
- [GHSA-7qx7-33qx-rqx2](https://github.com/vercel/next.js/security/advisories/GHSA-7qx7-33qx-rqx2).

La correction de la branche 16 est publiée dans 16.4.5; 16.4.6 inclut ces correctifs.
La revue préalable et la revue indépendante du candidat ne trouvent pas
d’utilisation applicative de Cache Components, `use cache`, `unstable_cache`
ou de relais de réponses HTTP concerné dans le périmètre examiné. Cela limite
l’exposition identifiée sans démontrer l’absence de toute exposition possible.
Aucun exploit n’a été reproduit contre cette application.

Revues appliquées au commit applicatif `65d8658` : sécurité indépendante et
lockfile, puis architecture et exploitation. Aucun constat bloquant retenu.
Les workflows ne changent pas; la CI continue de fabriquer une archive Linux
et de lancer le serveur personnalisé avec Socket.IO. La revue documentaire
sépare les confirmations humaines des tests techniques et des validations
de production encore absentes.

La revue du diff complet du lockfile et `npm ls` ne trouvent ni copie résiduelle
de Next 16.4.3 ni incompatibilité de dépendance homologue. L’audit des dépendances
de production rapporte zéro vulnérabilité après la mise à jour. Cette affirmation
ne couvre pas les dépendances de développement : leurs alertes distinctes sont
hors de ce correctif ciblé. Aucun `npm audit fix --force` n’est utilisé.

## Vérifications locales

Node 24.13.0, copie neuve isolée sur macOS. PostgreSQL 17 temporaire sur
127.0.0.1:55447, stockage tmpfs sans volume; bases exclusivement synthétiques.
L’instance humaine sur 3890 et sa base sur 55446 ne sont pas utilisées par les tests.

| Contrôle | Résultat |
|---|---|
| Installation du lockfile / dépendances | Installation réussie |
| `npm run check:no-js` | Réussi |
| `npm run lint` | Réussi |
| `npm run typecheck` | Réussi |
| `npm test` | 2 654 tests réussis |
| `npm run build` | Build de production Next 16.4.6 réussi |
| Tests SQL | 433 réussis; 9 PgBouncer ignorés faute de pooler |
| Tests d’intégration | 11 réussis |
| `npm run db:generate -w @incision/database` | Aucun changement de schéma |
| `npm audit --omit=dev --json` | Zéro vulnérabilité rapportée |
| E2E complets | 216 réussis en 18,7 minutes, sans échec ni test ignoré |
| Archive de livraison | `scripts/package-release.sh 65d8658 /private/tmp/incision-next-security-20261117.zip` réussi, 126 Mo; runtime Next 16.4.6 dans l’archive |

### Sonde obligatoire `notFound()`

Copie de test distincte, Next 16.4.6, build de production, port 3218. Deux pages
temporaires appellent `notFound()`, l’une dans `(site)`, l’autre hors du groupe.
Les deux répondent HTTP 404 avec `<html id="__next_error__">` et un corps sans
le balisage thématisé normal. Une URL inconnue répond HTTP 404 avec `lang="fr"`,
`data-theme-choice="system"` et le corps `bg-abysse text-ecume`.
La restriction existante de `apps/web/AGENTS.md` reste donc nécessaire.
Ces pages de sonde ne sont pas livrées.

L’archive locale est construite pour macOS, pas certifiée comme artefact Linux.
Son inventaire ne contient ni fichier `.env`, ni page de sonde, ni corpus JSONL.
La fabrication Linux reste le rôle de la CI. Son installation `npm ci --omit=dev`
a réussi à partir du lockfile corrigé.

Incidents de banc, distincts de défauts applicatifs : le premier build de sonde
a refusé un lien node_modules externe à la racine Turbopack; une installation
propre a permis le build. Le premier démarrage a été refusé par le sandbox;
le démarrage autorisé sur loopback a ensuite réussi. Aucun contrôle supprimé.

## Limites et remise

### Réconciliation après les cinq merges humains

Le 17 novembre, #204, #205, #201, #203 et #202 sont fusionnées par Philippe.
La branche #206 intègre `dev 556a0d9cca4320d5526e68d25c4a7b8f5c1905f5`
par le commit de merge local `98e165868a64496251806d6aa235d9af178ea369`,
sans réécriture d'historique. Seul conflit : introduction de
`docs/RECETTE-FINALE.md`, résolu en conservant les deux attestations humaines.
Aucune règle produit, migration ou donnée n'est changée par cette résolution.

Comparaison avec la combinaison préalablement testée
`ba3adc760d43cb45eadc5f0cac834c1d417231d6` : tous les fichiers applicatifs,
tests, configurations et dépendances sont identiques; seul l'ordre des deux
paragraphes de cette introduction diffère avant ajout du présent compte rendu.
Cette combinaison a passé 2 668 tests unitaires, lint, types, build Next 16.4.6
et 29 E2E Chromium en 2,6 minutes, sans skip ni relance : CTA FR/EN,
navigation, Arcade, bonus, journal/historique, disposition, focus, zoom et
course complète avec résultats persistés sur texte synthétique.
Il ne s'agit pas d'une nouvelle recette humaine ni d'un essai sur corpus réel.

Revue architecte de la résolution : aucune attestation effacée; validations
A–G et limites conservées. Revue de la différence applicative avec la
combinaison testée : aucune différence. Les CI doivent encore être contrôlées
sur la nouvelle tête poussée; leurs résultats seront ajoutés à la PR.

CI distante à vérifier sur les commits effectivement poussés; les résultats
locaux ne la remplacent pas. OAuth réel, Neon, production et charge ne sont pas
réexécutés ici. La mini-qualification combinée ci-dessus ne remplace pas ces
contrôles d'environnement. Les validations humaines A–G sont conservées, non rejouées
par l’agent. Aucun merge ou fermeture de carte n’est autorisé.
