/**
 * land-project-ports.helper.ts — the project-specific ports of a pass, read
 * from the development policy's `integration` options. A project with no
 * options gets the safe answer for each: no section, every zone affected,
 * nothing to regenerate, nothing to normalize.
 */
import { footprintFromReach } from '@delendai/core/cli';
import type { IResolvedDevelopmentPolicy } from '@delendai/core/public';

import {
	BATCH_NORMALIZATION_SUBJECT,
	JOBS_ALL,
} from '../contracts/constants/integration-pass.constant';
import type {
	IGitExec,
	ILandProjectPorts,
	IProjectCommandRunner,
} from '../contracts/interfaces/integration-pass.interface';

import { zoneNameOf, zonesOfFiles } from './land-zones.helper';

/** The files a change adds that existed nowhere before (a move adds and deletes one name). */
const createsFiles = (
	exec: IGitExec,
	root: string,
	from: string,
	to: string,
): boolean => {
	const nameOf = (path: string): string => path.split('/').at(-1) ?? path;
	const lines = exec(root, [
		'diff',
		'--name-status',
		'--no-renames',
		`${from}...${to}`,
	])
		.split('\n')
		.map((line) => line.split('\t'))
		.filter((parts) => parts.length >= 2);
	const deleted = new Set(
		lines
			.filter(([status]) => status === 'D')
			.map(([, path = '']) => nameOf(path)),
	);
	return lines.some(
		([status, path = '']) => status === 'A' && !deleted.has(nameOf(path)),
	);
};

/** The zones a `jobs` command printed; `undefined` for every zone (or no usable answer). */
export const parseJobs = (stdout: string): ReadonlySet<string> | undefined => {
	const lines = stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');
	return lines.includes(JOBS_ALL) ? undefined : new Set(lines);
};

export const landProjectPorts = (input: {
	readonly root: string;
	readonly options: IResolvedDevelopmentPolicy['integration'];
	readonly exec: IGitExec;
	readonly runCommand: IProjectCommandRunner;
}): ILandProjectPorts => {
	const { root, options, exec, runCommand } = input;
	const { derived, commands, zones } = options;
	const names = new Set(zones.map(zoneNameOf));
	return {
		derivedPaths: new Set(derived.paths),
		regenerate: (dir) =>
			derived.command === '' || runCommand(dir, derived.command).ok,
		normalizeBatch: (dir, commit) => {
			if (commands.normalizeBatch === '') return;
			if (!runCommand(dir, commands.normalizeBatch).ok) return;
			commit(BATCH_NORMALIZATION_SUBJECT);
		},
		sectionOfCheck: (name) => {
			const token = (name.split(': ').at(-1) ?? name).split(' ')[0] ?? '';
			return names.has(token) ? token : undefined;
		},
		footprintOf: (base, head) => {
			const files = new Set(
				exec(root, ['diff', '--name-only', `${base}...${head}`])
					.split('\n')
					.filter((file) => file !== ''),
			);
			const reached = (): ReadonlySet<string> | undefined => {
				if (commands.jobs !== '') {
					const answer = runCommand(
						root,
						`${commands.jobs} ${base} ${head}`,
					);
					return answer.ok ? parseJobs(answer.stdout) : undefined;
				}
				return zonesOfFiles(zones, files);
			};
			const zonesReached =
				files.size === 0 ? new Set<string>() : reached();
			return footprintFromReach({
				files,
				reach:
					zonesReached === undefined
						? undefined
						: { zones: zonesReached, readOnly: new Set() },
				creates: files.size > 0 && createsFiles(exec, root, base, head),
			});
		},
	};
};
