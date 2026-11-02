import type { IResolvedDevelopmentPolicy } from './development-policy.interface';
import type { IExitCode } from './exit-code.interface';
import type { IWipEngine } from '../../wip-engine/index.interface';

/**
 * What a unit-of-work operation needs from whoever calls it: where it runs
 * and how the caller wants the answer. The CLI's command context and the
 * MCP `work` tool both satisfy it, so one engine serves every host.
 */
export interface IWorkUnitContext {
	readonly cwd: string;
	readonly globals: {
		readonly workspace: string;
		readonly json: boolean;
		readonly format: string;
		readonly remote?: string | undefined;
	};
}

/** What a unit-of-work operation answers. */
export interface IWorkUnitResult {
	readonly code: IExitCode;
	readonly data?: unknown;
	readonly text?: string | undefined;
	readonly error?: string | undefined;
	/** The operation already printed its human-facing answer. */
	readonly suppressDefaultPrint?: boolean | undefined;
}

/** A workspace opened for unit-of-work operations. */
export interface IWorkContext {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly engine: IWipEngine;
}

/** How the MCP `work` tool is built. */
export interface IWorkUnitToolOptions {
	readonly namespacePrefix: string;
	readonly workspaceRoot: string;
	/** This server's session; one is made when none is given. */
	readonly session?: string;
	/**
	 * The resolved policy, so the tool's description states how work lands
	 * in THIS project instead of one profile's mechanism.
	 */
	readonly policy?: IResolvedDevelopmentPolicy;
}
