#!/usr/bin/env bash
# Verification suite. Defaults to local dev; pass a base URL to hit the deployed Worker:
#   ./test.sh
#   ./test.sh https://adiy-order-tracker.a-diy.workers.dev
set -uo pipefail
U="${1:-http://localhost:8787}"

echo "Testing $U"
for o in 212481808 212481807 212481816 212481805 212481779 212481844 212481848 999999999 212481; do
  printf '%-11s ' "$o"
  curl -s --max-time 30 "$U/track?order=$o" | python3 -c "
import sys,json
raw=sys.stdin.read()
try: d=json.loads(raw)
except Exception: print('NON-JSON:', raw[:100]); raise SystemExit
if not d.get('success'): print('success=false  error=%s' % d.get('error')); raise SystemExit
o=d['order']; s=d.get('shipment'); dv=d.get('delivery')
print('%-12s tags=%-12s ship=%-8s %s' % (
  o['fulfillmentStatus'], ','.join(o['tags']) or '-', (s or {}).get('trackingNumber','none'),
  'delivery=null' if not dv else ('step=%s/%s %s%s' % (dv.get('step'),dv.get('totalSteps'),dv.get('status'),
    ' signed='+dv['signedBy'] if dv.get('signedBy') else '')) if dv.get('available') else 'delivery UNAVAILABLE'))
"
done

echo
printf 'CORS allowed   : '; curl -s -o /dev/null -D - -H "Origin: https://a-diy.com" "$U/track?order=212481848" | grep -i "^access-control-allow-origin" || echo "(none)"
printf 'CORS rejected  : '; curl -s -o /dev/null -D - -H "Origin: https://evil.example" "$U/track?order=212481848" | grep -i "^access-control-allow-origin" || echo "(none - correct)"
printf 'not_found HTTP : '; curl -s -o /dev/null -w '%{http_code} (want 200)\n' "$U/track?order=999999999"
