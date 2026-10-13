#!/bin/sh
# Regression guard: every subapp frontend nginx must resolve its backend at
# request time through Docker's embedded DNS. A literal `proxy_pass http://host`
# is resolved once at startup and cached forever, so a container restart or a
# bad boot order leaves nginx pointing at a stale IP (watchlist outage).
#
# Usage: scripts/check-nginx-runtime-dns.sh [file ...]
# Without arguments, checks every */frontend/nginx.conf from the repo root.

set -u

if [ "$#" -eq 0 ]; then
    cd "$(dirname "$0")/.." || exit 2
    set -- */frontend/nginx.conf
fi

status=0
for f in "$@"; do
    [ -f "$f" ] || { echo "MISSING: $f"; status=1; continue; }

    if grep -nE '^[[:space:]]*proxy_pass[[:space:]]+https?://' "$f"; then
        echo "FAIL: $f uses a literal proxy_pass hostname (resolved once at startup)"
        status=1
    fi

    if grep -qE '^[[:space:]]*proxy_pass[[:space:]]' "$f" \
        && ! grep -qE '^[[:space:]]*resolver[[:space:]]+127\.0\.0\.11' "$f"; then
        echo "FAIL: $f has proxy_pass but no 'resolver 127.0.0.11'"
        status=1
    fi
done

[ "$status" -eq 0 ] && echo "OK: all checked nginx configs resolve backends at request time"
exit "$status"
