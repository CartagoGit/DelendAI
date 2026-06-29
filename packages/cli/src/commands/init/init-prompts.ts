/**
 * f00084 S2 — interactive prompts wrapper (readline-based, no external dep).
 *
 * One well-formed question per logical decision. Defaults are honoured
 * (Enter skips the question with the default answer). Unknown plugin
 * ids are rejected at the boundary by `init-answers.schema.ts` BEFORE the
 * prompt returns, so we never propagate a typo to the file system.
 *
 * Implementation notes:
 *
 *   - Uses Node's `readline` so the dependency surface stays at zero
 *     added packages. TTY-only; non-TTY runs (CI, piped) take the schema
 *     defaults path.
 *   - The module is pure (no IO, no `process.cwd()`); the resolved
 *     answers carry `workspaceRoot` from the caller.
 */
import { createInterface, type Interface as RLInterface } from 'node:readline';

import {
	INIT_VALID_PLUGIN_IDS,
	InitAnswers,
	type IInitAnswers,
} from './init-answers.schema';

const RESOLVED_PRESET_PLUGINS = new Map<string, readonly string[]>([
	['minimal', ['git', 'search']],
	[
		'standard',
		['git', 'search', 'memory', 'docs', 'rules', 'quality', 'deps'],
	],
	[
		'swarm',
		[
			'git',
			'search',
			'memory',
			'docs',
			'rules',
			'quality',
			'deps',
			'proposals',
			'notification',
			'logs',
			'status-marker',
			'test-convention',
			'conventions',
		],
	],
	[
		'full',
		[
			'git',
			'search',
			'memory',
			'docs',
			'rules',
			'quality',
			'deps',
			'proposals',
			'notification',
			'logs',
			'status-marker',
			'test-convention',
			'conventions',
			'web-fetch',
			'issues',
		],
	],
]);

const resolvedPluginsFor = (
	preset: IInitAnswers['preset'],
): readonly string[] => RESOLVED_PRESET_PLUGINS.get(preset) ?? [];

const dedupe = (items: readonly string[]): readonly string[] =>
	Array.from(new Set(items));

const isInteractive = (): boolean => Boolean(process.stdin.isTTY);

const openRl = (): RLInterface =>
	createInterface({ input: process.stdin, output: process.stderr });

const ask = (
	rl: RLInterface,
	question: string,
	fallback: string,
): Promise<string> =>
	new Promise((resolve) => {
		rl.question(`${question} [${fallback}]: `, (answer) => {
			resolve(answer.trim().length === 0 ? fallback : answer.trim());
		});
	});

const askConfirm = (
	rl: RLInterface,
	question: string,
	fallback: boolean,
): Promise<boolean> =>
	new Promise((resolve) => {
		rl.question(
			`${question} (y/n) [${fallback ? 'y' : 'n'}]: `,
			(answer) => {
				const trimmed = answer.trim().toLowerCase();
				if (trimmed.length === 0) return resolve(fallback);
				if (trimmed === 'y' || trimmed === 'yes') return resolve(true);
				if (trimmed === 'n' || trimmed === 'no') return resolve(false);
				resolve(fallback);
			},
		);
	});

const validatePluginId = (value: string): string | null => {
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	return INIT_VALID_PLUGIN_IDS.has(trimmed)
		? null
		: `Unknown plugin "${trimmed}". Valid ids: ${[...INIT_VALID_PLUGIN_IDS].sort().join(', ')}.`;
};

const askPlugin = async (
	rl: RLInterface,
	question: string,
): Promise<string | null> => {
	const answer = await ask(rl, question, '');
	const err = validatePluginId(answer);
	if (err !== null) {
		process.stderr.write(`✗ ${err}\n`);
		return askPlugin(rl, question);
	}
	return answer.length === 0 ? null : answer;
};

const collectPluginList = async (
	rl: RLInterface,
	firstQuestion: string,
): Promise<readonly string[]> => {
	const out: string[] = [];
	for (let i = 0; i < 32; i += 1) {
		const prompt =
			i === 0 ? firstQuestion : 'Add another plugin? (blank to finish)';
		const next = await askPlugin(rl, prompt);
		if (next === null) break;
		if (/^n(o)?$/i.test(next)) break;
		out.push(next);
	}
	return dedupe(out);
};

const askChoice = async <T extends string>(
	rl: RLInterface,
	question: string,
	choices: ReadonlyArray<{ label: string; value: T }>,
	defaultValue: T,
): Promise<T> => {
	for (let i = 0; i < choices.length; i += 1) {
		const c = choices[i];
		if (c === undefined) continue;
		process.stderr.write(`  ${i + 1}) ${c.label}\n`);
	}
	const answer = await ask(
		rl,
		`${question} (1-${choices.length})`,
		String(choices.findIndex((c) => c.value === defaultValue) + 1),
	);
	const idx = Number.parseInt(answer, 10);
	if (Number.isFinite(idx) && idx >= 1 && idx <= choices.length) {
		const chosen = choices[idx - 1];
		if (chosen !== undefined) return chosen.value;
	}
	return defaultValue;
};

export const collectInitAnswers = async (
	workspaceRoot: string,
	overrides: Partial<IInitAnswers> = {},
): Promise<IInitAnswers> => {
	if (!isInteractive()) {
		return InitAnswers.parse({ ...overrides, workspaceRoot });
	}

	const rl = openRl();
	try {
		const preset = await askChoice<
			'minimal' | 'standard' | 'swarm' | 'full'
		>(
			rl,
			'Which preset?',
			[
				{
					label: 'minimal — git + search (read-only)',
					value: 'minimal',
				},
				{ label: 'standard — single-agent toolkit', value: 'standard' },
				{
					label: 'swarm — multi-agent coordination (recommended)',
					value: 'swarm',
				},
				{ label: 'full — swarm + web-fetch + issues', value: 'full' },
			],
			'swarm',
		);

		const extraPlugins = await collectPluginList(
			rl,
			'Add plugin? (e.g. "audit", blank or "n" to finish)',
		);

		const basePlugins = resolvedPluginsFor(preset);
		const exclusionCandidates = basePlugins.filter(
			(p) => !extraPlugins.includes(p),
		);

		const excludedPlugins =
			exclusionCandidates.length === 0
				? []
				: await collectPluginList(
						rl,
						`Exclude any of: ${exclusionCandidates.join(', ')}? (blank to skip)`,
					);

		const hostInstructions = await askChoice<
			'append' | 'overwrite' | 'skip'
		>(
			rl,
			'How to centralize host-instructions?',
			[
				{
					label: 'append — safe, idempotent (recommended)',
					value: 'append',
				},
				{ label: 'overwrite — destructive', value: 'overwrite' },
				{ label: 'skip — write nothing', value: 'skip' },
			],
			'append',
		);

		const copyCoreSkills = await askConfirm(
			rl,
			'Copy core skills into docs/mcp-vertex/skills/?',
			true,
		);

		const generateAgentMd = await askConfirm(
			rl,
			'Generate .github/agents/mcp-vertex-*.agent.md from the live catalog?',
			true,
		);

		const migrateFromLegacy =
			basePlugins.includes('proposals') ||
			extraPlugins.includes('proposals')
				? await askConfirm(
						rl,
						'Scaffold the first migration proposal (f00001-migrate-legacy-*.md)?',
						true,
					)
				: false;

		return InitAnswers.parse({
			preset,
			extraPlugins,
			excludedPlugins,
			hostInstructions,
			copyCoreSkills,
			generateAgentMd,
			migrateFromLegacy,
			workspaceRoot,
			...overrides,
		});
	} finally {
		rl.close();
	}
};
