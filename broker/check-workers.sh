#!/usr/bin/env bash
# Show connected bridge workers grouped by host — confirms which sites are live.
#   BRIDGE_TOKEN=BRIDGE ./check-workers.sh [base-url]
set -euo pipefail
BASE="${1:-https://dw.ramsden-international.com/bridge}"
TOKEN="${BRIDGE_TOKEN:-BRIDGE}"

curl -sk "$BASE/workers" -H "Authorization: Bearer $TOKEN" | python3 -c '
import sys, json, collections
workers = json.load(sys.stdin).get("workers", [])
by_host = collections.Counter(w["host"] for w in workers)
if not workers:
    print("no workers connected")
else:
    print("%d worker(s) across %d site(s):" % (len(workers), len(by_host)))
    for host, n in sorted(by_host.items()):
        print("  %s: %d" % (host, n))
        for w in workers:
            if w["host"] == host:
                print("    - %s  (%s)  %r" % (w["path"], w["ip"], w["title"]))
'
