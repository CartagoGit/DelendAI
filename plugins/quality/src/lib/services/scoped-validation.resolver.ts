import type { IScopeMap } from './scopes';
import type {
	IScopedValidationDecision,
	IScopedValidationFileScopeMatch,
	IScopedValidationInput,
} from './scoped-validation.types';

const DEFAULT_UNIVERSAL_SCOPE_NAMES = [
	'all',
	'full',
	'validate',
	'global',
	'workspace',
	'repo',
] as const;

interface IResolvedScopeSet {
	readonly coverage: 'direct' | 'fallback' | 'blocked';
	readonly scopes: readonly string[];
	readonly matches: readonly IScopedValidationFileScopeMatch[];
	readonly unmatchedFiles: readonly string[];
	readonly fallbackScope: string | null;
	readonly reason: string;
	readonly blockingReasons: readonly string[];
}

const normalizePath = (value: string): string =>
	value
		.trim()
		.replace(/\\/gu, '/')
		.replace(/^\.\//u, '')
		.replace(/^\/+?/u, '');

const normalizeName = (value: string): string =>
	normalizePath(value).replace(/\/$/u, '').toLowerCase();

const dedupe = (values: readonly string[]): string[] => [...new Set(values)];

const basenameStemOf = (file: string): string => {
	const normalized = normalizePath(file);
	const last = normalized.split('/').at(-1) ?? normalized;
	return last.replace(/\.[^.]+$/u, '').toLowerCase();
};

const prefixMatches = (file: string, scope: string): boolean =>
	file === scope || file.startsWith(`${scope}/`);

const directMatchFor = (
	file: string,
	scopeNames: readonly string[],
): IScopedValidationFileScopeMatch | null => {
	const normalizedFile = normalizeName(file);
	const normalizedSegments = normalizedFile.split('/');
	const basenameStem = basenameStemOf(normalizedFile);
	const prefixCandidates = scopeNames
		.filter((scope) => prefixMatches(normalizedFile, scope))
		.sort((left, right) => right.length - left.length);
	if (prefixCandidates.length > 0) {
		return {
			file: normalizePath(file),
			scope: prefixCandidates[0]!,
			matchKind: 'prefix',
		};
	}
	const segmentCandidates = scopeNames.filter((scope) =>
		normalizedSegments.includes(scope),
	);
	if (segmentCandidates.length === 1) {
		return {
			file: normalizePath(file),
			scope: segmentCandidates[0]!,
			matchKind: 'segment',
		};
	}
	if (segmentCandidates.length > 1) return null;
	const basenameCandidates = scopeNames.filter(
		(scope) => scope === basenameStem,
	);
	if (basenameCandidates.length === 1) {
		return {
			file: normalizePath(file),
			scope: basenameCandidates[0]!,
			matchKind: 'basename',
		};
	}
	return null;
};

const resolveUniversalScope = (
	scopeNames: readonly string[],
	preferred: readonly string[],
): string | null => {
	for (const preferredName of preferred) {
		const match = scopeNames.find((scope) => scope === preferredName);
		if (match !== undefined) return match;
	}
	return null;
};

export const deriveScopedValidationScopes = (
	ownedFiles: readonly string[],
	scopes: IScopeMap,
	input: Pick<
		IScopedValidationInput,
		'fallbackToUniversalScope' | 'universalScopeNames'
	>,
): IResolvedScopeSet => {
	const normalizedFiles = dedupe(
		ownedFiles.map(normalizePath).filter((value) => value !== ''),
	);
	const rawScopeNames = Object.keys(scopes);
	const normalizedScopeEntries = rawScopeNames.map((scope) => ({
		raw: scope,
		normalized: normalizeName(scope),
	}));
	const normalizedScopeNames = normalizedScopeEntries.map(
		(entry) => entry.normalized,
	);
	const universalScope = resolveUniversalScope(
		normalizedScopeNames,
		(input.universalScopeNames ?? DEFAULT_UNIVERSAL_SCOPE_NAMES).map(
			normalizeName,
		),
	);
	if (normalizedScopeEntries.length === 0) {
		return {
			coverage: 'blocked',
			scopes: [],
			matches: [],
			unmatchedFiles: normalizedFiles,
			fallbackScope: null,
			reason: 'no quality scopes are configured',
			blockingReasons: ['no quality scopes are configured'],
		};
	}
	if (normalizedFiles.length === 0) {
		if (
			universalScope !== null &&
			input.fallbackToUniversalScope !== false
		) {
			const raw =
				normalizedScopeEntries.find(
					(entry) => entry.normalized === universalScope,
				)?.raw ?? universalScope;
			return {
				coverage: 'fallback',
				scopes: [raw],
				matches: [],
				unmatchedFiles: [],
				fallbackScope: raw,
				reason: 'no owned files were supplied; falling back to the universal scope',
				blockingReasons: [],
			};
		}
		return {
			coverage: 'blocked',
			scopes: [],
			matches: [],
			unmatchedFiles: [],
			fallbackScope: null,
			reason: 'owned files are required to derive a scoped validation set',
			blockingReasons: [
				'owned files are required to derive a scoped validation set',
			],
		};
	}
	const directScopeNames = normalizedScopeNames.filter(
		(scope) => scope !== universalScope,
	);
	const matches: IScopedValidationFileScopeMatch[] = [];
	const unmatchedFiles: string[] = [];
	for (const file of normalizedFiles) {
		const match = directMatchFor(file, directScopeNames);
		if (match === null) unmatchedFiles.push(file);
		else {
			const raw =
				normalizedScopeEntries.find(
					(entry) => entry.normalized === match.scope,
				)?.raw ?? match.scope;
			matches.push({ ...match, scope: raw });
		}
	}
	if (unmatchedFiles.length === 0) {
		return {
			coverage: 'direct',
			scopes: dedupe(matches.map((match) => match.scope)),
			matches,
			unmatchedFiles: [],
			fallbackScope: null,
			reason: 'scopes were derived directly from the owned files',
			blockingReasons: [],
		};
	}
	if (universalScope !== null && input.fallbackToUniversalScope !== false) {
		const raw =
			normalizedScopeEntries.find(
				(entry) => entry.normalized === universalScope,
			)?.raw ?? universalScope;
		return {
			coverage: 'fallback',
			scopes: [raw],
			matches: [
				...matches,
				...unmatchedFiles.map((file) => ({
					file,
					scope: raw,
					matchKind: 'fallback' as const,
				})),
			],
			unmatchedFiles,
			fallbackScope: raw,
			reason: 'unmatched files forced a conservative fallback to the universal scope',
			blockingReasons: [],
		};
	}
	return {
		coverage: 'blocked',
		scopes: [],
		matches,
		unmatchedFiles,
		fallbackScope: null,
		reason: 'one or more files could not be mapped to a safe validation scope',
		blockingReasons: unmatchedFiles.map(
			(file) => `no safe validation scope could be derived for ${file}`,
		),
	};
};

export const resolveScopedValidationDecision = (
	input: IScopedValidationInput,
): IScopedValidationDecision => {
	const scopeSet = deriveScopedValidationScopes(
		input.ownedFiles,
		input.scopes,
		{
			...(input.fallbackToUniversalScope !== undefined
				? { fallbackToUniversalScope: input.fallbackToUniversalScope }
				: {}),
			...(input.universalScopeNames !== undefined
				? { universalScopeNames: input.universalScopeNames }
				: {}),
		},
	);
	const currentActor = input.activity.agents.find(
		(agent) => agent.key === input.activity.currentActorKey,
	);
	const otherActiveAgents = input.activity.agents.filter(
		(agent) =>
			agent.state === 'active' &&
			agent.key !== input.activity.currentActorKey,
	);
	const baseDecision = {
		snapshotId: input.activity.snapshotId,
		ownedFiles: dedupe(input.ownedFiles.map(normalizePath).filter(Boolean)),
		activeAgents: input.activity.summary.activeAgents,
		activeTasks: input.activity.summary.activeTasks,
		activeLocks: input.activity.summary.activeLocks,
		activeWorktrees: input.activity.summary.activeWorktrees,
		evidenceAgeMinutes: input.activity.summary.evidenceAgeMinutes,
	};
	if (scopeSet.coverage === 'blocked') {
		return {
			mode: 'blocked',
			scopeCoverage: 'blocked',
			reason: scopeSet.reason,
			resolvedScopes: [],
			scopeMatches: scopeSet.matches,
			unmatchedFiles: scopeSet.unmatchedFiles,
			fallbackScope: null,
			blockingReasons: scopeSet.blockingReasons,
			...baseDecision,
		};
	}
	if (input.operation === 'close') {
		const hardCloseBlockers = [
			...(currentActor?.state === 'corrupt'
				? ['the current actor has corrupt activity evidence']
				: []),
			...input.activity.reasons.filter((reason) =>
				/corrupt|contradict|disagree/u.test(reason),
			),
		];
		if (hardCloseBlockers.length > 0) {
			return {
				mode: 'blocked',
				scopeCoverage: 'blocked',
				reason: 'close requires a consistent snapshot and an active current actor',
				resolvedScopes: [],
				scopeMatches: scopeSet.matches,
				unmatchedFiles: scopeSet.unmatchedFiles,
				fallbackScope: scopeSet.fallbackScope,
				blockingReasons: hardCloseBlockers,
				...baseDecision,
			};
		}
		if (currentActor?.state !== 'active') {
			return {
				mode: 'blocked',
				scopeCoverage: 'blocked',
				reason: 'close requires an active current actor',
				resolvedScopes: [],
				scopeMatches: scopeSet.matches,
				unmatchedFiles: scopeSet.unmatchedFiles,
				fallbackScope: scopeSet.fallbackScope,
				blockingReasons: [
					'the current actor is not provably active in the activity snapshot',
				],
				...baseDecision,
			};
		}
		if (
			otherActiveAgents.length === 0 &&
			input.activity.summary.activeAgents === 1
		) {
			const fullScope =
				scopeSet.fallbackScope ??
				(input.scopes.full !== undefined
					? 'full'
					: input.scopes.all !== undefined
						? 'all'
						: Object.keys(input.scopes));
			const resolvedScopes = Array.isArray(fullScope)
				? fullScope
				: [fullScope];
			return {
				mode: 'full',
				scopeCoverage: 'full',
				reason: 'close is running as the last active actor, so the full gate is required',
				resolvedScopes,
				scopeMatches: scopeSet.matches,
				unmatchedFiles: scopeSet.unmatchedFiles,
				fallbackScope: scopeSet.fallbackScope,
				blockingReasons: [],
				...baseDecision,
			};
		}
	}
	return {
		mode: 'scoped',
		scopeCoverage: scopeSet.coverage,
		reason:
			input.operation === 'close'
				? 'another active actor still exists, so only scoped validation is allowed'
				: 'the operation does not require a final full gate',
		resolvedScopes: scopeSet.scopes,
		scopeMatches: scopeSet.matches,
		unmatchedFiles: scopeSet.unmatchedFiles,
		fallbackScope: scopeSet.fallbackScope,
		blockingReasons: [],
		...baseDecision,
	};
};
