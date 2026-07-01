import { resolve } from 'node:path';

import type {
	ICliGlobalOptions,
	IParsedCliInvocation,
} from '../contracts/interfaces/cli-command.interface';

const GLOBAL_FLAGS_WITH_VALUE = new Set([
	'workspace',
	'remote',
	'format',
	'lang',
	'plugins',
	'preset',
	'config',
]);
const VALUE_FLAGS = GLOBAL_FLAGS_WITH_VALUE;
// Fallback set of command groups whose names are two words. The real CLI
// derives this from the live command registry (see `index.ts`) so every
// group (`proposals`, `memory`, `audit`, …) resolves; this literal only
// keeps unit-test call sites that omit the argument working as before.
const DEFAULT_TWO_PART_COMMANDS = new Set(['plugin', 'config', 'docs', 'git']);

const takeFlagValue = (
	argv: readonly string[],
	index: number,
	body: string,
): {
	readonly key: string;
	readonly value: string;
	readonly consumed: number;
} => {
	const equals = body.indexOf('=');
	if (equals >= 0) {
		return {
			key: body.slice(0, equals),
			value: body.slice(equals + 1),
			consumed: 1,
		};
	}
	if (!VALUE_FLAGS.has(body))
		return { key: body, value: 'true', consumed: 1 };
	const next = argv[index + 1];
	if (next !== undefined && !next.startsWith('-')) {
		return { key: body, value: next, consumed: 2 };
	}
	return { key: body, value: 'true', consumed: 1 };
};

const splitList = (value: string | undefined): readonly string[] =>
	value === undefined
		? []
		: value
				.split(',')
				.map((entry) => entry.trim())
				.filter(Boolean);

const OPTIONS_FLAG_PREFIX = 'options-';

const parseExtraOptionFlag = (
	body: string,
): {
	readonly pluginId: string;
	readonly key: string;
	readonly value: string;
} | null => {
	if (!body.startsWith(OPTIONS_FLAG_PREFIX)) return null;
	const rest = body.slice(OPTIONS_FLAG_PREFIX.length);
	const firstEquals = rest.indexOf('=');
	if (firstEquals <= 0) return null;
	const pluginId = rest.slice(0, firstEquals);
	const keyValue = rest.slice(firstEquals + 1);
	const secondEquals = keyValue.indexOf('=');
	if (secondEquals <= 0) return null;
	return {
		pluginId,
		key: keyValue.slice(0, secondEquals),
		value: keyValue.slice(secondEquals + 1),
	};
};

export const parseCliInvocation = (
	argv: readonly string[],
	cwd: string,
	twoPartCommands: ReadonlySet<string> = DEFAULT_TWO_PART_COMMANDS,
): IParsedCliInvocation => {
	const tokens: Record<string, string> = {};
	const extraOptions: Record<string, Record<string, unknown>> = {};
	const command: string[] = [];
	const commandArgs: string[] = [];
	let readingCommand = false;

	for (let index = 0; index < argv.length; ) {
		const token = argv[index];
		if (token === undefined) break;
		if (!readingCommand && token.startsWith('--')) {
			const body = token.slice(2);
			const optionOverride = parseExtraOptionFlag(body);
			if (optionOverride !== null) {
				const pluginOptions =
					(extraOptions[optionOverride.pluginId] ??= {});
				pluginOptions[optionOverride.key] = optionOverride.value;
				index += 1;
				continue;
			}
			const parsed = takeFlagValue(argv, index, body);
			tokens[parsed.key] = parsed.value;
			index += parsed.consumed;
			continue;
		}
		if (
			!readingCommand &&
			token.startsWith('-') &&
			token.length > 1 &&
			token !== '-'
		) {
			const short = token.slice(1);
			if (short === 'h') tokens.help = 'true';
			else if (short === 'v') tokens.version = 'true';
			else commandArgs.push(token);
			index += 1;
			continue;
		}
		readingCommand = true;
		if (command.length === 0 && !token.startsWith('-')) {
			command.push(token);
		} else if (
			command.length === 1 &&
			twoPartCommands.has(command[0] ?? '') &&
			!token.startsWith('-')
		) {
			command.push(token);
		} else {
			commandArgs.push(token);
		}
		index += 1;
	}

	for (let index = 0; index < commandArgs.length; index += 1) {
		const token = commandArgs[index];
		if (!token?.startsWith('--')) continue;
		const body = token.slice(2);
		const optionOverride = parseExtraOptionFlag(body);
		if (optionOverride !== null) {
			const pluginOptions =
				(extraOptions[optionOverride.pluginId] ??= {});
			pluginOptions[optionOverride.key] = optionOverride.value;
			commandArgs.splice(index, 1);
			index -= 1;
			continue;
		}
		const key = body.includes('=')
			? body.slice(0, body.indexOf('='))
			: body;
		if (
			!GLOBAL_FLAGS_WITH_VALUE.has(key) &&
			key !== 'json' &&
			key !== 'no-color'
		) {
			continue;
		}
		const parsed = takeFlagValue(commandArgs, index, body);
		tokens[parsed.key] = parsed.value;
		commandArgs.splice(index, parsed.consumed);
		index -= 1;
	}

	const format =
		tokens.format === 'json' || tokens.json === 'true' ? 'json' : 'text';
	// f00052: tri-state `--agent-worktree`. `--no-agent-worktree` and
	// `--agent-worktree=false` both mean false; a bare `--agent-worktree`
	// or `=true` means true; absence ⇒ undefined (host falls back to its
	// file config / `false` default).
	const agentWorktree = ((): boolean | undefined => {
		if (tokens['no-agent-worktree'] === 'true') return false;
		const raw = tokens['agent-worktree'];
		if (raw === undefined) return undefined;
		return raw !== 'false';
	})();
	const globals: ICliGlobalOptions = {
		workspace: resolve(cwd, tokens.workspace ?? '.'),
		remote: tokens.remote,
		json: format === 'json',
		format,
		lang: tokens.lang ?? 'en',
		noColor: tokens['no-color'] === 'true',
		plugins: splitList(tokens.plugins),
		preset: tokens.preset,
		config: tokens.config,
		extraOptions:
			Object.keys(extraOptions).length === 0 ? undefined : extraOptions,
		agentWorktree,
	};

	return {
		globals,
		commandPath: command,
		commandArgs,
		help:
			tokens.help === 'true' ||
			tokens.h === 'true' ||
			command[0] === 'help' ||
			command[0] === undefined,
		version: tokens.version === 'true' || tokens.v === 'true',
	};
};
