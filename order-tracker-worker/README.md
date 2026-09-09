# A-DIY Order Tracker Worker

A single Cloudflare Worker behind the `/pages/tracking` page. It exists because the Shopify Admin
API authenticates with a secret token — that token cannot live in theme JavaScript, where it is
readable in view-source.

```
GET /track?order=212481808
```

> **Repo note.** This folder is a deployable service living inside a Shopify-synced theme repo.
> It is deliberately **not** merged into `development` — when front-end work merges, drop
> `order-tracker-worker/` from that merge so the theme branch stays a theme. Shopify's GitHub
> sync only touches the seven theme directories, so it never overwrites this folder on branches
> that do carry it.

## What it does

Merges two upstreams:

1. **Shopify Admin GraphQL** — order number, date, fulfillment status, tags, tracking number.
2. **EFW (`efwtrack.com`)** — the real delivery ladder.

The second one matters. Shopify holds **no delivery data** for these shipments: EFW is registered
as carrier `"Other"` with a manual tracking URL, so Shopify never receives carrier scans. Every
shipped order reads `FULFILLED` with zero fulfillment events, `deliveredAt: null`. EFW's own API
carries the real progression:

| `maxArrow` | Event |
|---|---|
| 0 | Shipment Created |
| 1 | Picked Up |
| 2 | Arrived at Origin City |
| 3 | In Transit |
| 4 | Arrived at Destination City |
| 5 | Out For Delivery |
| 6 | Delivered (`PODName` populated) |

## Setup

### 1. App credentials

Auth uses the **client credentials grant**. Shopify closed the legacy admin-created custom app
route (the `shpat_` token) on 2026-01-01, and this grant is what it points server-side
integrations acting on their own stores at instead. It needs no OAuth redirect: the Worker
exchanges the app's client ID and secret for a 24-hour token and refreshes it on its own.

It reuses the **Order Tracker** app (`order-tracker-2`) that already exists in the A-DIY Dev
Dashboard — already installed, already carrying `read_all_orders`. Nothing new to create.

Credentials live at Dev Dashboard → Order Tracker → **App settings** → Credentials.
The Client ID is already in `wrangler.toml`; only the Secret needs setting.

### 2. Configure and deploy

```bash
cd order-tracker-worker
npx wrangler login
npx wrangler secret put SHOPIFY_CLIENT_SECRET   # paste the Secret from App settings
npx wrangler deploy
```

The secret is never written to disk. If it is ever rotated in the Dev Dashboard, re-run the
`secret put` command — no code change.

### 3. Local development

`wrangler secret put` sets the secret on the **deployed** Worker only. Local dev reads secrets
from a `.dev.vars` file, so without one every request fails at the token grant.

```bash
cd order-tracker-worker
cp .dev.vars.example .dev.vars
# paste the real Secret into .dev.vars, then:
npx wrangler dev
```

`.dev.vars` is gitignored — never commit it. Everything non-secret comes from `wrangler.toml`,
so that one line is the only local setup.

Then in a second terminal:

```bash
curl "http://localhost:8787/track?order=212481808" | python3 -m json.tool
./test.sh                                              # full suite, local
./test.sh https://adiy-order-tracker.a-diy.workers.dev # full suite, deployed
```

`wrangler dev` runs the Worker locally but makes **real** calls out to Shopify and EFW, so
results match production. Both are read-only, so there is nothing to break by re-running.

Reload is automatic on save. Press `x` to quit, `d` to open devtools.

## Response

```json
{
  "success": true,
  "order": {
    "number": "212481808",
    "date": "2026-08-21T19:31:32Z",
    "fulfillmentStatus": "FULFILLED",
    "financialStatus": "PAID",
    "cancelled": false,
    "tags": ["Ali"]
  },
  "customer": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+15551234567",
    "shippingAddress": {
      "name": "Jane Smith",
      "address1": "12 Example Rd",
      "address2": null,
      "city": "Toms River",
      "province": "NJ",
      "zip": "08753",
      "country": "US",
      "phone": "+15551234567"
    }
  },
  "shipment": {
    "carrier": "EFW",
    "trackingNumber": "8947328",
    "trackingUrl": "https://efwtrack.com/track/8947328",
    "serviceLevel": "Home Now - First",
    "pieces": 1,
    "freight": [{ "description": "STP41CG Railings 1 of 1", "pieces": 1, "weight": "465.00" }]
  },
  "delivery": {
    "available": true,
    "status": "Delivered",
    "step": 6,
    "totalSteps": 6,
    "delivered": true,
    "deliveredAt": "2026-09-02T12:30:00Z",
    "signedBy": "Megan Alicea",
    "events": [{ "code": "WEB", "description": "Shipment Created", "at": "2026-08-27T21:41:00Z" }]
  }
}
```

Other shapes:

| Situation | Response |
|---|---|
| Not shipped yet | `"shipment": null, "delivery": null` |
| EFW unreachable | `"delivery": { "available": false }` — order data still returned |
| No such order | `{ "success": false, "error": "not_found" }` |

**Misses answer HTTP 200.** Non-200 is reserved for genuine faults, so the front end can tell
"order not found" from "backend unreachable". The bug this replaces was invisible precisely
because those two were indistinguishable.

## Behaviour worth knowing

- **Exact-match guard.** `orders(query: "name:…")` is a *search*, not a lookup — a partial number
  can match a real order. The Worker asserts an exact name match before returning anything. The
  same trap makes `tracking_number:` unusable: it silently ignores the filter and returns
  unrelated orders.
- **Tracking numbers are not unique per order.** Consolidated shipments share one (orders
  `212481782` and `212481781` both use `8924975`), so the EFW cache is keyed on the tracking
  number only, never treated as an order identity.
- **Fulfillments without tracking exist** (`212481805`, `212481792`) — those skip the EFW call.
- **EFW is undocumented and unauthenticated.** It can change or start requiring `ConZip` without
  notice. Any failure degrades to `delivery.available: false` rather than failing the request.

## ⚠️ Data exposure — gate this before public use

The endpoint is public, unauthenticated, and keyed by a **sequential** order number. The CORS
allow-list constrains browsers, not `curl`. Anyone who walks `212481800…212481850` can currently
read, for every order:

- **customer name, shipping address, email and phone** (`customer`)
- internal rep names in `tags` (`Ali`, `ian`, `JV`, `louie`, `Consio`)
- freight contents, and the name of whoever signed for delivery

The `customer` block was added deliberately for dev-site testing, with the gate deferred. It
makes the customer list harvestable, which is a different order of risk from a stage number —
so it should not front a public page in this state.

**The fix is small.** Accept an `email` query param, compare it to the order's email, and return
`customer` only on a match — the same shape as Shopify's own guest order lookup. Everything
needed is already in `buildCustomer()`; it just needs a caller-supplied value to check against.
EFW's `ConZip` parameter offers the same gate keyed on ZIP if that suits the form better.

Filtering `tags` is a one-line change in `buildResponse`.
