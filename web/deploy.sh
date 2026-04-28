#!/usr/bin/env sh
set -eu

npm install
npm run build

if command -v vercel >/dev/null 2>&1; then
  vercel deploy --prod dist
elif command -v wrangler >/dev/null 2>&1; then
  wrangler pages deploy dist --project-name teleton-client-web
else
  printf '%s\n' "Build is ready in web/dist. Install vercel or wrangler to deploy from this script."
fi
