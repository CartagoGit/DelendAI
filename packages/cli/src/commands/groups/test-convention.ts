/**
 * f00046 S3 — test-convention commands. One subcommand per
 * `test-convention_*` MCP tool. Pure 1:1 delegation.
 *
 * Tools mapped:
 *   - `test-convention_get_convention`    (no args)
 *   - `test-convention_suggest_spec_path` ({ sourcePath })
 *   - `test-convention_scan_drift`        ({ scope?, maxFiles? })
 */
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import {
	data,
	numberArg,
	positionalArg,
	request,
	scalarArg,
	usage,
} from './group-helpers';

const conventionGetCommand: ICliCommand = {
	name: 'test-convention get',
	summary: 'Show the canonical test convention the workspace expects.',
	async run(_args, ctx) {
		return data(await request(ctx, 'test-convention_get_convention', {}));
	},
};

const conventionSuggestCommand: ICliCommand = {
	name: 'test-convention suggest',
	summary: 'Show the companion spec path + skeleton for a source file.',
	async run(args, ctx) {
		const sourcePath = positionalArg(args) ?? scalarArg(args, 'source');
		if (sourcePath === undefined) {
			return usage('test-convention suggest <sourcePath>');
		}
		return data(
			await request(ctx, 'test-convention_suggest_spec_path', {
				sourcePath,
			}),
		);
	},
};

const conventionScanCommand: ICliCommand = {
	name: 'test-convention scan',
	summary: 'Scan src/ and tests/ for test-convention violations.',
	async run(args, ctx) {
		const scope = scalarArg(args, 'scope');
		const maxFiles =
			numberArg(args, 'max-files') ?? numberArg(args, 'maxFiles');
		return data(
			await request(ctx, 'test-convention_scan_drift', {
				...(scope !== undefined ? { scope } : {}),
				...(maxFiles !== undefined ? { maxFiles } : {}),
			}),
		);
	},
};

export const testConventionCommands: readonly ICliCommand[] = [
	conventionGetCommand,
	conventionSuggestCommand,
	conventionScanCommand,
];
