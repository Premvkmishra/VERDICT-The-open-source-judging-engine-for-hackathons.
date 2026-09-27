## Verdict frontend rules

- All backend calls go through `src/lib/api.ts` against `/api/v1` with `credentials: "include"` — the `verdict_session` cookie is the only auth mechanism, so no token handling exists anywhere else.
- Never invent API endpoints, field names, or enum values: `API-CONTRACT.yaml` and `ENUMS.md` are authoritative. Where the contract describes a response in prose only, read it through the tolerant helpers in `src/lib/unwrap.ts` and degrade gracefully instead of assuming a shape.
- Enum values and their display labels live only in `src/lib/enums.ts`; components import labels rather than hardcoding strings.
- Server-side data reads happen client-side via TanStack Query definitions in `src/lib/queries.ts` (no route loaders), because auth is a browser cookie and SSR has no session.
- Informational judge signals (reactions, tags, final preference, pairwise) must always be rendered on a visually separate surface from scored data, so they are never mistaken for score inputs.
