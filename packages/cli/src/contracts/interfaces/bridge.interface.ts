/**
 * bridge.interface.ts — b00239 S3.
 *
 * Shapes for the workspace-local legacy bridge. The behaviour lives in
 * `lib/bridge/bridge-installer.ts`; only the vocabulary is here.
 *
 * Three of these types intentionally mirror `alias.interface.ts`
 * (`IBridgeState`, `IBridgeAction`, `IBridgeStatus` /
 * `IBridgeOutcome`): the install path is the same shape as the alias
 * install path because both are "claim a name, leave strangers
 * alone" operations, and the union "absent / ours / foreign /
 * unreadable" is a single mental model. Reusing the vocabulary keeps
 * the call sites small and the failure modes discoverable.
 */

import {
	BRIDGE_LEGACY_BINARIES,
	type IBridgeLegacyBinary,
} from '../constants/bridge.constant';

export type { IBridgeLegacyBinary } from '../constants/bridge.constant';

/** What currently occupies a legacy bin name in the workspace bridge directory. */
export type IBridgeState = 'absent' | 'ours' | 'foreign' | 'unreadable';

/** What a provisioning attempt did about a legacy bin name. */
export type IBridgeAction = 'created' | 'unchanged' | 'refused' | 'failed';

export interface IBridgeShimStatus {
	readonly legacyName: IBridgeLegacyBinary;
	readonly paths: readonly string[];
	readonly state: IBridgeState;
	/** Set only when `state` is 'foreign'. */
	readonly occupiedBy?: string | undefined;
}

export interface IBridgeInstallOutcome {
	readonly action: IBridgeAction;
	readonly status: IBridgeShimStatus;
	/** Human-readable, non-fatal explanation. Always set for refused/failed. */
	readonly detail?: string | undefined;
}

/** Status of every legacy name the bridge knows about, in declaration order. */
export interface IBridgeDirectoryStatus {
	readonly bridgeDir: string;
	readonly canonical: string;
	readonly shims: readonly IBridgeShimStatus[];
	readonly readmePresent: boolean;
}

/** What a provisioning attempt did about the workspace's bridge directory as a whole. */
export interface IBridgeDirectoryOutcome {
	readonly action: IBridgeAction;
	readonly status: IBridgeDirectoryStatus;
	/** Per-shim outcomes, in declaration order. */
	readonly perShim: readonly IBridgeInstallOutcome[];
	/** Human-readable, non-fatal explanation. Always set for refused/failed. */
	readonly detail?: string | undefined;
}

/** Environment the installer reads from. Mirrors alias.interface semantics. */
export interface IBridgeEnvironment {
	/** Platform, so Windows gets shims rather than a POSIX single-file. */
	readonly platform: 'win32' | 'posix';
	/** Workspace root the bridge is being installed into. */
	readonly workspaceRoot: string;
	/** Name of the canonical CLI binary to look up on PATH. */
	readonly canonical: string;
}

/**
 * IO surface the installer depends on. Mirrors `IAliasIo` so the
 * command-line path that drives both `alias` and `bridge` shares the
 * same node:fs/promises wrapper.
 */
export interface IBridgeIo {
	readonly read: (path: string) => Promise<string | undefined>;
	readonly write: (path: string, contents: string) => Promise<void>;
	readonly remove: (path: string) => Promise<void>;
	readonly exists: (path: string) => Promise<boolean>;
	readonly join: (...parts: readonly string[]) => string;
	readonly makeExecutable?: (path: string) => Promise<void>;
	/** Optional — only used when a per-name override exists; defaults to `BRIDGE_LEGACY_BINARIES`. */
	readonly legacyNames?: readonly IBridgeLegacyBinary[] | undefined;
}

/** Re-export the const tuple for test fixtures that need the literal list. */
export const ALL_BRIDGE_LEGACY_BINARIES = BRIDGE_LEGACY_BINARIES;
