/**
 * Contract shapes for `./startup-state-ports`.
 *
 * Split out of the implementation module so the repo's "types and
 * constants live in contracts" convention holds: `startup-state-ports.ts` keeps
 * the behaviour, this file keeps the shapes. Re-exported from
 * `startup-state-ports.ts`, so no import site changes.
 */

import type { IStartupStatePorts } from '@delendai/core/public';

/** What `openStartupStatePorts` may answer. Mirrors the core seam. */
export type IOpenStatePortsResult =
	| { readonly kind: 'opened'; readonly ports: IStartupStatePorts }
	| { readonly kind: 'absent' }
	| { readonly kind: 'unreadable'; readonly reason: string };

export interface IOpenStatePortsOptions {
	readonly databasePath: string;
	/** False for a diagnose-only run: never create, never migrate. */
	readonly allowCreate: boolean;
}
