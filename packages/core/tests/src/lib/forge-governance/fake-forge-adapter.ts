/**
 * fake-forge-adapter.ts — an in-memory `IForgeProviderAdapter` so the
 * governance specs exercise the real broker without a network.
 *
 * It exists because the behaviours worth testing here are precisely the
 * ones a live forge will not reproduce on demand: a property that cannot
 * be read, a write that is accepted and then reads back differently, and
 * an error string that carries something token-shaped. The fake makes all
 * three trivial to stage, and its `SENTINEL_TOKEN` is the tripwire the
 * credential specs assert never reaches a result object.
 */

import {
	BRANCH_PROPERTIES,
	branchPropertyId,
	type IDesiredBranchRule,
	type IDesiredForgeState,
	type IDesiredRepositorySettings,
	type IForgeProviderAdapter,
	type ILiveForgeState,
	liveValue,
	type LiveValue,
	REPOSITORY_PROPERTIES,
	repositoryPropertyId,
} from '@delendai/core/lib/forge-governance/index';

/**
 * A token-shaped string no result may ever contain. Deliberately matches
 * the `ghp_…` shape so the redactor is genuinely exercised.
 */
export const SENTINEL_TOKEN = 'ghp_S3nt1nelTokenMustNeverAppear0123456';

/** Live properties that exactly satisfy a desired state. */
export const liveStateFromDesired = (
	desired: IDesiredForgeState,
): Record<string, LiveValue> => {
	const properties: Record<string, LiveValue> = {};
	for (const property of REPOSITORY_PROPERTIES) {
		properties[repositoryPropertyId(property)] = liveValue(
			desired.repository[property],
		);
	}
	for (const rule of desired.branches) {
		for (const property of BRANCH_PROPERTIES) {
			properties[branchPropertyId(rule.branch, property)] = liveValue(
				rule[property],
			);
		}
	}
	return properties;
};

/** How the fake forge "normalises" a write before storing it. */
export interface IFakeDistortion {
	readonly branchRule?: (rule: IDesiredBranchRule) => IDesiredBranchRule;
	readonly repository?: (
		settings: IDesiredRepositorySettings,
	) => IDesiredRepositorySettings;
}

export interface IFakeAdapterOptions {
	readonly properties: Record<string, LiveValue>;
	readonly mutationsEnabled?: boolean;
	/** When set, every write fails with this (deliberately leaky) reason. */
	readonly writeFailureReason?: string;
	readonly distort?: IFakeDistortion;
}

/** A recorded write, so specs can assert what the broker attempted. */
export interface IFakeWrite {
	readonly kind: 'branch' | 'repository';
	readonly branch?: string;
}

export interface IFakeForgeAdapter extends IForgeProviderAdapter {
	readonly writes: readonly IFakeWrite[];
	readonly reads: number;
}

/** Build the fake. Never performs I/O of any kind. */
export const createFakeForgeAdapter = (
	options: IFakeAdapterOptions,
): IFakeForgeAdapter => {
	const properties: Record<string, LiveValue> = { ...options.properties };
	const writes: IFakeWrite[] = [];
	let reads = 0;

	const storeBranch = (rule: IDesiredBranchRule): void => {
		const stored = options.distort?.branchRule?.(rule) ?? rule;
		for (const property of BRANCH_PROPERTIES) {
			properties[branchPropertyId(rule.branch, property)] = liveValue(
				stored[property],
			);
		}
	};

	const storeRepository = (settings: IDesiredRepositorySettings): void => {
		const stored = options.distort?.repository?.(settings) ?? settings;
		for (const property of REPOSITORY_PROPERTIES) {
			properties[repositoryPropertyId(property)] = liveValue(
				stored[property],
			);
		}
	};

	const adapter: IFakeForgeAdapter = {
		provider: 'github',
		mutationsEnabled: options.mutationsEnabled ?? true,
		get writes() {
			return writes;
		},
		get reads() {
			return reads;
		},
		readLiveState: async (): Promise<ILiveForgeState> => {
			reads += 1;
			return { provider: 'github', properties: { ...properties } };
		},
		applyBranchRule: async (request) => {
			writes.push({ kind: 'branch', branch: request.rule.branch });
			if (options.writeFailureReason !== undefined) {
				return { ok: false, reason: options.writeFailureReason };
			}
			storeBranch(request.rule);
			return { ok: true, reason: '' };
		},
		applyRepositorySettings: async (request) => {
			writes.push({ kind: 'repository' });
			if (options.writeFailureReason !== undefined) {
				return { ok: false, reason: options.writeFailureReason };
			}
			storeRepository(request.settings);
			return { ok: true, reason: '' };
		},
	};
	return adapter;
};
