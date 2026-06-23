import type { IFileReader } from '@mcp-vertex/core/public';
import { parseConfigFile } from '@mcp-vertex/core/public';

import type { IScopeCommand } from './runner';

export type IScopeMap = Readonly<Record<string, readonly IScopeCommand[]>>;

const packageManager = (reader: IFileReader): string => {
	if (reader.exists('bun.lock') || reader.exists('bun.lockb'))
		return 'bun run';
	if (reader.exists('pnpm-lock.yaml')) return 'pnpm';
	if (reader.exists('yarn.lock')) return 'yarn';
	return 'npm run';
};

const QUALITY_ROLES = ['lint', 'typecheck', 'test', 'build'] as const;

const fromScripts = (reader: IFileReader): IScopeMap => {
	const raw = reader.readFile('package.json');
	if (raw === undefined) return {};
	try {
		const scripts =
			(JSON.parse(raw) as { scripts?: Record<string, string> }).scripts ??
			{};
		const pm = packageManager(reader);
		const commands: IScopeCommand[] = [];
		for (const role of QUALITY_ROLES) {
			if (scripts[role] !== undefined) {
				commands.push({ command: `${pm} ${role}`, expect: 'exit0' });
			}
		}
		return commands.length > 0 ? { all: commands } : {};
	} catch {
		return {};
	}
};

/**
 * Resolve the scope→commands map, in precedence order:
 * 1. plugin options (`scopes`), 2. `mcp-vertex.config.json` validationMatrix,
 * 3. detected package.json scripts (as one `all` scope).
 */
export const resolveScopes = (
	reader: IFileReader,
	options: { scopes?: Readonly<Record<string, readonly string[]>> } = {},
): IScopeMap => {
	if (options.scopes && Object.keys(options.scopes).length > 0) {
		const out: Record<string, IScopeCommand[]> = {};
		for (const [scope, cmds] of Object.entries(options.scopes)) {
			// `expect: 'exit0'` matches the convention used by
			// `fromScripts` and the core's `IValidationCommand` shape.
			out[scope] = cmds.map((command) => ({ command, expect: 'exit0' }));
		}
		return out;
	}
	const config = parseConfigFile(reader.readFile('mcp-vertex.config.json'));
	const matrix = config.validationMatrix?.scopes;
	if (matrix && Object.keys(matrix).length > 0) {
		return matrix as IScopeMap;
	}
	return fromScripts(reader);
};
