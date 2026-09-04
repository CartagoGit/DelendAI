/**
 * protocol-vocabulary.interface.ts — r00041 S4.
 *
 * Two string unions that are part of the wire vocabulary a client and a
 * delendai server share: what side effects a tool declares, and where a
 * loaded plugin came from.
 *
 * ## Why they are declared here and not imported from the core
 *
 * `@delendai/core` is an OPTIONAL peer of this package. A consumer who
 * installs `@delendai/client` to talk to a server — the whole point of
 * a client — has no reason to install the server too. As long as these
 * two types were imported from `@delendai/core/contracts`, that
 * consumer's TypeScript could not resolve them: the import is erased at
 * runtime, so the JavaScript worked, but the types did not, and "works
 * at runtime, fails to typecheck" is a worse outcome than either.
 *
 * ## Why duplicating them is safe here, and only here
 *
 * Duplicated vocabulary drifts silently — that is the usual and correct
 * objection. It cannot drift silently here:
 * `protocol-vocabulary-matches-core.spec.ts` asserts, in both
 * directions, that each union is mutually assignable with the core's,
 * against the real `@delendai/core` this monorepo keeps as a
 * devDependency. If someone adds a fourth `PluginOrigin` to the core,
 * that spec goes red in this repository, where the change is being made
 * — not later, in a consumer's build.
 *
 * That trade is only worth making for tiny, stable, closed unions like
 * these. Anything with structure belongs behind the peer import.
 */

/** What a tool declares it may do. Mirrors the core's `IToolEffect`. */
export type IToolEffect = 'write' | 'spawn' | 'network' | 'destructive';

/** Where a loaded plugin came from. Mirrors the core's `PluginOrigin`. */
export type PluginOrigin = 'bundled' | 'user-local' | 'external';
