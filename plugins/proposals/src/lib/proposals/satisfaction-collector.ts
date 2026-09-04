/**
 * satisfaction-collector.ts — f00505 S2.
 *
 * Turns a declared slice into the `ISliceObservation` the evaluator
 * judges. This is the half that needs the filesystem and git; the
 * verdict itself stays pure next door.
 *
 * The probes are injected rather than imported so the collector can be
 * exercised without a git fixture, and so `auto_work` can pass the
 * runner it already has instead of opening a second one.
 */
import type { ISliceObservation } from './satisfaction-evaluator';

/**
 * A declared entry that names no single file. A slice scoped as
 * `packages/**` or `<generated>` says nothing checkable about its own
 * completion, so it is neither counted for nor against.
 */
const namesNoSingleFile = (declared: string): boolean =>
	declared.includes('*') ||
	declared.includes('<') ||
	declared.includes('{') ||
	declared.endsWith('/');

/**
 * Where a spec for `file` would live, by this repo's convention: the
 * same path under `tests/`, with a `.spec` before the extension.
 *
 * A guess, deliberately. It is used only as corroboration — a hit
 * strengthens a verdict, a miss never weakens one — so a convention
 * that holds most of the time is worth more than no signal at all.
 */
export const conventionalSpecPaths = (file: string): readonly string[] => {
	const match = /^(.*)\.([cm]?ts|tsx)$/u.exec(file);
	if (match === null) return [];
	const [, stem, ext] = match;
	if (stem === undefined || ext === undefined) return [];
	const sibling = `${stem}.spec.${ext}`;
	const mirrored = sibling.replace(/(^|\/)src\//u, '$1tests/src/');
	return mirrored === sibling ? [sibling] : [sibling, mirrored];
};

export interface ISatisfactionProbes {
	/** Whether the path exists on disk AND is tracked by git. */
	readonly isTracked: (file: string) => Promise<boolean>;
}

export interface ICollectSliceArgs {
	readonly sliceId: string;
	readonly declaredStatus: string;
	readonly files: readonly string[];
	/** Commits the proposal cites as having shipped this slice. */
	readonly citedCommits: readonly string[];
}

export const collectSliceObservation = async (
	slice: ICollectSliceArgs,
	probes: ISatisfactionProbes,
): Promise<ISliceObservation> => {
	const unresolvableFiles = slice.files.filter(namesNoSingleFile);
	const resolvable = slice.files.filter((file) => !namesNoSingleFile(file));

	const tracked = await Promise.all(
		resolvable.map(async (file) => ({
			file,
			exists: await probes.isTracked(file),
		})),
	);
	const trackedFiles = tracked
		.filter((entry) => entry.exists)
		.map((entry) => entry.file);
	const missingFiles = tracked
		.filter((entry) => !entry.exists)
		.map((entry) => entry.file);

	const specCandidates = [
		...new Set(trackedFiles.flatMap(conventionalSpecPaths)),
	];
	const specs = await Promise.all(
		specCandidates.map(async (file) => ({
			file,
			exists: await probes.isTracked(file),
		})),
	);

	return {
		sliceId: slice.sliceId,
		declaredStatus: slice.declaredStatus,
		trackedFiles,
		missingFiles,
		unresolvableFiles,
		coveringTests: specs
			.filter((entry) => entry.exists)
			.map((entry) => entry.file),
		citedCommits: [...slice.citedCommits],
	};
};
