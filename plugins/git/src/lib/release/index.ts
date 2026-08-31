import {
	assertExpectedReleaseState,
	assertReleaseMetadata,
	releaseBranch,
	releaseStatusCompact,
	evaluateReleaseReadiness,
	ReleaseStateError,
	nextVersion,
	type IExpectedReleaseState,
	type IReleaseCandidateMetadata,
	type IReleaseGate,
	type IReleasePrepareInput,
	type IReleasePreparation,
	type IReleaseReadiness,
	type IReleaseStatusCompact,
	type ReleasePrepareMode,
} from '@mcp-vertex/core/public';

import type { IGitRunner } from '../services/git';

export interface IReleaseCandidateStore {
	getBySlug(slug: string): IReleaseCandidateMetadata | undefined;
	getByIdempotencyKey(key: string): IReleaseCandidateMetadata | undefined;
	list(): readonly IReleaseCandidateMetadata[];
	put(key: string, metadata: IReleaseCandidateMetadata): void;
	reserve(
		key: string,
		metadata: IReleaseCandidateMetadata,
	): IReleaseCandidateMetadata;
}

export const createReleaseCandidateStore = (): IReleaseCandidateStore => {
	const byKey = new Map<string, IReleaseCandidateMetadata>();
	return {
		getBySlug: (slug) =>
			[...byKey.values()]
				.reverse()
				.find((candidate) => candidate.slug === slug),
		getByIdempotencyKey: (key) => byKey.get(key),
		list: () => Object.freeze([...byKey.values()]),
		put: (key, metadata) => byKey.set(key, metadata),
		reserve: (key, metadata) => {
			const existingByKey = byKey.get(key);
			if (existingByKey !== undefined) return existingByKey;
			const existingBySlug = [...byKey.values()]
				.reverse()
				.find(
					(candidate) =>
						candidate.slug === metadata.slug &&
						candidate.state !== 'aborted',
				);
			if (existingBySlug !== undefined)
				throw new ReleaseStateError(
					'duplicate-release',
					`release slug ${metadata.slug} is already prepared`,
				);
			const collision = [...byKey.values()].find(
				(candidate) =>
					candidate.state !== 'aborted' &&
					candidate.targetVersion === metadata.targetVersion,
			);
			if (collision !== undefined)
				throw new ReleaseStateError(
					'release-collision',
					`release target ${metadata.targetVersion} is already reserved`,
					{
						details: {
							existingSlug: collision.slug,
							existingType: collision.type,
							targetVersion: metadata.targetVersion,
						},
					},
				);
			byKey.set(key, metadata);
			return metadata;
		},
	};
};

const resolveRef = async (run: IGitRunner, ref: string): Promise<string> => {
	const result = await run(['rev-parse', ref]);
	if (!result.ok || result.output.trim() === '')
		throw new Error(result.reason ?? `could not resolve git ref "${ref}"`);
	return result.output.trim();
};

const readMainVersion = async (
	run: IGitRunner,
	mainSha: string,
): Promise<string> => {
	const result = await run(['show', `${mainSha}:packages/core/package.json`]);
	if (!result.ok)
		throw new Error(result.reason ?? 'could not read main version');
	try {
		const parsed = JSON.parse(result.output) as { version?: unknown };
		if (typeof parsed.version !== 'string') throw new Error();
		return parsed.version;
	} catch {
		throw new Error('main package.json has no string version');
	}
};

export const readExpectedReleaseState = async (
	run: IGitRunner,
): Promise<IExpectedReleaseState> => {
	const sourceDevelopSha = await resolveRef(run, 'develop');
	const mainSha = await resolveRef(run, 'main');
	return {
		sourceDevelopSha,
		mainSha,
		mainVersion: await readMainVersion(run, mainSha),
	};
};

const makeIdempotencyKey = (input: IReleasePrepareInput): string =>
	input.idempotencyKey?.trim() ||
	`${input.type}:${input.slug}:${input.expected.mainSha}:${input.expected.mainVersion}`;

const sameRequest = (
	candidate: IReleaseCandidateMetadata,
	input: IReleasePrepareInput,
): boolean =>
	candidate.type === input.type &&
	candidate.slug === input.slug &&
	candidate.sourceDevelopSha === input.expected.sourceDevelopSha &&
	candidate.baseMainSha === input.expected.mainSha &&
	candidate.fromVersion === input.expected.mainVersion;

const freezeCandidate = (
	metadata: IReleaseCandidateMetadata,
): IReleaseCandidateMetadata =>
	Object.freeze({
		...assertReleaseMetadata(metadata),
		includedProposals: Object.freeze([...metadata.includedProposals]),
	});

export const releasePrepare = async (
	run: IGitRunner,
	store: IReleaseCandidateStore,
	input: IReleasePrepareInput,
	mode: ReleasePrepareMode,
): Promise<IReleasePreparation> => {
	const key = makeIdempotencyKey(input);
	const existingByKey = store.getByIdempotencyKey(key);
	if (existingByKey !== undefined) {
		if (!sameRequest(existingByKey, input))
			throw new ReleaseStateError(
				'duplicate-release',
				`idempotency key ${key} belongs to another release`,
			);
		return Object.freeze({
			mode,
			idempotencyKey: key,
			created: false,
			candidate: existingByKey,
		});
	}

	const current = await readExpectedReleaseState(run);
	assertExpectedReleaseState(input.expected, current);
	const existingBySlug = store.getBySlug(input.slug);
	if (existingBySlug !== undefined && existingBySlug.state !== 'aborted') {
		if (!sameRequest(existingBySlug, input))
			throw new ReleaseStateError(
				'duplicate-release',
				`release slug ${input.slug} is already prepared`,
			);
		return Object.freeze({
			mode,
			idempotencyKey: key,
			created: false,
			candidate: existingBySlug,
		});
	}

	const candidate = freezeCandidate({
		sourceDevelopSha: input.expected.sourceDevelopSha,
		baseMainSha: input.expected.mainSha,
		fromVersion: input.expected.mainVersion,
		targetVersion: nextVersion(input.expected.mainVersion, input.type),
		type: input.type,
		slug: input.slug,
		branch: releaseBranch(input.type, input.slug),
		actor: input.actor,
		timestamp: input.timestamp ?? new Date().toISOString(),
		includedProposals: [...(input.includedProposals ?? [])],
		state: mode === 'execute' ? 'cut' : 'draft',
	});
	if (mode === 'execute') {
		const reserved = store.reserve(key, candidate);
		if (reserved !== candidate) {
			if (!sameRequest(reserved, input))
				throw new ReleaseStateError(
					'duplicate-release',
					`idempotency key ${key} belongs to another release`,
				);
			return Object.freeze({
				mode,
				idempotencyKey: key,
				created: false,
				candidate: reserved,
			});
		}
	}
	return Object.freeze({
		mode,
		idempotencyKey: key,
		created: true,
		candidate,
	});
};

export const releasePrepareDryRun = (
	run: IGitRunner,
	store: IReleaseCandidateStore,
	input: IReleasePrepareInput,
): Promise<IReleasePreparation> => releasePrepare(run, store, input, 'dry-run');

export const releasePrepareExecute = (
	run: IGitRunner,
	store: IReleaseCandidateStore,
	input: IReleasePrepareInput,
): Promise<IReleasePreparation> => releasePrepare(run, store, input, 'execute');

export const releaseStatus = (
	store: IReleaseCandidateStore,
	slug: string,
	gates?: readonly IReleaseGate[],
): IReleaseStatusCompact => {
	const candidate = store.getBySlug(slug);
	if (candidate === undefined)
		throw new ReleaseStateError(
			'not-found',
			`release slug ${slug} was not prepared`,
		);
	return releaseStatusCompact(candidate, gates);
};

export const releaseValidate = (
	candidate: IReleaseCandidateMetadata,
	gates: readonly IReleaseGate[],
): IReleaseReadiness => {
	const readiness = evaluateReleaseReadiness(gates);
	if (!readiness.ready)
		throw new ReleaseStateError(
			'readiness-blocked',
			`release ${candidate.slug} readiness is blocked by required gates`,
			{
				details: Object.fromEntries(
					readiness.blockingGates.map((name) => [name, 'blocked']),
				),
			},
		);
	return readiness;
};

export { assertExpectedReleaseState };
