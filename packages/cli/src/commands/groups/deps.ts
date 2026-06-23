/**
 * f00046 S3 — deps commands. One subcommand per `deps_*` MCP tool.
 * Pure 1:1 delegation. Read-only, offline (no network / CVE database).
 *
 * Tools mapped:
 *   - `deps_deps_list`     ({ manifest? })
 *   - `deps_deps_check`    ({ manifest? })
 *   - `deps_deps_polyglot` (no args)
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import { data, request, scalarArg } from './group-helpers';

const depsListCommand: ICliCommand = {
	name: 'deps list',
	summary: 'List declared npm dependencies with their version ranges.',
	async run(args, ctx) {
		const manifest = scalarArg(args, 'manifest');
		return data(
			await request(ctx, 'deps_deps_list', {
				...(manifest !== undefined ? { manifest } : {}),
			}),
		);
	},
};

const depsCheckCommand: ICliCommand = {
	name: 'deps check',
	summary:
		'Report offline dependency health (lockfile, unpinned, duplicates).',
	async run(args, ctx) {
		const manifest = scalarArg(args, 'manifest');
		return data(
			await request(ctx, 'deps_deps_check', {
				...(manifest !== undefined ? { manifest } : {}),
			}),
		);
	},
};

const depsPolyglotCommand: ICliCommand = {
	name: 'deps polyglot',
	summary:
		'List declared deps from pyproject/Cargo/go.mod (non-npm ecosystems).',
	async run(_args, ctx) {
		return data(await request(ctx, 'deps_deps_polyglot', {}));
	},
};

export const depsCommands: readonly ICliCommand[] = [
	depsListCommand,
	depsCheckCommand,
	depsPolyglotCommand,
];
