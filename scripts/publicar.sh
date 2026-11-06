#!/usr/bin/env bash
# Publica el sitio compilado en GitHub Pages (rama gh-pages de origin): https://ericmargay.github.io/praxiboscopic/
# Se compila aquí y no en GitHub Actions porque @aminoacid/omega es privado y se enlaza con file:../omega.
# Uso: npm run publicar
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
remote="$(git -C "$root" remote get-url origin)"
rev="$(git -C "$root" rev-parse --short HEAD)"
# el sitio sale de la copia de trabajo: si tiene cambios sin commit, el mensaje lo dice
if [[ -n "$(git -C "$root" status --porcelain)" ]]; then rev="$rev con cambios sin commit"; fi
cd "$root"
# el ZIP del paquete para los talleres no va en git: se arma si falta
if [[ ! -f public/fabricacion/tambores/mesa-tambores-taller.zip ]]; then node scripts/fabricar.mjs; fi
npm run build
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R dist/. "$tmp/"
# los videos importados son material de terceros: no se publican salvo que se pida (--con-videos)
if [[ "${1:-}" != "--con-videos" ]]; then rm -rf "$tmp/videos"; fi
touch "$tmp/.nojekyll" # sin Jekyll: sirve tal cual las carpetas y archivos
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$root" config user.name)" -c user.email="$(git -C "$root" config user.email)" commit -qm "Sitio compilado desde $rev"
git push -qf "$remote" gh-pages
echo "→ publicado $rev en gh-pages: https://ericmargay.github.io/praxiboscopic/"
