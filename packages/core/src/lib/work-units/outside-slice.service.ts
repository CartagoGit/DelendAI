/**
 * outside-slice.service.ts — the files an implement unit changed that its
 * proposal's slices do not name.
 *
 * An agent committed, in a unit entered for x00722 S1, a change to a file
 * x00722 never named; nothing said so, and the change reached review under
 * a proposal it had nothing to do with. A unit may need a file its slice
 * forgot, so this reports rather than refuses: `work status` names each
 * file, and the reviewer reads it beside the slice.
 */
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import type { ISwarmUnit } from '../contracts/interfaces/work-swarm.interface';
import { compileWorkRefParser } from '../startup-reconciler/work-ref-identity';
import {
	integratedDocumentOf,
	integratedDocumentPathOf,
} from './reviewed-proposal.service';

const FILES_LINE = /^\s*-\s*\*\*Files\*\*:(?<list>.*)$/u;
const QUOTED = /`(?<path>[^`]+)`/gu;

/** The paths every `Files` line of `section` names, globs and folders too. */
export const namedFiles = (section: string): readonly string[] =>
	section.split('\n').flatMap((line) => {
		const list = FILES_LINE.exec(line)?.groups?.list ?? '';
		return [...list.matchAll(QUOTED)].map(
			(match) => match.groups?.path ?? '',
		);
	});

const escaped = (text: string): string =>
	text.replaceAll(/[.+?^${}()|[\]\\]/gu, '\\$&');

/** Whether `path` is one of `named`: equal, under a folder, or by glob. */
export const isNamed = (path: string, named: readonly string[]): boolean =>
	named.some((entry) => {
		if (entry === path) return true;
		if (entry.endsWith('/')) return path.startsWith(entry);
		if (!entry.includes('*')) return false;
		const pattern = entry
			.split('**/')
			.map((part) =>
				part
					.split('**')
					.map((piece) => piece.split('*').map(escaped).join('[^/]*'))
					.join('.*'),
			)
			.join('(?:.*/)?');
		return new RegExp(`^${pattern}$`, 'u').test(path);
	});

/** Each implement unit that changed files its slice does not name. */
export const unitsOutsideTheirSlice = (input: {
	readonly root: string;
	readonly docsDir: string;
	readonly policy: Pick<IResolvedDevelopmentPolicy, 'branches'>;
	readonly units: readonly ISwarmUnit[];
}): readonly { readonly ref: string; readonly files: readonly string[] }[] => {
	const parser = compileWorkRefParser(
		input.policy.branches.workRefTemplate,
		input.policy.branches.workRefPrefix,
		{ requireKind: false },
	);
	return input.units.flatMap((unit) => {
		const identity = parser?.parse(`refs/heads/${unit.ref}`);
		if (identity === undefined || identity.kind !== 'implement') return [];
		// The proposal as the unit holds it: a unit names the files it
		// needs in its own proposal, and one unit carries a whole proposal.
		const where = {
			root: input.root,
			base: unit.tip,
			docsDir: input.docsDir,
			proposal: identity.proposal,
		};
		const document = integratedDocumentOf(where);
		if (document === undefined) return [];
		const own = integratedDocumentPathOf(where);
		const named = namedFiles(document);
		// The proposal's own document is the record of the work.
		const files = unit.paths.filter(
			(path) => path !== own && !isNamed(path, named),
		);
		return files.length > 0 ? [{ ref: unit.ref, files }] : [];
	});
};
