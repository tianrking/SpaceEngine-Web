# Performance verification

Astral Surveyor treats performance claims as testable release criteria. This
document records what is measured today, how to reproduce it, and what the
results do not prove.

## Catalogue scale gate

Run the isolated benchmark with:

```bash
npm ci
npm run catalog:benchmark
```

The test creates exactly **100,000 deterministic synthetic summaries** in
memory. Every fixture ID starts with `synthetic-scale-`; none of these entities
is written to a release asset, counted as an observation, or shown in the
product. The checked-in observed release remains the separately sourced NASA
Exoplanet Archive snapshot of 6,336 planets across 4,749 hosts.

The benchmark calls the same `prepareProgressiveIndex` and
`queryProgressiveIndex` functions used inside the production Dedicated Worker.
After seven warm-up queries it records 31 samples for each path and uses the
nearest-rank 95th percentile. `npm run check` executes this file in a separate
single-Worker Vitest stage so unrelated parallel unit files cannot consume its
CPU time; the sample count and 50 ms limit are not relaxed on CI.

| Gate | Current limit | Failure meaning |
| --- | ---: | --- |
| Warm exact ID/name/host search | p95 < 50 ms | Interactive identity lookup no longer meets the roadmap budget |
| Warm mixed text/filter/order scan | p95 < 50 ms | Common exploratory queries no longer meet the interaction budget |
| Auxiliary search index | < 24 MiB | Normalized search structures alone exceed the mobile catalogue allowance |

The auxiliary index stores normalized searchable text in one UTF-8 byte buffer,
record boundaries in a `Uint32Array`, and distance/discovery orders in two more
`Uint32Array` instances. Source summary tuples are referenced rather than
copied. A 256-entry Boyer–Moore–Horspool skip table is built once per query.
This avoids one normalized JavaScript string and three object arrays per record
while preserving Unicode-normalized substring search semantics.

## Reference run

One local Windows x64 / Node.js 24.14 reference run after the packed-index
change reported:

| Measurement | Result |
| --- | ---: |
| Fixture | 100,000 synthetic summaries |
| Index preparation | 329.6 ms |
| Auxiliary index | 11.0 MiB |
| Observed heap delta | 19.4 MiB |
| Exact ID/name/host search | 8.90 ms p95 |
| Mixed text/filter/order scan | 9.17 ms p95 |
| Budget | 50 ms p95 |

These values are a reproducible engineering reference, not a universal browser
guarantee. CI enforces the limits on its own runner and prints its environment
and fresh measurements. Preparation and heap numbers are reported but not used
as cross-machine pass/fail gates; heap sampling is affected by garbage
collection timing.

## Production release checks

`npm run check` also validates the real NASA release, including:

- all manifest, search-index, host-atlas, and detail-chunk byte sizes and
  SHA-256 hashes;
- 6,336 unique planet summaries, 4,749 exact host names, ICRS coordinate ranges,
  null preservation, composite-field conflicts, and representative records;
- full real-index search/filter/sort behavior and a separate 50 ms p95 gate;
- IndexedDB atomic-pack behavior and generated production bundle integrity.

Manual browser verification currently covers initial request boundaries,
Worker-only catalogue decoding, 20-result rendering, atlas lazy loading, mobile
overflow, WebGPU/WebGL2 status, complete-pack installation, and true offline
search/detail recovery.

## Explicit non-claims

The current gates do not establish:

- 100,000 reviewed real astronomical summaries;
- mobile-browser decode/index p95 or total catalogue heap;
- frame-time, GPU memory, terrain, atmospheric-scattering, or fly-to budgets;
- cross-browser automated end-to-end coverage;
- network latency under a controlled 10 Mbps / 80 ms profile.

Those remain separate acceptance items in
[the catalogue expansion roadmap](CATALOG_EXPANSION.md). A future Gaia/SIMBAD
release may only replace the synthetic scale fixture as scientific evidence
after cross-match review, provenance/rights review, reproducible generation,
and the same integrity gates.
