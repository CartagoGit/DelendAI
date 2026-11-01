/**
 * unit-departures.service.ts — what a unit changed that no slice names.
 *
 * A slice lists its files (`- **Files**: `a`, `b``). Work that touches a
 * path no slice lists is not necessarily wrong, but the proposal no longer
 * describes it, and a reviewer reading the slices would not look there.
 * Publishing says so. It is advice: nothing here blocks.
 */
import { proposalFileAt } from './publication-target.service';
import { readGit } from './work-unit-shared.service';

const FILES_LINE = /^\s*[-*]\s*\*\*Files\*\*\s*:\s*(.*)$/gmu;
const BACKTICKED = /`([^`]+)`/gu;
const GENERATED = /(^|\/)generated\/|\.generated\./u;
const SPEC = /\.(spec|test)\.[cm]?[jt]sx?$|(^|\/)tests?\//u;

/** The paths every slice of `proposalText` names. */
export const slicePaths = (proposalText: string): readonly string[] =>
	[...proposalText.matchAll(FILES_LINE)].flatMap((line) =>
		[...(line[1] ?? '').matchAll(BACKTICKED)].map((found) =>
			(found[1] ?? '').trim(),
		),
	);

const globToRegExp = (glob: string): RegExp =>
	new RegExp(
		`^${glob
			.replaceAll(/[.+?^${}()|[\]\\]/gu, '\\$&')
			.replaceAll('**', '\u0000')
			.replaceAll('*', '[^/]*')
			.replaceAll('\u0000', '.*')}$`,
		'u',
	);

const named = (path: string, listed: readonly string[]): boolean =>
	listed.some(
		(entry) =>
			entry === path ||
			path.startsWith(entry.endsWith('/') ? entry : `${entry}/`) ||
			(entry.includes('*') && globToRegExp(entry).test(path)),
	);

/**
 * The changed paths no slice names. Documents, generated files and specs
 * are the unit's bookkeeping, not departures. Empty when the
 * proposal lists no files at all: there is nothing to depart from.
 */
export const departuresOf = (
	changed: readonly string[],
	proposalText: string,
): readonly string[] => {
	const listed = slicePaths(proposalText);
	if (listed.length === 0) return [];
	return changed.filter(
		(path) =>
			!path.endsWith('.md') &&
			!GENERATED.test(path) &&
			!SPEC.test(path) &&
			!named(path, listed),
	);
};

/** The departures of `workRef` over `base`, read from git. */
export const unitDepartures = (input: {
	readonly root: string;
	readonly proposal: string;
	readonly workRef: string;
	readonly base: string;
}): readonly string[] => {
	const { root, proposal, workRef, base } = input;
	const file = proposalFileAt(root, proposal, workRef);
	if (file === undefined) return [];
	const text = readGit(root, ['show', `${workRef}:${file}`]);
	if (text === undefined) return [];
	const changed = (
		readGit(root, [
			'diff',
			'--name-only',
			'--no-renames',
			`${base}...${workRef}`,
		]) ?? ''
	)
		.split('\n')
		.filter((path) => path.length > 0);
	return departuresOf(changed, text);
};
