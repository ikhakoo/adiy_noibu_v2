/**
 * A-DIY Order Tracker
 *
 * GET /track?order=212481808
 *
 * Auth uses the client credentials grant: the Worker exchanges the app's client ID + secret
 * for a 24h access token. Legacy admin-created custom apps (the shpat_ route) can no longer be
 * created as of 2026-01-01, and this grant is what Shopify points server-side integrations
 * acting on their own stores at instead.
 *
 * Merges two upstreams into one response:
 *   1. Shopify Admin GraphQL - order number, date, fulfillment status, tags, tracking number.
 *   2. EFW (efwtrack.com)    - the real delivery ladder. Shopify has no delivery data for these
 *                              shipments: EFW is registered as carrier "Other" with a manual
 *                              URL, so Shopify never receives carrier scans. Every shipped order
 *                              reads FULFILLED with zero fulfillment events.
 *
 * Always answers HTTP 200 with a JSON body for both hits and misses. Non-200 is reserved for
 * genuine faults, so the front end can tell "order not found" from "backend unreachable" - the
 * exact distinction whose absence hid the original bug on the tracking page.
 */

const EFW_ENDPOINT = 'https://efwtrack.com/api/ShipmentTracking/get_shipment_tracking';
const EFW_TIMEOUT_MS = 6000;
const SHOPIFY_TIMEOUT_MS = 8000;
const TOKEN_REFRESH_MARGIN_MS = 300_000;
const EFW_CACHE_SECONDS = 300;

/**
 * The delivery ladder observed across live EFW shipments, where `maxArrow` matches the index of
 * the latest event. Used only to report totalSteps; event descriptions are always passed through
 * verbatim, so an unrecognised one is surfaced rather than dropped.
 */
const EFW_LADDER = [
  'Shipment Created',
  'Picked Up',
  'Arrived at Origin City',
  'In Transit',
  'Arrived at Destination City',
  'Out For Delivery',
  'Delivered',
];

const ORDER_QUERY = `
  query TrackOrder($q: String!) {
    orders(first: 5, query: $q) {
      edges {
        node {
          name
          createdAt
          tags
          displayFulfillmentStatus
          displayFinancialStatus
          cancelledAt
          fulfillments(first: 10) {
            status
            createdAt
            trackingInfo { company number url }
          }
        }
      }
    }
  }
`;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return json({ success: false, error: 'method_not_allowed' }, 405, cors);
    }

    const url = new URL(request.url);
    if (url.pathname !== '/track') {
      return json({ success: false, error: 'not_found' }, 404, cors);
    }

    const orderNumber = sanitizeOrderNumber(url.searchParams.get('order'));
    if (!orderNumber) {
      return json({ success: false, error: 'invalid_order_number' }, 200, cors);
    }

    try {
      const order = await lookupOrder(orderNumber, env);
      if (!order) {
        return json({ success: false, error: 'not_found' }, 200, cors);
      }

      const shipment = pickShipment(order);
      const delivery = shipment
        ? await lookupDelivery(shipment.trackingNumber, ctx)
        : null;

      return json(buildResponse(order, shipment, delivery), 200, cors);
    } catch (err) {
      // Never leak upstream detail (it can carry the Shopify token in a request echo).
      console.error('track failed', err && err.message);
      return json({ success: false, error: 'upstream_error' }, 502, cors);
    }
  },
};

/* ------------------------------------------------------------------ input */

/**
 * Order names are 9 digits, but stay permissive about shape and strict about characters: this is
 * interpolated into a Shopify search string, so anything outside [A-Za-z0-9-] must not survive.
 */
function sanitizeOrderNumber(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/#/g, '').replace(/[^A-Za-z0-9-]/g, '');
  if (!cleaned || cleaned.length > 32) return null;
  return cleaned;
}

/* ------------------------------------------------------------------- auth */

/**
 * Held per isolate rather than in caches.default, so the token is never written to any cache
 * storage. Each isolate does its own grant at most once a day, which is cheap.
 */
let tokenCache = { value: null, expiresAt: 0 };

async function getAccessToken(env) {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) {
    return tokenCache.value;
  }

  const response = await fetch(`https://${env.SHOP_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.SHOPIFY_CLIENT_ID,
      client_secret: env.SHOPIFY_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Body can echo the credentials back - never surface it.
    throw new Error(`token grant http ${response.status}`);
  }

  const body = await response.json();
  if (!body.access_token) {
    throw new Error('token grant returned no access_token');
  }

  const lifetimeMs = (Number(body.expires_in) || 86399) * 1000;
  tokenCache = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60_000, lifetimeMs - TOKEN_REFRESH_MARGIN_MS),
  };
  return tokenCache.value;
}

/* ---------------------------------------------------------------- shopify */

async function lookupOrder(orderNumber, env) {
  const endpoint = `https://${env.SHOP_DOMAIN}/admin/api/${env.API_VERSION}/graphql.json`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': await getAccessToken(env),
    },
    body: JSON.stringify({
      query: ORDER_QUERY,
      variables: { q: `name:${orderNumber}` },
    }),
    signal: AbortSignal.timeout(SHOPIFY_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`shopify http ${response.status}`);
  }

  const body = await response.json();
  if (body.errors) {
    throw new Error(`shopify graphql: ${body.errors.map((e) => e.message).join('; ')}`);
  }

  const nodes = (body.data?.orders?.edges ?? []).map((edge) => edge.node);

  // `orders(query: "name:...")` is a SEARCH, not an exact lookup - a partial number can match a
  // real order. Require an exact name match, the same trap that makes `tracking_number:` unusable
  // (it silently ignores the filter and returns unrelated orders).
  return nodes.find((node) => normalizeName(node.name) === normalizeName(orderNumber)) ?? null;
}

function normalizeName(value) {
  return String(value ?? '').replace(/^#/, '').trim().toLowerCase();
}

/**
 * An order can carry several fulfillments (one live order has two), and a fulfillment can carry
 * no tracking info at all (two live orders do). Take the first that actually has a number.
 */
function pickShipment(order) {
  for (const fulfillment of order.fulfillments ?? []) {
    for (const info of fulfillment.trackingInfo ?? []) {
      if (info?.number) {
        return {
          trackingNumber: info.number,
          trackingUrl: info.url ?? null,
          company: info.company ?? null,
          fulfilledAt: fulfillment.createdAt ?? null,
        };
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------------- efw */

async function lookupDelivery(trackingNumber, ctx) {
  // Cache on the tracking number: this is an undocumented third-party endpoint and shouldn't be
  // hammered. Never treat the key as unique to an order - consolidated shipments share a number.
  const cacheKey = new Request(
    `https://efw-cache.internal/track/${encodeURIComponent(trackingNumber)}`,
    { method: 'GET' }
  );
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return mapDelivery(await cached.json());
  }

  let payload;
  try {
    const response = await fetch(EFW_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Origin: 'https://efwtrack.com',
        Referer: `https://efwtrack.com/track/${trackingNumber}`,
      },
      // ConZip is optional today. If EFW ever starts requiring it, the response carries
      // metadata.needed === "zip" and mapDelivery reports unavailable rather than throwing.
      body: `TrackNo=${encodeURIComponent(trackingNumber)}&ConZip=`,
      signal: AbortSignal.timeout(EFW_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`efw http ${response.status}`);
    payload = await response.json();
  } catch (err) {
    // Degrade: the order data is still worth returning without delivery detail.
    console.error('efw lookup failed', trackingNumber, err && err.message);
    return { available: false };
  }

  ctx.waitUntil(
    cache.put(
      cacheKey,
      new Response(JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${EFW_CACHE_SECONDS}`,
        },
      })
    )
  );

  return mapDelivery(payload);
}

function mapDelivery(payload) {
  const shipment = payload?.payload?.[0];
  // A miss returns metadata.messages only, with no payload key at all.
  if (!shipment) return { available: false };

  const events = (shipment.events ?? []).map((event) => ({
    code: event.code ?? null,
    description: event.description ?? null,
    at: efwDateToIso(event.datetimeGMT),
  }));

  const step = Number.parseInt(shipment.maxArrow, 10);
  const podName = trimOrNull(shipment.PODName);
  const podDate = efwDateToIso(shipment.PODDate);
  const latest = events.length ? events[events.length - 1] : null;

  return {
    available: true,
    status: latest?.description ?? null,
    step: Number.isFinite(step) ? step : null,
    totalSteps: EFW_LADDER.length - 1,
    delivered: Boolean(podName || podDate),
    deliveredAt: podDate,
    signedBy: podName,
    events,
    _shipment: shipment,
  };
}

/* ----------------------------------------------------------------- output */

function buildResponse(order, shipment, delivery) {
  const efw = delivery?._shipment;

  return {
    success: true,
    order: {
      number: order.name,
      date: order.createdAt,
      fulfillmentStatus: order.displayFulfillmentStatus,
      financialStatus: order.displayFinancialStatus,
      cancelled: Boolean(order.cancelledAt),
      cancelledAt: order.cancelledAt ?? null,
      tags: order.tags ?? [],
    },
    shipment: shipment
      ? {
          carrier: 'EFW',
          trackingNumber: shipment.trackingNumber,
          trackingUrl: shipment.trackingUrl,
          fulfilledAt: shipment.fulfilledAt,
          serviceLevel: trimOrNull(efw?.servicelevel),
          serviceLevelText: trimOrNull(efw?.serviceleveltext),
          shipmentDate: efwDateToIso(efw?.shipmentdate),
          scheduledDelivery: {
            from: efwDateToIso(efw?.scheduledDelivery?.fromGMT),
            to: efwDateToIso(efw?.scheduledDelivery?.toGMT),
            type: trimOrNull(efw?.scheduledDelivery?.scheduledDeliveryType),
            active: Boolean(efw?.scheduledDELactive),
          },
          pieces: sumPieces(efw?.freight),
          freight: (efw?.freight ?? []).map((item) => ({
            description: trimOrNull(item.description),
            pieces: Number.parseInt(item.pieces, 10) || null,
            weight: trimOrNull(item.weight),
          })),
        }
      : null,
    delivery: delivery ? stripInternal(delivery) : null,
  };
}

function stripInternal(delivery) {
  const { _shipment, ...rest } = delivery;
  return rest;
}

function sumPieces(freight) {
  if (!Array.isArray(freight) || !freight.length) return null;
  const total = freight.reduce((sum, item) => sum + (Number.parseInt(item.pieces, 10) || 0), 0);
  return total || null;
}

/* ------------------------------------------------------------------ utils */

/** EFW returns GMT strings shaped "09/04/26 12:00" (MM/DD/YY HH:MM). */
function efwDateToIso(value) {
  const match = String(value ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, month, day, year, hour, minute] = match.map(Number);
  const date = new Date(Date.UTC(2000 + year, month - 1, day, hour, minute));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function trimOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function corsHeaders(origin, env) {
  const headers = {
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };

  const allowed = String(env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Accept, Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }

  return headers;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
