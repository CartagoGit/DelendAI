/**
 * blueprint-writer.spec.ts
 *
 * r00003 S1 (F-002, S + D): the prepareServerBlueprintOnStart hook used
 * to do `existsSync → mkdir → writeFile` directly, with no mutex and no
 * atomic write. Two concurrent first-starts could both observe the
 * blueprint missing and write conflicting bytes; readers during the
 * gap could observe a torn file. The new `IBlueprintWriter` abstraction
 * routes through `withFileMutex` + `writeFileAtomic` with a
 * double-check pattern, so the operation is idempotent and
 * concurrency-safe.
 */
export {};
