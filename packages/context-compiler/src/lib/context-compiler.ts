import { canonicalStateHash, type IArtifactRecord } from '@delendai/state';

import {
	calculateManifestHash,
	contextSummaryForRefs,
	createContextManifestId,
	createContextRef,
	createManifestArtifactKey,
	loadRecordFromRef,
	measureBytes,
	type IContextCompiler,
	type IContextCompilerOptions,
	type IContextManifest,
	type IContextRef,
} from './context-manifest';
import { createRefExpander } from './ref-expander';

const COMPILE_DERIVATION = 'context-compiler:compile-manifest';

interface ICompiledManifestValue {
	readonly refs: readonly IContextRef[];
	readonly summary: string;
	readonly bytes: number;
	readonly contentHash: string;
}

export const createContextCompiler = (
	options: IContextCompilerOptions
): IContextCompiler => {
	registerCompileDerivation(options);
	const expander = createRefExpander(options.artifactStore);

	return {
		async compile(refs: readonly IContextRef[]): Promise<IContextManifest> {
			const inputs = await Promise.all(
				refs.map((ref) => loadRecordFromRef(options.artifactStore, ref))
			);
			const fingerprint = canonicalStateHash(
				inputs.map((record) => record.contentHash)
			);
			const derived = await options.derivationEngine.apply<
				unknown,
				ICompiledManifestValue
			>(COMPILE_DERIVATION, { inputs, fingerprint });
			const manifest: IContextManifest = {
				id: createContextManifestId(derived.value.contentHash),
				refs: derived.value.refs,
				summary: derived.value.summary,
				bytes: derived.value.bytes,
				contentHash: derived.value.contentHash,
				createdAt: derived.createdAt,
			};
			await options.artifactStore.put(
				createManifestArtifactKey(manifest),
				manifest
			);
			return manifest;
		},

		expand(ref: IContextRef, depth = 0): Promise<unknown> {
			return expander.expand(ref, depth);
		},

		async diff(
			before: IContextManifest,
			after: IContextManifest
		): Promise<IContextManifest> {
			if (before.contentHash === after.contentHash) {
				return this.compile([]);
			}

			const previousHashes = new Map(
				before.refs.map((ref) => [
					stableRefIdentity(ref),
					ref.contentHash ?? '',
				])
			);
			const currentRefs = new Map(
				after.refs.map((ref) => [stableRefIdentity(ref), ref])
			);
			const changedRefs = after.refs.filter((ref) => {
				const previousHash = previousHashes.get(stableRefIdentity(ref));
				return previousHash !== (ref.contentHash ?? '');
			});
			const removedRefs = before.refs
				.filter((ref) => !currentRefs.has(stableRefIdentity(ref)))
				.map(({ kind, id }) => ({ kind, id }));

			const changedManifest = await this.compile(changedRefs);
			const refs = [...changedManifest.refs, ...removedRefs].sort(
				compareRefs
			);
			const summary = contextSummaryForRefs(refs);
			return {
				...changedManifest,
				id: createContextManifestId(
					calculateManifestHash(refs, summary)
				),
				refs,
				summary,
				contentHash: calculateManifestHash(refs, summary),
			};
		},
	};
};

function registerCompileDerivation(options: IContextCompilerOptions): void {
	options.derivationEngine.register<unknown, ICompiledManifestValue>({
		name: COMPILE_DERIVATION,
		derive: async ({ inputs }) => {
			const refs = inputs.map((record) => createContextRef(record));
			const summary = contextSummaryForRefs(refs);
			return {
				refs,
				summary,
				bytes: sumArtifactBytes(inputs),
				contentHash: calculateManifestHash(refs, summary),
			};
		},
		fingerprint: ({ inputs, fingerprint }) =>
			canonicalStateHash({
				fingerprint,
				inputs: inputs.map((record) => record.contentHash),
			}),
	});
}

function sumArtifactBytes(inputs: readonly IArtifactRecord<unknown>[]): number {
	return inputs.reduce(
		(total, record) => total + measureBytes(record.value),
		0
	);
}

function stableRefIdentity(ref: IContextRef): string {
	return `${ref.kind}:${ref.id}`;
}

function compareRefs(left: IContextRef, right: IContextRef): number {
	return stableRefIdentity(left).localeCompare(stableRefIdentity(right));
}
