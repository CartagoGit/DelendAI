/**
 * completion.interface.ts — f00037 contract surface for
 * `lib/completion/completion.service.ts`.
 *
 * The shell-completion module is a pure string builder (no IO, no
 * state). Its two exported types — the `Shell` discriminator and the
 * `ICompletionModel` projection — live here so consumers
 * (`groups/doctor.spec.ts`, etc.) import a stable surface and so the
 * service file itself stays implementation-only.
 *
 * SOLID: single responsibility (just type contracts), interface
 * segregation (callers depend on this shape, not on the helpers).
 */

export type Shell = 'bash' | 'zsh' | 'fish';

export interface ICompletionModel {
	/** Single-word commands (e.g. `status`, `overview`, `web-fetch`). */
	readonly leaves: readonly string[];
	/** group → its verbs (e.g. `git` → [`status`, `changed`, ...]). */
	readonly groups: ReadonlyMap<string, readonly string[]>;
	/** All first words (groups + single-word commands), sorted unique. */
	readonly firstWords: readonly string[];
}