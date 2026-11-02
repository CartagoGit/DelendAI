# Model Catalog

`InMemoryModelCatalog` is a synchronous, process-local catalog of model descriptors. Its entries extend `IProviderCapabilities` with a stable key, aliases, provider, source, lifecycle, and optional declarative limits.

The catalog supports registration, lookup, case-insensitive alias resolution, deterministic listing, metadata search, provider/capability/context/lifecycle filters, bounded result limits, unregister, and clear. Registered entries and returned snapshots are defensive and deeply frozen.

It performs no I/O and deliberately does not implement quotas, health checks, discovery, routing, fallback, or auto-healing. Those concerns remain outside the catalog boundary.# Model Catalog

`@delendai/core` exposes `InMemoryModelCatalog` as a small, process-local
catalog of model descriptors. It reuses `IProviderCapabilities` for the
provider and model capability vocabulary and adds only catalog metadata:
`key`, `aliases`, `provider`, `source`, `lifecycle`, and declarative token
limits.

The catalog is deliberately synchronous and performs no filesystem, network,
credential, quota, health, discovery, routing, or auto-healing work. Those
concerns remain owned by their respective layers.

## Operations

- `register(entry)` rejects duplicate keys, duplicate aliases, aliases that
  collide with an existing entry, and invalid empty identifiers.
- `get(key)` and `resolveAlias(alias)` are case-insensitive. An unknown alias
  returns `undefined`; an ambiguous alias raises `ModelCatalogError`.
- `list(filter)` supports `provider`, required `capabilities`,
  `minContextWindow`, `lifecycle`, and a bounded `limit`.
- `search(query, options)` searches stable catalog metadata and applies the
  same filters.
- `unregister(key)` removes one entry and its aliases; `clear()` resets the
  complete catalog.

Results are defensive, deeply frozen snapshots. Mutating the object supplied
 to `register` after registration cannot change catalog state, and callers
 cannot mutate objects returned by the catalog.

The maximum result limit is `100`; the default is `50`. The limit is only a
result-size bound, not a quota or runtime admission policy.