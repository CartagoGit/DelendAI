/**
 * global-config.migrator.spec.ts — b00239 S5.
 *
 * Pins the migrator's contract against the acceptance
 * bullets the proposal's S5 section enumerates:
 *
 *   1. "A global entry is touched only when its association to the
 *       workspace being migrated is provable; one test uses two
 *       projects and modifies only one of them."
 *   2. "No code path writes into the home directory outside the
 *       entries whose ownership was proved."
 *
 * The migrator's IO is parameterised so the suite runs entirely
 * against in-memory fixtures — no real `$HOME` is touched, and
 * the IO spy records every path that crossed the adapter so
 * tests can assert "the migrator wrote exactly these files and
 * no others".
 *
 * End-to-end coverage at the bottom of the file exercises a
 * tmpdir-backed fake `~/.claude.json` and `~/.codex/config.toml`
 * so the parser / serializer round trips are pinned against real
 * on-disk semantics, not just against the in-memory adapter.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	GLOBAL_CONFIG_MIGRATOR_ID,
	applyGlobalConfig,
	createGlobalConfigMigrator,
	createInMemoryHostConfigIO,
	detectGlobalConfig,
	planGlobalConfig,
} from '@delendai/core/lib/workspace-migration/host-scope/global-config.migrator';

import { isOwnedByWorkspace } from '@delendai/core/lib/workspace-migration/host-scope/workspace-ownership';

const OWNED = '/srv/projects/acme';
const FOREIGN = '/srv/projects/other';

const LEGACY = 'mcp-vertex';
const NEW = 'delendai';

/**
 * Parse one `[projects."..."]` section from a Codex-style TOML
 * string into the record the migrator would see. The migrator's
 * own parsers live in the production module; this helper just
 * reads enough TOML for the e2e assertions to be semantic, not
 * byte-level (TOML inline tables don't round-trip byte-identical
 * because the serializer drops redundant quotes).
 */
const parseCodexSection = (
	raw: string,
	header: string,
): Record<string, unknown> => {
	const headerIndex = raw.indexOf(header);
	if (headerIndex === -1) return {};
	const after = raw.slice(headerIndex + header.length);
	const nextHeader = after.search(/^\s*\[/mu);
	const body = nextHeader === -1 ? after : after.slice(0, nextHeader);
	const lines = body.split(/\r?\n/u);
	const out: Record<string, unknown> = {};
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) continue;
		const eq = findTopLevelEquals(trimmed);
		if (eq === -1) continue;
		const key = trimmed
			.slice(0, eq)
			.trim()
			.replace(/^["']|["']$/gu, '');
		const rawValue = trimmed.slice(eq + 1).trim();
		out[key] = parseCodexTestScalar(rawValue);
	}
	return out;
};

const findTopLevelEquals = (pair: string): number => {
	let depth = 0;
	let inString: false | '"' | "'" = false;
	for (let index = 0; index < pair.length; index += 1) {
		const ch = pair[index];
		if (inString !== false) {
			if (ch === inString && pair[index - 1] !== '\\') inString = false;
			continue;
		}
		if (ch === '"' || ch === "'") {
			inString = ch;
			continue;
		}
		if (ch === '{' || ch === '[') depth += 1;
		else if (ch === '}' || ch === ']') depth -= 1;
		else if (ch === '=' && depth === 0) return index;
	}
	return -1;
};

const parseCodexTestScalar = (raw: string): unknown => {
	const trimmed = raw.trim();
	if (trimmed === 'true') return true;
	if (trimmed === 'false') return false;
	if (/^"[^"]*"$/u.test(trimmed)) return trimmed.slice(1, -1);
	if (/^'[^']*'$/u.test(trimmed)) return trimmed.slice(1, -1);
	if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
		return parseCodexTestInlineTable(trimmed);
	}
	return trimmed;
};

const parseCodexTestInlineTable = (text: string): Record<string, unknown> => {
	const inner = text.slice(1, -1).trim();
	if (inner === '') return {};
	const result: Record<string, unknown> = {};
	let depth = 0;
	let inString: false | '"' | "'" = false;
	let start = 0;
	for (let index = 0; index < inner.length; index += 1) {
		const ch = inner[index];
		if (inString !== false) {
			if (ch === inString && inner[index - 1] !== '\\') inString = false;
			continue;
		}
		if (ch === '"' || ch === "'") {
			inString = ch;
			continue;
		}
		if (ch === '{' || ch === '[') depth += 1;
		else if (ch === '}' || ch === ']') depth -= 1;
		else if (ch === ',' && depth === 0) {
			const pair = inner.slice(start, index);
			const eq = findTopLevelEquals(pair);
			if (eq !== -1) {
				const k = pair
					.slice(0, eq)
					.trim()
					.replace(/^["']|["']$/gu, '');
				result[k] = parseCodexTestScalar(pair.slice(eq + 1).trim());
			}
			start = index + 1;
		}
	}
	const last = inner.slice(start);
	if (last.trim() !== '') {
		const eq = findTopLevelEquals(last);
		if (eq !== -1) {
			const k = last
				.slice(0, eq)
				.trim()
				.replace(/^["']|["']$/gu, '');
			result[k] = parseCodexTestScalar(last.slice(eq + 1).trim());
		}
	}
	return result;
};

// ───────────────────────────────────────────────────────────────────────────
// Two-projects, one-workspace — the canonical S5 acceptance scenario
// ───────────────────────────────────────────────────────────────────────────

describe('applyGlobalConfig — two projects, one owned', () => {
	it('rewrites the owned project and leaves the foreign project byte-for-byte untouched', async () => {
		const io = createInMemoryHostConfigIO({
			[join(OWNED, '.claude.json')]: `${JSON.stringify(
				{
					projects: {
						[OWNED]: {
							mcpServers: {
								[LEGACY]: { command: LEGACY, cwd: OWNED },
							},
						},
						[FOREIGN]: {
							mcpServers: {
								[LEGACY]: { command: LEGACY, cwd: FOREIGN },
							},
						},
					},
				},
				null,
				'\t',
			)}\n`,
		});
		const spec = {
			host: 'claude' as const,
			path: join(OWNED, '.claude.json'),
		};
		const before = await io.read(spec.path);

		const report = await applyGlobalConfig({
			workspaceRoot: OWNED,
			hostConfigs: [spec],
			io,
		});

		expect(report.rewritten.map((entry) => entry.projectKey)).toEqual([
			OWNED,
		]);
		// Foreign entries are invisible: the migrator never
		// considers them for rewriting, so they never appear in
		// either `rewritten` or `untouched`.
		expect(report.untouched).toEqual([]);
		expect(report.writtenFiles).toEqual([spec.path]);

		const after = await io.read(spec.path);
		const parsed = JSON.parse(after) as {
			projects: Record<
				string,
				{ mcpServers: Record<string, { command: string }> }
			>;
		};

		// The owned entry was rewritten.
		expect(Object.keys(parsed.projects[OWNED]!.mcpServers)).toEqual([NEW]);
		expect(parsed.projects[OWNED]!.mcpServers[NEW]!.command).toBe(NEW);

		// The foreign entry is byte-for-byte identical.
		const beforeParsed = JSON.parse(before) as typeof parsed;
		expect(parsed.projects[FOREIGN]).toEqual(
			beforeParsed.projects[FOREIGN],
		);
	});

	it('does not write the file when no owned entry carries the legacy identity', async () => {
		const io = createInMemoryHostConfigIO({
			[join(OWNED, '.claude.json')]: `${JSON.stringify(
				{
					projects: {
						[OWNED]: {
							mcpServers: {
								[NEW]: { command: NEW, cwd: OWNED },
							},
						},
						[FOREIGN]: {
							mcpServers: {
								[NEW]: { command: NEW, cwd: FOREIGN },
							},
						},
					},
				},
				null,
				'\t',
			)}\n`,
		});
		const spec = {
			host: 'claude' as const,
			path: join(OWNED, '.claude.json'),
		};

		const report = await applyGlobalConfig({
			workspaceRoot: OWNED,
			hostConfigs: [spec],
			io,
		});

		// No rewrite happened, so no file was written. The owned
		// entry surfaces under `untouched` because the migrator
		// considered it (the predicate accepted) but the rewrite
		// would have been a no-op. The foreign entry is invisible.
		expect(report.rewritten).toEqual([]);
		expect(report.untouched.map((entry) => entry.projectKey)).toEqual([
			OWNED,
		]);
		expect(report.writtenFiles).toEqual([]);
		expect(report.skippedFiles).toEqual([spec.path]);
		expect(io.writtenPaths()).toEqual([]);
	});

	it('writes nothing when no host config exists on disk', async () => {
		const io = createInMemoryHostConfigIO({});
		const spec = {
			host: 'claude' as const,
			path: join(OWNED, '.claude.json'),
		};
		const report = await applyGlobalConfig({
			workspaceRoot: OWNED,
			hostConfigs: [spec],
			io,
		});
		expect(report.writtenFiles).toEqual([]);
		expect(report.skippedFiles).toEqual([spec.path]);
		expect(io.writtenPaths()).toEqual([]);
	});
});

// ───────────────────────────────────────────────────────────────────────────
// IO containment — the second acceptance bullet
// ───────────────────────────────────────────────────────────────────────────

describe('applyGlobalConfig — IO containment', () => {
	it('writes only to host config paths declared in `hostConfigs`', async () => {
		const homedir = '/home/tester';
		const io = createInMemoryHostConfigIO({
			// Two host configs: only the Claude one carries legacy identity.
			[`${homedir}/.claude.json`]: `${JSON.stringify(
				{
					projects: {
						[OWNED]: {
							mcpServers: {
								[LEGACY]: { command: LEGACY, cwd: OWNED },
							},
						},
					},
				},
				null,
				'\t',
			)}\n`,
			[`${homedir}/.codex/config.toml`]: [
				`[projects."${FOREIGN}"]`,
				'trust_level = "trusted"',
				'',
			].join('\n'),
			// A file outside the declared host configs. The migrator must
			// never touch this.
			[`${homedir}/.some-other-config.json`]: '{"must": "stay"}',
		});

		const report = await applyGlobalConfig({
			workspaceRoot: OWNED,
			hostConfigs: [
				{ host: 'claude', path: `${homedir}/.claude.json` },
				{ host: 'codex', path: `${homedir}/.codex/config.toml` },
			],
			io,
		});

		expect(report.writtenFiles).toEqual([`${homedir}/.claude.json`]);
		expect(report.skippedFiles).toEqual([`${homedir}/.codex/config.toml`]);

		const writtenPaths = io.writtenPaths();
		expect(writtenPaths).toEqual([`${homedir}/.claude.json`]);

		const untouched = await io.read(`${homedir}/.some-other-config.json`);
		expect(untouched).toBe('{"must": "stay"}');
	});

	it('writes the Codex config only when an owned entry there needs rewriting', async () => {
		const homedir = '/home/tester';
		const io = createInMemoryHostConfigIO({
			[`${homedir}/.codex/config.toml`]: [
				`[projects."${OWNED}"]`,
				'trust_level = "trusted"',
				'',
			].join('\n'),
		});

		const report = await applyGlobalConfig({
			workspaceRoot: OWNED,
			hostConfigs: [
				{ host: 'codex', path: `${homedir}/.codex/config.toml` },
			],
			io,
		});

		// Owned entry but no legacy identity → file skipped, no writes.
		expect(report.writtenFiles).toEqual([]);
		expect(report.skippedFiles).toEqual([`${homedir}/.codex/config.toml`]);
		expect(io.writtenPaths()).toEqual([]);
	});
});

// ───────────────────────────────────────────────────────────────────────────
// planGlobalConfig + detectGlobalConfig — the engine's pre-apply surface
// ───────────────────────────────────────────────────────────────────────────

describe('planGlobalConfig — emits one step per owned-and-legacy entry', () => {
	it('returns empty when no host config exists', async () => {
		const io = createInMemoryHostConfigIO({});
		const steps = await planGlobalConfig({
			workspaceRoot: OWNED,
			hostConfigs: [{ host: 'claude', path: '/no/such/file' }],
			io,
		});
		expect(steps).toEqual([]);
	});

	it('skips unowned entries entirely', async () => {
		const io = createInMemoryHostConfigIO({
			'/homedir/.claude.json': `${JSON.stringify(
				{
					projects: {
						[FOREIGN]: {
							mcpServers: {
								[LEGACY]: { command: LEGACY, cwd: FOREIGN },
							},
						},
					},
				},
				null,
				'\t',
			)}\n`,
		});
		const steps = await planGlobalConfig({
			workspaceRoot: OWNED,
			hostConfigs: [{ host: 'claude', path: '/homedir/.claude.json' }],
			io,
		});
		expect(steps).toEqual([]);
	});

	it('emits one step per owned legacy entry', async () => {
		const io = createInMemoryHostConfigIO({
			'/homedir/.claude.json': `${JSON.stringify(
				{
					projects: {
						[OWNED]: {
							mcpServers: {
								[LEGACY]: { command: LEGACY, cwd: OWNED },
							},
						},
					},
				},
				null,
				'\t',
			)}\n`,
		});
		const steps = await planGlobalConfig({
			workspaceRoot: OWNED,
			hostConfigs: [{ host: 'claude', path: '/homedir/.claude.json' }],
			io,
		});
		expect(steps).toHaveLength(1);
		expect(steps[0]?.kind).toBe('rewrite-global-host-entry');
		expect(steps[0]?.detail).toContain(OWNED);
		expect(steps[0]?.detail).toContain('map-key');
	});
});

describe('detectGlobalConfig', () => {
	it('returns false when no host config file exists', async () => {
		const io = createInMemoryHostConfigIO({});
		expect(
			await detectGlobalConfig({
				workspaceRoot: OWNED,
				hostConfigs: [
					{ host: 'claude', path: '/no/such/claude.json' },
					{ host: 'codex', path: '/no/such/codex.toml' },
				],
				io,
			}),
		).toBe(false);
	});

	it('returns true as soon as one host config exists', async () => {
		const io = createInMemoryHostConfigIO({
			'/homedir/.codex/config.toml': '',
		});
		expect(
			await detectGlobalConfig({
				workspaceRoot: OWNED,
				hostConfigs: [
					{ host: 'claude', path: '/homedir/.claude.json' },
					{ host: 'codex', path: '/homedir/.codex/config.toml' },
				],
				io,
			}),
		).toBe(true);
	});
});

// ───────────────────────────────────────────────────────────────────────────
// IMigration factory — wires the engine seam
// ───────────────────────────────────────────────────────────────────────────

describe('createGlobalConfigMigrator — IMigration contract', () => {
	it('uses the stable id the journal records', () => {
		const migrator = createGlobalConfigMigrator({
			workspaceRoot: OWNED,
			hostConfigs: [],
			io: createInMemoryHostConfigIO({}),
		});
		expect(migrator.id).toBe(GLOBAL_CONFIG_MIGRATOR_ID);
	});

	it('delegates detect to detectGlobalConfig', async () => {
		const io = createInMemoryHostConfigIO({});
		const migrator = createGlobalConfigMigrator({
			workspaceRoot: OWNED,
			hostConfigs: [{ host: 'claude', path: '/missing.json' }],
			io,
		});
		expect(
			await migrator.detect({ workspaceRoot: OWNED, dryRun: false }),
		).toBe(false);
	});

	it('apply is a no-op when ctx.dryRun is true', async () => {
		const io = createInMemoryHostConfigIO({
			'/homedir/.claude.json': `${JSON.stringify(
				{
					projects: {
						[OWNED]: {
							mcpServers: {
								[LEGACY]: { command: LEGACY, cwd: OWNED },
							},
						},
					},
				},
				null,
				'\t',
			)}\n`,
		});
		const migrator = createGlobalConfigMigrator({
			workspaceRoot: OWNED,
			hostConfigs: [{ host: 'claude', path: '/homedir/.claude.json' }],
			io,
		});
		await migrator.apply({ workspaceRoot: OWNED, dryRun: true });
		expect(io.writtenPaths()).toEqual([]);
	});
});

// ───────────────────────────────────────────────────────────────────────────
// Predicate ↔ migrator integration — exercise the public surface both ways
// ───────────────────────────────────────────────────────────────────────────

describe('migrator + predicate — ownership gates the rewrite', () => {
	it('foreign entries with shared substring do NOT get rewritten', async () => {
		// /srv/projects/acme-legacy shares a prefix with
		// /srv/projects/acme. The migrator must leave the
		// foreign entry alone because path-anchored matching
		// refuses substring matches.
		const io = createInMemoryHostConfigIO({
			'/homedir/.claude.json': `${JSON.stringify(
				{
					projects: {
						[`${OWNED}-legacy`]: {
							mcpServers: {
								[LEGACY]: {
									command: LEGACY,
									cwd: `${OWNED}-legacy`,
								},
							},
						},
					},
				},
				null,
				'\t',
			)}\n`,
		});

		const report = await applyGlobalConfig({
			workspaceRoot: OWNED,
			hostConfigs: [{ host: 'claude', path: '/homedir/.claude.json' }],
			io,
		});

		expect(report.rewritten).toEqual([]);
		// Foreign entry is invisible (never listed in either bucket).
		expect(report.untouched).toEqual([]);
		expect(report.writtenFiles).toEqual([]);

		const after = JSON.parse(await io.read('/homedir/.claude.json')) as {
			projects: Record<
				string,
				{ mcpServers: Record<string, { command: string }> }
			>;
		};
		expect(
			after.projects[`${OWNED}-legacy`]?.mcpServers[LEGACY]?.command,
		).toBe(LEGACY);
	});

	it('ambiguous entries (no path at all) are skipped', async () => {
		const io = createInMemoryHostConfigIO({
			'/homedir/.claude.json': `${JSON.stringify(
				{
					projects: {
						'ambiguous-key': { trust_level: 'trusted' },
					},
				},
				null,
				'\t',
			)}\n`,
		});

		const report = await applyGlobalConfig({
			workspaceRoot: OWNED,
			hostConfigs: [{ host: 'claude', path: '/homedir/.claude.json' }],
			io,
		});

		expect(report.rewritten).toEqual([]);
		expect(report.untouched).toEqual([]);
		expect(report.writtenFiles).toEqual([]);

		// Predicate-level check: the same entry is rejected at
		// the predicate boundary too.
		expect(
			isOwnedByWorkspace(
				{ key: 'ambiguous-key', value: { trust_level: 'trusted' } },
				OWNED,
			),
		).toBe(false);
	});
});

// ───────────────────────────────────────────────────────────────────────────
// End-to-end against a tmpdir — exercise the parsers + writers + IO adapter
// ───────────────────────────────────────────────────────────────────────────

describe('applyGlobalConfig — end-to-end against tmpdir', () => {
	let workspaceRoot: string;
	let homedir: string;

	beforeEach(async () => {
		workspaceRoot = await mkdtemp(join(tmpdir(), 'b00239-s5-e2e-'));
		homedir = await mkdtemp(join(tmpdir(), 'b00239-s5-home-'));
		await mkdir(join(homedir, '.codex'), { recursive: true });
	});

	afterEach(async () => {
		await rm(workspaceRoot, { recursive: true, force: true });
		await rm(homedir, { recursive: true, force: true });
	});

	const writeHome = async (
		relPath: string,
		contents: string,
	): Promise<string> => {
		const absolute = join(homedir, relPath);
		await mkdir(join(absolute, '..'), { recursive: true });
		await writeFile(absolute, contents, 'utf8');
		return absolute;
	};

	it('rewrites Claude + Codex entries that belong to the workspace and leaves the rest alone', async () => {
		const claudePath = await writeHome(
			'.claude.json',
			`${JSON.stringify(
				{
					oauthAccount: { sub: 'preserve-me' },
					projects: {
						[workspaceRoot]: {
							mcpServers: {
								[LEGACY]: {
									command: LEGACY,
									cwd: workspaceRoot,
								},
							},
						},
						[FOREIGN]: {
							mcpServers: {
								[LEGACY]: { command: LEGACY, cwd: FOREIGN },
							},
						},
					},
				},
				null,
				'\t',
			)}\n`,
		);
		const codexPath = await writeHome(
			'.codex/config.toml',
			[
				`[projects."${workspaceRoot}"]`,
				`mcp_servers = { "${LEGACY}" = { command = "${LEGACY}" } }`,
				'',
				`[projects."${FOREIGN}"]`,
				`mcp_servers = { "${LEGACY}" = { command = "${LEGACY}" } }`,
				'',
			].join('\n'),
		);

		const beforeClaude = await readFile(claudePath, 'utf8');
		const beforeCodex = await readFile(codexPath, 'utf8');

		// Import the real-fs adapter only inside this spec, so unit
		// tests above never touch the filesystem.
		const { createFileSystemHostConfigIO } = await import(
			'@delendai/core/lib/workspace-migration/host-scope/global-config.migrator'
		);
		const io = createFileSystemHostConfigIO();

		const report = await applyGlobalConfig({
			workspaceRoot,
			hostConfigs: [
				{ host: 'claude', path: claudePath },
				{ host: 'codex', path: codexPath },
			],
			io,
		});

		// Both files were written back, both with one rewritten entry.
		expect(report.writtenFiles).toEqual([claudePath, codexPath]);
		expect(report.skippedFiles).toEqual([]);
		expect(report.rewritten.map((entry) => entry.projectKey)).toEqual([
			workspaceRoot,
			workspaceRoot,
		]);

		const afterClaude = await readFile(claudePath, 'utf8');
		const afterCodex = await readFile(codexPath, 'utf8');

		// Foreign entries are byte-for-byte untouched (still legacy).
		const claudeParsed = JSON.parse(afterClaude) as {
			oauthAccount: { sub: string };
			projects: Record<
				string,
				{ mcpServers: Record<string, { command: string }> }
			>;
		};
		// Claude: the oauthAccount top-level field survived (it was not
		// under `projects`, so the migrator left it alone even though
		// the file was rewritten).
		expect(claudeParsed.oauthAccount.sub).toBe('preserve-me');
		expect(
			Object.keys(claudeParsed.projects[workspaceRoot]!.mcpServers),
		).toEqual([NEW]);
		expect(
			claudeParsed.projects[FOREIGN]?.mcpServers[LEGACY]?.command,
		).toBe(LEGACY);

		// Codex: the foreign entry is semantically unchanged; the
		// owned entry was rewritten. We assert on the parsed
		// records (TOML inline tables do not round-trip
		// byte-identically because the serializer drops quotes
		// around keys that don't need them — but the data must
		// agree).
		const beforeForeignCodex = parseCodexSection(
			beforeCodex,
			`[projects."${FOREIGN}"]`,
		);
		const afterForeignCodex = parseCodexSection(
			afterCodex,
			`[projects."${FOREIGN}"]`,
		);
		expect(afterForeignCodex).toEqual(beforeForeignCodex);

		// The owned section in the output carries `delendai`, not
		// `mcp-vertex`.
		const afterOwnedCodex = parseCodexSection(
			afterCodex,
			`[projects."${workspaceRoot}"]`,
		);
		const beforeOwnedCodex = parseCodexSection(
			beforeCodex,
			`[projects."${workspaceRoot}"]`,
		);
		expect(afterOwnedCodex).not.toEqual(beforeOwnedCodex);
		expect(JSON.stringify(afterOwnedCodex)).toContain('delendai');
		expect(JSON.stringify(afterOwnedCodex)).not.toContain('mcp-vertex');

		// Sanity: the file as a whole did change (the owned section was
		// rewritten), so `beforeCodex !== afterCodex`.
		expect(afterCodex).not.toBe(beforeCodex);

		// And the foreign section in Claude is also unchanged (the
		// rewrite of the owned section does not bleed into the
		// foreign one).
		const beforeForeignClaude = JSON.parse(beforeClaude) as {
			projects: Record<
				string,
				{ mcpServers: Record<string, { command: string }> }
			>;
		};
		expect(claudeParsed.projects[FOREIGN]).toEqual(
			beforeForeignClaude.projects[FOREIGN],
		);
	});

	it('reports a parse failure when a Claude config file is malformed', async () => {
		const claudePath = await writeHome('.claude.json', '{not-valid-json');
		const { createFileSystemHostConfigIO, GlobalConfigParseError } =
			await import(
				'@delendai/core/lib/workspace-migration/host-scope/global-config.migrator'
			);
		const io = createFileSystemHostConfigIO();
		await expect(
			applyGlobalConfig({
				workspaceRoot,
				hostConfigs: [{ host: 'claude', path: claudePath }],
				io,
			}),
		).rejects.toBeInstanceOf(GlobalConfigParseError);
	});

	it('does nothing when both host configs are absent from disk', async () => {
		const { createFileSystemHostConfigIO } = await import(
			'@delendai/core/lib/workspace-migration/host-scope/global-config.migrator'
		);
		const io = createFileSystemHostConfigIO();
		const report = await applyGlobalConfig({
			workspaceRoot,
			hostConfigs: [
				{ host: 'claude', path: join(homedir, '.claude.json') },
				{ host: 'codex', path: join(homedir, '.codex/config.toml') },
			],
			io,
		});
		expect(report.writtenFiles).toEqual([]);
		expect(report.skippedFiles).toEqual([
			join(homedir, '.claude.json'),
			join(homedir, '.codex/config.toml'),
		]);
	});
});
