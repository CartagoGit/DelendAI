/**
 * task-briefing.service.ts — what a slice asks for, read from its proposal.
 *
 * Files come by reference with their sizes and the nearest specs by path: the
 * reach is the slice's own, and the agent opens what the work needs.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type {
	ITaskBriefing,
	ITaskBriefingRequest,
} from '@delendai/core/contracts';

import { locateProposal } from '../proposals/locate';

const SLICE_HEADING = /^### (S\d+)\s*[—-]\s*(.+)$/gmu;
const ACCEPTANCE_LINE = /^\s+- "(.*)"$/gmu;
const CODE_PATH = /`([^`]+)`/gu;

const sectionOf = (body: string, title: string): string =>
	new RegExp(`^## ${title}\\n+([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'mu')
		.exec(body)?.[1]
		?.trim() ?? '';

/** The slices of a proposal document: the one asked for, or them all. */
const slicesOf = (body: string, slice: string) => {
	const headings = [...body.matchAll(SLICE_HEADING)];
	return headings.flatMap((heading, index) => {
		const id = heading[1] ?? '';
		if (slice !== 'all' && slice !== id) return [];
		const text = body.slice(heading.index, headings[index + 1]?.index);
		return [
			{
				id,
				title: heading[2]?.trim() ?? '',
				acceptance: [...text.matchAll(ACCEPTANCE_LINE)].map(
					(line) => line[1] ?? '',
				),
				files: [
					...(/^- \*\*Files\*\*: (.*)$/mu
						.exec(text)?.[1]
						?.matchAll(CODE_PATH) ?? []),
				].map((path) => path[1] ?? ''),
			},
		];
	});
};

/** The spec beside a source file, or mirrored under its package's tests. */
const nearestSpec = (worktree: string, file: string): string | undefined => {
	if (!/\.tsx?$/u.test(file) || file.includes('.spec.')) return undefined;
	const spec = join(
		dirname(file),
		basename(file).replace(/\.(tsx?)$/u, '.spec.$1'),
	);
	return [spec, spec.replace(/\/src\//u, '/tests/src/')].find((path) =>
		existsSync(join(worktree, path)),
	);
};

export const taskBriefingOf = async (
	request: ITaskBriefingRequest,
	proposalsDir: string,
): Promise<ITaskBriefing | undefined> => {
	const proposalsDirAbs = join(request.worktree, proposalsDir);
	const located = await locateProposal(request.proposal, {
		indexPathAbs: join(proposalsDirAbs, '.no-index'),
		proposalsDirAbs,
	});
	if (located === null) return undefined;
	const body = readFileSync(located.absPath, 'utf8');
	const slices = slicesOf(body, request.slice);
	const paths = [...new Set(slices.flatMap((slice) => slice.files))];
	return {
		goal: sectionOf(body, 'goal'),
		slices: slices.map(({ id, title, acceptance }) => ({
			id,
			title,
			acceptance,
		})),
		files: paths.map((path) => {
			const absolute = join(request.worktree, path);
			return existsSync(absolute)
				? { path, bytes: statSync(absolute).size }
				: { path };
		}),
		specs: [
			...new Set(
				paths.flatMap(
					(path) => nearestSpec(request.worktree, path) ?? [],
				),
			),
		],
	};
};
