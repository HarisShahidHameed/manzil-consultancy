# Public API — third-party integrations

Client and appointment (visa case) data access for external systems, authenticated
with a static API key instead of a user login. Meant for server-to-server calls (a
partner's backend calling ours) — it isn't set up for browser-based calls (CORS only
allows the app's own origin).

## Getting a key

1. In the app: **Administration → API Keys → New API Key** (requires the
   `apikeys:write` permission — SUPER_ADMIN and ADMIN have it by default).
2. Pick a name, the scopes it needs (`clients:read`, `clients:write`,
   `appointments:read`), and optionally an expiry date.
3. The raw key is shown **exactly once**, at creation. Copy it immediately and give
   it to the third party over a secure channel — it can't be retrieved again. If it's
   lost, revoke it and create a new one.

Keys are stored hashed (SHA-256), never in plaintext, so a database leak alone
doesn't expose usable keys.

## Authenticating requests

Send the raw key in the `X-API-Key` header on every request:

```
GET /api/public/v1/clients?page=1&limit=20
X-API-Key: mzk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A missing, invalid, revoked, or expired key gets a `401`. A key that's valid but
missing the scope a route requires gets a `403`.

## Endpoints

All under `/api/public/v1`. `GET` list endpoints are paginated the same way as the
internal API (`page`, `limit`, `meta.total` / `meta.totalPages` in the response).

| Method | Path                        | Scope                | Notes |
|--------|-----------------------------|-----------------------|-------|
| GET    | `/clients`                  | `clients:read`        | See filters below — all optional and ANDed together |
| GET    | `/clients/single`           | `clients:read`        | Same filters as `/clients`, but returns **one** client object (not a list) — see below |
| GET    | `/clients/:id`               | `clients:read`        | `:id` is either the client's UUID or its `clientRef` (e.g. `CL-104`) |
| POST   | `/clients`                  | `clients:write`       | Creates a client (+ its first case). See fields below |
| PATCH  | `/clients/:id/status`       | `clients:write`       | Updates the client's processing status. See below |
| GET    | `/appointments`             | `appointments:read`   | `?stage=` filters by case stage (`APPOINTMENT`, `FILE_PROCESSING`, `INVOICED`, `COMPLETED`, `CANCELLED`) |
| GET    | `/appointments/:id`          | `appointments:read`   | `:id` is the case UUID |

### `GET /clients` filters

All optional, all combinable in the same request (e.g.
`?destination=Portugal&nationality=Pakistani`):

| Param | Matches |
|---|---|
| `search` | Name, client ref, or passport number (partial, case-insensitive) |
| `nationality` | Client's nationality (partial, case-insensitive) |
| `passportNumber` | Passport number (partial, case-insensitive) |
| `addressCity` | Client's own address city (partial, case-insensitive) |
| `addressCountry` | Client's own address country (partial, case-insensitive) |
| `phone` | Client's phone number (partial) |
| `email` | Client's email (partial, case-insensitive) |
| `status` | Processing status (exact: `PENDING`, `IN_PROGRESS`, `COMPLETED`) |
| `destination` | Any of the client's cases' destination (partial, case-insensitive) |
| `city` | Any of the client's cases' appointment city (partial, case-insensitive) — note this is the *case's* city, not the client's own `addressCity` |
| `stage` | Any of the client's cases' stage (exact: `APPOINTMENT`, `FILE_PROCESSING`, `INVOICED`, `COMPLETED`, `CANCELLED`) |

### `GET /clients/single`

Same filters as above, but instead of a paginated array it returns exactly **one**
client object under `data` (the most recently created match) — for callers who don't
have our `id`/`clientRef` on hand and just want "the client matching what I know about
them", e.g.:

```
GET /api/public/v1/clients/single?addressCity=London&addressCountry=UK
```

At least one filter is required (a bare call is rejected with `422` — there's no
sensible "the one client matching nothing" answer). No match → `404`. If your filters
could match more than one client, you'll get whichever was created most recently —
narrow with more filters (e.g. add `passportNumber`) if you need a guaranteed-unique
match.

### `PATCH /clients/:id/status`

```json
{ "status": "IN_PROGRESS" }
```

`status` is one of `PENDING` (default on creation), `IN_PROGRESS`, `COMPLETED`. This is
a separate concept from the internal case workflow (`stage`) — it exists so a
third-party integration can mark a client as picked up / done on its end, so repeated
polling of `/clients` doesn't reprocess the same record twice or skip one. `:id` accepts
either the UUID or `clientRef`.

### `POST /clients`

Creates a client and their first visa case in one call. Required: `firstName`,
`lastName`, `gender`, `dob`, `phone`, `passportNumber`, `passportIssue`,
`passportExpiry`, `nationality`, and either `destination` (single, decided) or
`destinationOptions` (array — a shortlist to be finalized later, same as the "Any"
picker in the app). `receivedDate` defaults to today if omitted.

Deliberately excluded from this endpoint (internal-only, not a third party's call to
make): `assignedToId`, `groupId`, `source`, `referredBy`, `hrComments`, `folderUrl`,
and all financial fields (`charges`, `advance`, `discount`, `priority`) — those stay
staff-set inside the app after the client lands there. A duplicate passport number
returns `409`.

Optional fields: `email`, `whatsapp`, `availability`, address fields, `birthCity`,
`maritalStatus`, `previousSchengenVisa`, `registeredEmail`, `eVisa`,
`visaAndTravelHistory`, `city`/`cityOptions`, `visaType`, `ukVisaExpiry`, `eVisaType`.

### What's excluded

The public shape is deliberately narrower than what's shown inside the app:

- No financial data — advance/charges/discount, doc costs, client-paid amounts, or
  invoices.
- No internal staff notes — `hrComments`, `salamComments`, `appointmentNotes`.
- No internal booking references — `fraNo`, `tlsAccount`.
- No assigned-staff identities (who booked/is working the case).

If a third party needs one of these, it's a deliberate scope decision to make, not an
oversight — extend `PUBLIC_CLIENT_SELECT` / `PUBLIC_CASE_SELECT` in
`backend/src/services/publicApi.service.ts`.

## Rate limits

300 requests per 15 minutes, per API key (not per IP — a partner's backend fronting
many end users from one IP isn't penalized as a single caller).

## Auditing

Every request is logged to the audit log (`action: API_KEY_ACCESS`) with the API
key's id/name instead of a user id, so usage is traceable the same way internal user
actions are.

## Revoking access

**Administration → API Keys → Revoke** disables the key immediately — the same key
value can never authenticate again (unlike a user password, there's no "resume with
the same secret" recovery path). Use **Delete** only to remove the record entirely;
prefer Revoke if you might want the history/audit trail later.
