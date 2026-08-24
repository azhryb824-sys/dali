#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 3 ]]; then
  echo "usage: run-with-timeout.sh duration kill-after command [args...]" >&2
  exit 64
fi

duration="$1"
kill_after="$2"
shift 2

# GNU coreutils and BusyBox expose different option spellings. GoDaddy's
# preview sandbox currently ships BusyBox, while Sites and common VPS images
# ship GNU coreutils.
if timeout --help 2>&1 | grep -q -- "--signal"; then
  exec timeout --signal=TERM --kill-after="${kill_after}" "${duration}" "$@"
fi

exec timeout -s TERM -k "${kill_after}" "${duration}" "$@"
