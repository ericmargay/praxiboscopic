#!/usr/bin/env bash
# Publica el sitio compilado en GitHub Pages (rama gh-pages de origin): https://ericmargay.github.io/praxiboscopic/
# Se compila aquí y no en GitHub Actions porque @aminoacid/omega es privado y se enlaza con file:../omega.
# Uso: npm run publicar
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
remote="$(git -C "$root" remote get-url origin)"
rev="$(git -C "$root" rev-parse --short HEAD)"
cd "$root"
npm run build
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R dist/. "$tmp/"
touch "$tmp/.nojekyll" # sin Jekyll: sirve tal cual las carpetas y archivos
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$root" config user.name)" -c user.email="$(git -C "$root" config user.email)" commit -qm "Sitio compilado desde $rev"
git push -qf "$remote" gh-pages
echo "→ publicado $rev en gh-pages: https://ericmargay.github.io/praxiboscopic/"
