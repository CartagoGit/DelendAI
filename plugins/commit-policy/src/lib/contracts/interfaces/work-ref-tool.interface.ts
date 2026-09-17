import type z from 'zod';

import type {
	createWipEngine,
	IResolvedDevelopmentPolicy,
} from '@delendai/core/public';

import type { WORK_REF_INPUT_SCHEMA } from '../constants/work-ref.constant';

export type IWipEngine = NonNullable<
	Awaited<ReturnType<typeof createWipEngine>>
>;

export interface IWorkRefToolOptions {
	readonly namespacePrefix: string;
	readonly policy: IResolvedDevelopmentPolicy | undefined;
	readonly wip: IWipEngine | undefined;
	/** Host-resolved identity; callers cannot select another agent's ref. */
	readonly agentId: string;
	/**
	 * Configured remote. Without one, `origin` is used only if it exists;
	 * the remote is never chosen by ordering.
	 */
	readonly remote?: string | undefined;
}

export interface IRepoSnapshot {
	readonly head: string | undefined;
	readonly branch: string | undefined;
	/** Content hash of the git index; equal hashes mean identical bytes. */
	readonly index: string | null;
}

export interface IBaseEntry {
	readonly mode: string;
	readonly type: string;
}

export interface ICleanPlan {
	readonly path: string;
	readonly entry: IBaseEntry | undefined;
	readonly blob: Uint8Array | undefined;
}

export type IWorkRefInput = z.infer<typeof WORK_REF_INPUT_SCHEMA>;
