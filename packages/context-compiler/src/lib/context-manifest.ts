import {
	asRepositoryInstanceId,
	canonicalStateHash,
	type IArtifactKey,
	type IArtifactRecord,
	type IArtifactStore,
	type IDerivationEngine,
	type StateScope,
} from '@delendai/state';

export interface IContextRef {
	readonly kind: 'artifact' | 'generation' | 'manifest' | 'fingerprint';
	readonly id: string;
	readonly contentHash?: string;
}

export interface IContextManifest {
	readonly id: string;
	readonly refs: readonly IContextRef[];
	readonly summary: string;
	readonly bytes: number;
	readonly contentHash: string;
	readonly createdAt: number;
}

export interface IContextCompilerOptions {
	readonly artifactStore: IArtifactStore;
	readonly derivationEngine: IDerivationEngine;
}

export interface IContextCompiler {
	compile(refs: readonly IContextRef[]): Promise<IContextManifest>;
	expand(ref: IContextRef, depth?: number): Promise<unknown>;
	diff(
		before: IContextManifest,
		after: IContextManifest,
	): Promise<IContextManifest>;
}

const CONTEXT_SCOPE: StateScope = {
	kind: 'shared-content-cache',
	locator: {
		repositoryInstanceId: asRepositoryInstanceId('context-compiler'),
		swarmRoot: '/virtual/delendai/context-compiler',
		cacheNamespace: 'context-compiler',
	},
};

export const CONTEXT_MANIFEST_ARTIFACT_KIND = 'manifest';
export const CONTEXT_ARTIFACT_KIND = 'artifact';

export function contextCompilerScope(): StateScope {
	return CONTEXT_SCOPE;
}

export function createContextManifestId(contentHash: string): string {
	return `ctx:${contentHash.slice(0, 12)}`;
}

export function contextSummaryForRefs(refs: readonly IContextRef[]): string {
	return `${refs.length} refs`;
}

export function measureBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function calculateManifestHash(
	refs: readonly IContextRef[],
	summary: string,
): string {
	return canonicalStateHash({
		refs: refs.map((ref) => ({
			kind: ref.kind,
			id: ref.id,
			...(ref.contentHash === undefined
				? {}
				: { contentHash: ref.contentHash }),
		})),
		summary,
	});
}

export function createContextRef(
	record: IArtifactRecord<unknown>,
): IContextRef {
	return {
		kind: mapArtifactKindToContextKind(record.key.kind),
		id: serializeArtifactKey(record.key),
		contentHash: record.contentHash,
	};
}

export function createManifestArtifactKey(
	manifest: IContextManifest,
): IArtifactKey {
	return {
		scope: contextCompilerScope(),
		kind: CONTEXT_MANIFEST_ARTIFACT_KIND,
		id: manifest.id,
	};
}

export function createContentArtifactKey(contentHash: string): IArtifactKey {
	return {
		scope: contextCompilerScope(),
		kind: CONTEXT_ARTIFACT_KIND,
		id: `artifact:${contentHash}`,
	};
}

export function serializeArtifactKey(key: IArtifactKey): string {
	return JSON.stringify(key);
}

export function parseArtifactKey(input: string): IArtifactKey | null {
	try {
		const value = JSON.parse(input) as Partial<IArtifactKey>;
		if (
			typeof value !== 'object' ||
			value === null ||
			typeof value.id !== 'string' ||
			typeof value.kind !== 'string' ||
			typeof value.scope !== 'object' ||
			value.scope === null
		) {
			return null;
		}
		return value as IArtifactKey;
	} catch {
		return null;
	}
}

export function isContextManifest(value: unknown): value is IContextManifest {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as Partial<IContextManifest>;
	return (
		typeof candidate.id === 'string' &&
		Array.isArray(candidate.refs) &&
		typeof candidate.summary === 'string' &&
		typeof candidate.bytes === 'number' &&
		typeof candidate.contentHash === 'string' &&
		typeof candidate.createdAt === 'number'
	);
}

export async function loadRecordFromRef(
	artifactStore: IArtifactStore,
	ref: IContextRef,
): Promise<IArtifactRecord<unknown>> {
	const key = parseArtifactKey(ref.id);
	if (key === null) {
		throw new Error(`Invalid context ref id: ${ref.id}`);
	}
	const record = await artifactStore.get<unknown>(key);
	if (record === null) {
		throw new Error(`Missing artifact for ref: ${ref.id}`);
	}
	return record;
}

function mapArtifactKindToContextKind(
	kind: IArtifactKey['kind'],
): IContextRef['kind'] {
	switch (kind) {
		case 'generation':
			return 'generation';
		case 'manifest':
			return 'manifest';
		case 'fingerprint':
			return 'fingerprint';
		default:
			return 'artifact';
	}
}

void ({} as IContextCompilerOptions | IArtifactStore | IDerivationEngine);
