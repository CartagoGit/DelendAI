/**
 * primitives.ts — basic structural types that every other
 * `@delendai/contracts` subpath depends on.
 *
 * r00029 (Track C / §10): no Node imports, no
 * `@delendai/core` dependency. Plugins and external consumers
 * can pull from this package without dragging in the core
 * runtime.
 */

export type Brand<T, B extends string> = T & { readonly __brand: B };

/** A non-empty string. */
export type NonEmptyString = Brand<string, 'NonEmptyString'>;

/** A string that has been validated as a relative POSIX path. */
export type PosixRelativePath = Brand<string, 'PosixRelativePath'>;

/** Identifier for a plugin (e.g. `"proposals"`, `"audit"`). */
export type PluginId = Brand<string, 'PluginId'>;

/**
 * The shape every MCP tool's structured content satisfies. The
 * discriminator is `ok: true | false` so consumers can branch
 * without an `instanceof` check.
 */
export type OperationResult<T = unknown> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: IOperationError };

export interface IOperationError {
	readonly reason: string;
	readonly kind?: string;
	readonly nextAction?: string;
	readonly output?: string;
}

/** ISO-8601 timestamp string. */
export type IsoTimestamp = Brand<string, 'IsoTimestamp'>;
