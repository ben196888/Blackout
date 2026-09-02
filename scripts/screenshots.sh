#!/usr/bin/env bash
# Run the screenshot spec inside the pinned Playwright image.
#
# Text metrics differ enough between a bare GitHub runner and this image to move
# the page by a pixel, which fails a full-page comparison, so both the baselines
# and the comparison run here.
#
#   scripts/screenshots.sh            compare against the committed baselines
#   scripts/screenshots.sh --update   re-render them
#
# node_modules, dist and dist-server are container-only volumes: the host tree
# holds darwin binaries and a darwin build, and neither survives being written
# by a Linux container.
set -euo pipefail

update=''
if [[ "${1:-}" == '--update' ]]; then update='--update-snapshots'; fi

version="$(node -p "require('./package.json').devDependencies['@playwright/test']")"
image="mcr.microsoft.com/playwright:v${version}-noble"
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# pnpm needs to own node_modules, so the container runs as root and hands the
# files it wrote back to the caller on the way out.
exec docker run --rm \
  --volume "$repo:/repo" \
  --volume /repo/node_modules \
  --volume /repo/dist \
  --volume /repo/dist-server \
  --workdir /repo \
  --env CI=1 \
  --env BLACKOUT_SHOTS=1 \
  --env "UPDATE=$update" \
  --env "HOST_OWNER=$(id -u):$(id -g)" \
  "$image" \
  bash -lc '
    corepack enable pnpm || exit 1
    pnpm install --frozen-lockfile --store-dir /tmp/pnpm-store || exit 1
    pnpm exec playwright test tests/e2e/screenshots.spec.ts $UPDATE
    status=$?
    chown -R "$HOST_OWNER" tests/e2e/__screenshots__ test-results playwright-report 2>/dev/null || true
    exit $status
  '
