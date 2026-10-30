#!/usr/bin/env bash
# QUOTES FROM FRENS: puts the game online on SuperRare Studio in one go, from this folder. Run it yourself: it uses YOUR
# SuperRare Studio account (rare-profile), and nothing here ever stores a token or a key.
#   bash launch.sh
# The first time it creates the app (a placeholder page, once), writes deploy/quotes-from-frens.config.json from the answer,
# then builds and updates the app. Every later run only rebuilds and updates the same app.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' || { echo "Node.js 22 or newer is needed (https://nodejs.org)."; exit 1; }

say "1/5 · Dependencies and the game's own tests"
npm ci --no-audit --no-fund
npm run typecheck
npx tsx --test tests/quotes-from-frens.test.ts

say "2/5 · The SuperRare Studio CLI"
command -v rare-profile >/dev/null 2>&1 || npm install --global @rareprotocol/rare-profile@0.1.0

if [ ! -f deploy/quotes-from-frens.config.json ]; then
  say "3/5 · First time: sign in and create the app (once, never again for this game)"
  rare-profile login
  # the K4NCUN0 storefront (Studio → apps → launch); `store list` never prints ids, so it is named here
  STORE="${STORE:-3376d19e-8702-4c79-8de8-0899fcf96315}"
  # the placeholder page, zipped by Node (Git Bash on Windows has no zip); relative paths work on every shell
  mkdir -p .launch
  node -e "const { zipSync, strToU8 } = require('fflate'); require('fs').writeFileSync('.launch/bootstrap.zip', zipSync({ 'index.html': strToU8('<!doctype html><title>Integration test only</title><h1>Integration test only</h1>') }))"
  rare-profile app deploy --store "$STORE" --title "QUOTES FROM FRENS - integration test" --price 0 --zip .launch/bootstrap.zip --json | tee .launch/app.json
  node --import tsx scripts/quotes-from-frens-config.ts .launch/app.json
else
  say "3/5 · deploy/quotes-from-frens.config.json is there: updating the same app"
fi

APP_ID=$(node -e 'console.log(require("./deploy/quotes-from-frens.config.json").appId)')
ORIGIN=$(node -e 'console.log(require("./deploy/quotes-from-frens.config.json").appOrigin)')

say "4/5 · Build"
npm run build -- --config deploy/quotes-from-frens.config.json --output dist/quotes-from-frens.zip --force

say "5/5 · Update the app (it also registers the verifier and the scoring event)"
if ! rare-profile app update "$APP_ID" --zip dist/quotes-from-frens.zip --max-attempts 10000 --json; then
  echo "The update was refused: signing in again and retrying once."
  rare-profile login
  rare-profile app update "$APP_ID" --zip dist/quotes-from-frens.zip --max-attempts 10000 --json
fi

say "Online: $ORIGIN"
cat <<EOF
Open it and play "Practice, free" (do not buy credits to test: paid play works once the arcade has the game).

Then submit it: https://thewallarcade.superrare.com/submit.html (sign in with the wallet that holds K4NCUN0)
  Game address : $ORIGIN
  App ID       : $APP_ID
  Title        : QUOTES FROM FRENS
  One line     : Finish the official JPEG Frens quotes before the fuse burns out. Drag the right words. 90 seconds, don't lose one.
  Payout wallet: your payout wallet
  The box      : 1 credit per play · the credit line stays in the game · one edition to the holder of JPEG-FRENS (panel 32)
EOF
