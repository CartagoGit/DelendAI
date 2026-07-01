/**
 * f00084 S2 — interactive prompts wrapper (readline-based, no external dep).
 *
 * One well-formed question per logical decision. Defaults are honoured
 * (Enter skips the question with the default answer). Unknown plugin
 * ids are rejected at the boundary by `init-answers.schema.ts` BEFORE the
 * prompt returns, so we never propagate a typo to the file system.
 *
 * The plugin menu is derived live from `PRESET_CATALOG` via
 * `resolvePresetMembers` — adding or removing a plugin in the core
 * catalog re-shapes the prompts automatically, no code change here.
 */
import { createInterface, type Interface as RLInterface } from 'node:readline';

import {
	PRESET_KIND,
	resolvePresetMembers,
	type IPresetKind,
} from '@mcp-vertex/core/public';

import {
	INIT_VALID_PLUGIN_IDS,
	InitAnswers,
	type IInitAnswers,
} from './init-answers.schema';
import { c, heading, hint, brand, success, failure } from '../../lib/color';

const numbered = (n: number, text: string): string =>
	`${c.cyan(`${n})`)} ${text}`;
const bullet = (text: string): string => `${c.gray('›')} ${text}`;

const ALL_PRESET_PLUGINS: ReadonlySet<string> = (() => {
	const ids = new Set<string>();
	for (const preset of PRESET_KIND) {
		for (const id of resolvePresetMembers(preset)) ids.add(id);
	}
	return ids;
})();

const PLUGINS_ADDABLE: ReadonlySet<string> = (() => {
	const out = new Set(ALL_PRESET_PLUGINS);
	out.add('audit');
	return out;
})();

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
		process.stderr.write(`${failure(err)}\n`);
		return askPlugin(rl, question);
	}
	return answer.length === 0 ? null : answer;
};

const collectPluginList = async (
	rl: RLInterface,
	firstQuestion: string,
	candidates: readonly string[],
): Promise<readonly string[]> => {
	if (candidates.length > 0) {
		process.stderr.write(
			`  ${hint('addable plugins:')} ${brand(candidates.join(', '))}\n`,
		);
	}
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

const collectStringList = async (
	rl: RLInterface,
	firstQuestion: string,
	nextQuestion: string,
	itemLabel: string,
): Promise<readonly string[]> => {
	const out: string[] = [];
	for (let i = 0; i < 32; i += 1) {
		const prompt = i === 0 ? firstQuestion : nextQuestion;
		const next = await ask(rl, prompt, '');
		if (next.length === 0) break;
		if (/^n(o)?$/i.test(next)) break;
		out.push(next);
	}
	if (out.length > 0) {
		process.stderr.write(
			`${success(`${itemLabel} collected`)} ${hint(`(${brand(String(out.length))})`)}\n`,
		);
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
		process.stderr.write(`  ${numbered(i + 1, c.label)}\n`);
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

const diff = <T>(a: readonly T[], b: ReadonlySet<T>): readonly T[] =>
	a.filter((x) => !b.has(x));

export const collectInitAnswers = async (
	workspaceRoot: string,
	overrides: Partial<IInitAnswers> = {},
): Promise<IInitAnswers> => {
	if (!isInteractive()) {
		return InitAnswers.parse({ ...overrides, workspaceRoot });
	}

	// Brand banner — non-fatal if the user has `NO_COLOR` set, the
	// helpers are passthroughs in that mode.
	process.stderr.write(
		`\n${brand('mcp-vertex')} ${hint('›')} ${heading('workspace bootstrap')}\n\n`,
	);

	// f00088 S1: surface the detection summary at the top of the
	// prompt flow so the operator sees what was detected before any
	// question renders. Falls back to a neutral line when detection
	// did not run (older code paths).
	if (overrides.detected !== undefined) {
		const d = overrides.detected;
		const parts: string[] = [d.language];
		if (d.framework !== undefined) parts.push(d.framework);
		parts.push(d.packageManager);
		if (d.monorepoTool !== undefined) parts.push(d.monorepoTool);
		process.stderr.write(
			`${success('detected')} ${hint('›')} ${brand(parts.join(' + '))}\n`,
		);
		if (d.hasMcpProject) {
			process.stderr.write(
				`${hint('  existing MCP evidence: ')} ${brand(d.mcpEvidence.join(', ') || 'unknown')}\n`,
			);
		}
		process.stderr.write(
			`${hint('  plugin paths root: ')} ${brand(d.pluginPathsRoot)}${hint(' (override with --plugin-paths-root=<path>)')}\n`,
		);
		process.stderr.write('\n');
	}

	const rl = openRl();
	try {
		const preset = await askChoice<IPresetKind>(
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
				{
					label: 'vertex — snapshot of mcp-vertex itself (recommended for your own projects)',
					value: 'vertex',
				},
			],
			'vertex',
		);

		// Dynamic menu: the catalog-wide union minus the preset's own
		// members. `audit` is always addable (opt-in, outside the
		// canonical chain).
		const presetMembers = resolvePresetMembers(preset);
		const addable = dedupe([
			...diff([...PLUGINS_ADDABLE], new Set(presetMembers)),
			'audit',
		]);

		const extraPlugins = await collectPluginList(
			rl,
			'Add plugin? (e.g. one of the addable plugins below, blank or "n" to finish)',
			addable,
		);

		// Exclusions: only the opt-in additions are real choices to
		// exclude. Preset members are implicit and cannot be turned off
		// without changing the preset itself.
		const addedByUser = extraPlugins.filter(
			(id) => !presetMembers.includes(id),
		);
		const excludedPlugins =
			addedByUser.length === 0
				? []
				: await collectPluginList(
						rl,
						'Exclude any of the opt-in plugins you just added? (blank to skip)',
						addedByUser,
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

		const resolved = dedupe([...presetMembers, ...extraPlugins]);
		const migrateFromLegacy = resolved.includes('proposals')
			? await askConfirm(
					rl,
					'Scaffold the first migration proposal (f00001-migrate-legacy-*.md)?',
					true,
				)
			: false;

		const resolvedAfterExclusions = resolved.filter(
			(plugin) => !excludedPlugins.includes(plugin),
		);

		const issuesRepo =
			resolvedAfterExclusions.includes('issues') &&
			overrides.issuesRepo === undefined
				? await ask(
						rl,
						'GitHub issues repo (owner/name) — leave blank to skip:',
						'',
					)
				: overrides.issuesRepo;

		const webFetchAllowList =
			resolvedAfterExclusions.includes('web-fetch') &&
			overrides.webFetchAllowList === undefined
				? await collectStringList(
						rl,
						'Add web-fetch hostname to allow-list? (blank or "n" to finish)',
						'Add another hostname? (blank or "n" to finish)',
						'hostnames',
					)
				: overrides.webFetchAllowList;

		const answers = InitAnswers.parse({
			preset,
			extraPlugins,
			excludedPlugins,
			hostInstructions,
			copyCoreSkills,
			generateAgentMd,
			migrateFromLegacy,
			issuesRepo: issuesRepo === '' ? undefined : issuesRepo,
			webFetchAllowList,
			workspaceRoot,
			...overrides,
		});

		process.stderr.write(
			`\n${success('answers collected')} ${hint(
				`(${brand(answers.preset)} · ${answers.extraPlugins.length} extra · host-instructions: ${answers.hostInstructions})`,
			)}\n\n`,
		);

		return answers;
	} finally {
		rl.close();
	}
};
