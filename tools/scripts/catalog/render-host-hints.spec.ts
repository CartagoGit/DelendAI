#!/usr/bin/env bun
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	DEFAULT_INPUT_PATH,
	DEFAULT_OUTPUT_DIR,
	MAX_FRAGMENT_BYTES,
	renderHostHints,
	runHostHintsCli,
} from './render-host-hints.script.ts';
import type { IArtifactLike } from './render-host-hints.script.ts';

const FIXED_NOW = '2026-06-27T12:00:00.000Z';

const buildArtifact = (
	overrides: Partial<IArtifactLike> = {},
): IArtifactLike => ({
	generatedAt: FIXED_NOW,
	tools: [
		{ name: 'mcp-vertex_overview', plugin: 'mcp-vertex' },
		{ name: 'mcp-vertex_agent_catalog', plugin: 'mcp-vertex' },
	],
	skills: [
		{
			id: 'mcp-vertex-operator',
			summary:
				'Use at session start to call overview first and choose the right preset.',
			tags: ['operator'],
			appliesTo: ['@mcp-vertex/*'],
		},
		{
			id: 'mcp-vertex-plugin-authoring',
			summary:
				'Use when adding or changing a plugin so schemas and durability stay correct.',
			tags: ['plugin-authoring'],
			appliesTo: ['@mcp-vertex/*'],
		},
	],
	proposals: {
		actionable: [
			{
				id: 'f00056',
				title: 'Agent discovery catalog',
				track: 'host+extension+skills+docs',
				status: 'ready',
				kind: 'feat',
				date: '2026-06-25',
			},
			{
				id: 'f00057',
				title: 'Cross-IDE bootstrap',
				track: 'host',
				status: 'ready',
				kind: 'feat',
				date: '2026-06-25',
			},
		],
		byStatus: {
			ready: 2,
			'in-progress': 0,
			review: 0,
			paused: 0,
			done: 0,
			blocked: 0,
			retired: 0,
			unspecified: 0,
		},
	},
	...overrides,
});

const testIo = (overrides: Record<string, unknown> = {}) => ({
	readText: async (absPath: string) => {
		try {
			return await readFile(absPath, 'utf8');
		} catch {
			return undefined;
		}
	},
	writeText: async (absPath: string, text: string) => {
		await writeFile(absPath, text, 'utf8');
	},
	removeFile: async (absPath: string) => {
		await rm(absPath, { force: true });
	},
	ensureDir: async (absPath: string) => {
		await mkdir(absPath, { recursive: true });
	},
	info: () => {},
	warn: () => {},
	error: () => {},
	...overrides,
});

const createFixtureRoot = async (
	artifact: IArtifactLike = buildArtifact(),
): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'host-hints-'));
	await mkdir(join(root, DEFAULT_OUTPUT_DIR), { recursive: true });
	await mkdir(join(root, 'docs/mcp-vertex'), { recursive: true });
	await writeFile(
		join(root, DEFAULT_INPUT_PATH),
		`${JSON.stringify(artifact, null, '\t')}\n`,
		'utf8',
	);
	return root;
};

const withFixture = async (
	callback: (root: string) => Promise<void>,
	artifact: IArtifactLike = buildArtifact(),
): Promise<void> => {
	const root = await createFixtureRoot(artifact);
	try {
		await callback(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

describe('render-host-hints script', async () => {
	it('renders the canonical first-move block in every fragment', () => {
		const result = renderHostHints({ artifact: buildArtifact() });
		expect(result.fragments).toHaveLength(3);
		for (const fragment of result.fragments) {
			expect(fragment.text).toContain(
				'`mcp-vertex_overview { compact: true } -> mcp-vertex_agent_catalog`',
			);
			expect(fragment.text).toContain(
				'## Discovery (canonical, generated)',
			);
			expect(fragment.text).toContain('### Actionable proposals');
			expect(fragment.text).toContain('### Top skills');
			expect(fragment.text).toContain('{/* BEGIN GENERATED: f00056 S4');
			expect(fragment.text).toContain('{/* END GENERATED: f00056 S4 */}');
		}
	});

	it('keeps each fragment under the byte budget', () => {
		const result = renderHostHints({ artifact: buildArtifact() });
		expect(result.warnings).toEqual([]);
		for (const fragment of result.fragments) {
			expect(fragment.text.length).toBeLessThanOrEqual(
				MAX_FRAGMENT_BYTES,
			);
		}
	});

	it('emits one fragment per host with stable filenames', () => {
		const result = renderHostHints({ artifact: buildArtifact() });
		const ids = result.fragments.map((fragment) => fragment.id);
		expect(ids).toEqual(['copilot', 'claude', 'agents']);
		const filenames = result.fragments.map((fragment) => fragment.filename);
		expect(filenames).toEqual([
			'copilot-instructions.generated.md',
			'claude.generated.md',
			'agents.generated.md',
		]);
	});

	it('uses the resolved generatedAt for determinism', () => {
		const result = renderHostHints({
			artifact: buildArtifact(),
			generatedAt: FIXED_NOW,
		});
		for (const fragment of result.fragments) {
			expect(fragment.text).toContain(FIXED_NOW);
		}
	});

	it('is idempotent across two CLI runs against the same artifact', async () => {
		await withFixture(async (root) => {
			const first = await runHostHintsCli(['--root', root], testIo());
			expect(first.exitCode).toBe(0);
			const firstCopilot = await readFile(
				join(
					root,
					DEFAULT_OUTPUT_DIR,
					'copilot-instructions.generated.md',
				),
				'utf8',
			);
			const firstClaude = await readFile(
				join(root, DEFAULT_OUTPUT_DIR, 'claude.generated.md'),
				'utf8',
			);
			const firstAgents = await readFile(
				join(root, DEFAULT_OUTPUT_DIR, 'agents.generated.md'),
				'utf8',
			);
			const second = await runHostHintsCli(['--root', root], testIo());
			expect(second.exitCode).toBe(0);
			expect(second.changed).toBe(false);
			const secondCopilot = await readFile(
				join(
					root,
					DEFAULT_OUTPUT_DIR,
					'copilot-instructions.generated.md',
				),
				'utf8',
			);
			const secondClaude = await readFile(
				join(root, DEFAULT_OUTPUT_DIR, 'claude.generated.md'),
				'utf8',
			);
			const secondAgents = await readFile(
				join(root, DEFAULT_OUTPUT_DIR, 'agents.generated.md'),
				'utf8',
			);
			expect(secondCopilot).toBe(firstCopilot);
			expect(secondClaude).toBe(firstClaude);
			expect(secondAgents).toBe(firstAgents);
		});
	});

	it('--check exits 0 when the fragments are current', async () => {
		await withFixture(async (root) => {
			await runHostHintsCli(['--root', root], testIo());
			const fresh = await runHostHintsCli(
				['--root', root, '--check'],
				testIo({ fixedGeneratedAt: FIXED_NOW }),
			);
			expect(fresh.exitCode).toBe(0);
			expect(fresh.changed).toBe(false);
		});
	});

	it('--check exits 1 when the artifact drifts and the fragments are stale', async () => {
		await withFixture(async (root) => {
			await runHostHintsCli(['--root', root], testIo());
			await writeFile(
				join(
					root,
					DEFAULT_OUTPUT_DIR,
					'copilot-instructions.generated.md',
				),
				'stale\n',
				'utf8',
			);
			const errors: string[] = [];
			const stale = await runHostHintsCli(
				['--root', root, '--check'],
				testIo({
					error: (message: string) => errors.push(message),
					fixedGeneratedAt: FIXED_NOW,
				}),
			);
			expect(stale.exitCode).toBe(1);
			expect(stale.changed).toBe(true);
			expect(errors[0]).toContain('stale');
		});
	});

	it('regenerates fragments when the artifact gains a new skill', async () => {
		await withFixture(async (root) => {
			const first = await runHostHintsCli(['--root', root], testIo());
			expect(first.exitCode).toBe(0);
			const firstCopilot = await readFile(
				join(
					root,
					DEFAULT_OUTPUT_DIR,
					'copilot-instructions.generated.md',
				),
				'utf8',
			);
			const bumped = buildArtifact({
				skills: [
					...buildArtifact().skills,
					{
						id: 'mcp-vertex-new-skill',
						summary:
							'Newly added skill that should appear in fragments.',
						tags: ['new'],
						appliesTo: ['@mcp-vertex/*'],
					},
				],
			});
			await writeFile(
				join(root, DEFAULT_INPUT_PATH),
				`${JSON.stringify(bumped, null, '\t')}\n`,
				'utf8',
			);
			const second = await runHostHintsCli(['--root', root], testIo());
			expect(second.exitCode).toBe(0);
			expect(second.changed).toBe(true);
			const secondCopilot = await readFile(
				join(
					root,
					DEFAULT_OUTPUT_DIR,
					'copilot-instructions.generated.md',
				),
				'utf8',
			);
			expect(secondCopilot).not.toBe(firstCopilot);
			expect(secondCopilot).toContain('`mcp-vertex-new-skill`');
		});
	});

	it('emits no warnings on the fixture and renders deterministic text', () => {
		const artifact = buildArtifact();
		const first = renderHostHints({ artifact });
		const second = renderHostHints({ artifact });
		expect(first.warnings).toEqual([]);
		expect(first.fragments).toHaveLength(3);
		for (let index = 0; index < first.fragments.length; index += 1) {
			expect(first.fragments[index]?.text).toBe(
				second.fragments[index]?.text,
			);
		}
	});

	it('refuses to render when the artifact is missing', async () => {
		const root = await mkdtemp(join(tmpdir(), 'host-hints-empty-'));
		try {
			await expect(
				runHostHintsCli(['--root', root], testIo()),
			).rejects.toThrow(/catalog artifact missing/);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
