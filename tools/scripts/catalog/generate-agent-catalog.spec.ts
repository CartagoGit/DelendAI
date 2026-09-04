#!/usr/bin/env bun
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ACTIONABLE_PROPOSAL_STATUSES } from '@delendai/core/public';
import type { IToolSummary } from '@delendai/core/public';
import {
	buildAgentCatalogArtifact,
	DEFAULT_OUTPUT_PATH,
	firstBodyParagraph,
	runCatalogGeneratorCli,
} from './generate-agent-catalog.script.ts';

const FIXED_NOW = '2026-06-27T12:00:00.000Z';

const tool = (
	name: string,
	plugin: string,
	extra: Partial<IToolSummary> = {},
): IToolSummary => ({
	name,
	plugin,
	...extra,
});

const baseTools = [
	tool('mcp-vertex_overview', 'mcp-vertex', {
		summary: 'Overview',
		tags: ['orientation'],
	}),
	tool('mcp-vertex_git_status', 'mcp-vertex', {
		summary: 'Git status',
		tags: ['git'],
		effects: ['write'],
	}),
];

const baseManifest = {
	generatedAt: '2026-06-26T00:00:00.000Z',
	skills: [
		{
			id: 'alpha-skill',
			version: '1.0.0',
			minCoreVersion: '0.1.0',
			summary: 'Use alpha skill when you need the explicit summary path.',
			bodyPath: 'packages/core/skills/alpha-skill/SKILL.md',
			tags: ['alpha', 'summary'],
			appliesTo: ['@delendai/*'],
		},
	],
};

const baseProposals = {
	generated_at: '2026-06-27T09:00:00.000Z',
	proposals: [
		{
			id: 'f00056',
			title: 'Agent discovery catalog',
			track: 'catalog',
			status: 'ready',
			kind: 'feat',
			date: '2026-06-25',
		},
		{
			id: 'x00001',
			title: 'Paused fix',
			track: 'fixes',
			status: 'paused',
			kind: 'fix',
			date: '2026-06-24',
		},
		{
			id: 'a00001',
			title: 'Done audit',
			track: 'audits',
			status: 'done',
			kind: 'audit',
			date: '2026-06-23',
		},
	],
};

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

const createFixtureRoot = async (options?: {
	readonly manifest?: any;
	readonly proposals?: typeof baseProposals;
	readonly skillBodies?: Readonly<Record<string, string>>;
	// x00xxx (drift-in-CI fix): a fresh checkout — like the `drift`
	// workflow's CI runner — has the checked-in proposal markdown but no
	// gitignored `.cache/mcp-vertex/proposals/index.json`. These two let a
	// test reproduce exactly that shape instead of always pre-seeding the
	// cache file the way every other fixture in this suite does.
	readonly skipProposalsIndex?: boolean;
	readonly proposalMarkdownFiles?: Readonly<Record<string, string>>;
}): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'agent-catalog-'));
	const manifest = options?.manifest ?? baseManifest;
	const proposals = options?.proposals ?? baseProposals;
	const skillBodies =
		options?.skillBodies ??
		({
			'packages/core/skills/alpha-skill/SKILL.md': [
				'---',
				'name: alpha-skill',
				'description: Frontmatter description should not be used as fallback.',
				'---',
				'',
				'# Alpha skill',
				'',
				'Fallback paragraph for alpha skill.',
				'',
				'More details.',
			].join('\n'),
		} satisfies Record<string, string>);

	await mkdir(join(root, 'packages/core/skills/alpha-skill'), {
		recursive: true,
	});
	await mkdir(join(root, 'packages/core/skills'), { recursive: true });
	await mkdir(join(root, 'docs/mcp-vertex/proposals'), { recursive: true });
	await mkdir(join(root, '.cache/mcp-vertex/proposals'), { recursive: true });
	for (const [relativePath, content] of Object.entries(skillBodies)) {
		await mkdir(
			join(root, relativePath.split('/').slice(0, -1).join('/')),
			{
				recursive: true,
			},
		);
		await writeFile(join(root, relativePath), content, 'utf8');
	}
	await writeFile(
		join(root, 'packages/core/skills/manifest.json'),
		`${JSON.stringify(manifest, null, '\t')}\n`,
		'utf8',
	);
	for (const [relativePath, content] of Object.entries(
		options?.proposalMarkdownFiles ?? {},
	)) {
		const absPath = join(root, 'docs/mcp-vertex/proposals', relativePath);
		await mkdir(join(absPath, '..'), { recursive: true });
		await writeFile(absPath, content, 'utf8');
	}
	if (options?.skipProposalsIndex !== true) {
		await writeFile(
			join(root, '.cache/mcp-vertex/proposals/index.json'),
			`${JSON.stringify(proposals, null, '\t')}\n`,
			'utf8',
		);
	}
	return root;
};

const withFixture = async (
	callback: (root: string) => Promise<void>,
	options?: Parameters<typeof createFixtureRoot>[0],
): Promise<void> => {
	const root = await createFixtureRoot(options);
	try {
		await callback(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

describe('generate-agent-catalog script', async () => {
	it('extracts the first body paragraph for fallback summaries', async () => {
		expect(
			firstBodyParagraph(
				[
					'---',
					'name: test',
					'description: ignored for fallback',
					'---',
					'',
					'# Heading',
					'',
					'First paragraph.',
					'',
					'Second paragraph.',
				].join('\n'),
			),
		).toBe('First paragraph.');
	});

	it('is idempotent across two runs with the same inputs', async () => {
		await withFixture(async (root) => {
			const first = await runCatalogGeneratorCli(['--root', root], {
				...testIo(),
				fixedGeneratedAt: FIXED_NOW,
				loadTools: async () => [...baseTools],
			});
			expect(first.exitCode).toBe(0);
			const firstText = await readFile(
				join(root, DEFAULT_OUTPUT_PATH),
				'utf8',
			);
			const second = await runCatalogGeneratorCli(['--root', root], {
				...testIo(),
				fixedGeneratedAt: FIXED_NOW,
				loadTools: async () => [...baseTools],
			});
			expect(second.exitCode).toBe(0);
			const secondText = await readFile(
				join(root, DEFAULT_OUTPUT_PATH),
				'utf8',
			);
			expect(secondText).toBe(firstText);
		});
	});

	it('preserves the existing timestamp when only source timestamps change', async () => {
		await withFixture(async (root) => {
			const first = await runCatalogGeneratorCli(['--root', root], {
				...testIo(),
				fixedGeneratedAt: FIXED_NOW,
				loadTools: async () => [...baseTools],
			});
			expect(first.exitCode).toBe(0);
			const firstText = await readFile(
				join(root, DEFAULT_OUTPUT_PATH),
				'utf8',
			);

			const second = await runCatalogGeneratorCli(['--root', root], {
				...testIo(),
				fixedGeneratedAt: '2026-08-30T19:14:23.702Z',
				loadTools: async () => [...baseTools],
			});
			expect(second.exitCode).toBe(0);
			expect(
				await readFile(join(root, DEFAULT_OUTPUT_PATH), 'utf8'),
			).toBe(firstText);
		});
	});

	it('--check exits 0 when the artifact is current and 1 when it is stale', async () => {
		await withFixture(async (root) => {
			await runCatalogGeneratorCli(['--root', root], {
				...testIo(),
				fixedGeneratedAt: FIXED_NOW,
				loadTools: async () => [...baseTools],
			});
			const fresh = await runCatalogGeneratorCli(
				['--root', root, '--check'],
				{
					...testIo(),
					fixedGeneratedAt: FIXED_NOW,
					loadTools: async () => [...baseTools],
				},
			);
			expect(fresh.exitCode).toBe(0);
			await writeFile(
				join(root, DEFAULT_OUTPUT_PATH),
				'{"stale":true}\n',
				'utf8',
			);
			const errors: string[] = [];
			const stale = await runCatalogGeneratorCli(
				['--root', root, '--check'],
				{
					...testIo({
						error: (message: string) => errors.push(message),
					}),
					fixedGeneratedAt: FIXED_NOW,
					loadTools: async () => [...baseTools],
				},
			);
			expect(stale.exitCode).toBe(1);
			expect(errors[0]).toContain('stale');
		});
	});

	it('compact mode keeps tools to name and plugin only', async () => {
		await withFixture(async (root) => {
			const result = await buildAgentCatalogArtifact(
				{ root, mode: 'compact' },
				{
					...testIo(),
					fixedGeneratedAt: FIXED_NOW,
					loadTools: async () => [...baseTools],
				},
			);
			expect(result.artifact.tools).toEqual([
				{ name: 'mcp-vertex_git_status' },
				{ name: 'mcp-vertex_overview' },
			]);
		});
	});

	it('falls back to the first body paragraph and writes a warnings sibling when summary is missing', async () => {
		await withFixture(
			async (root) => {
				const warnings: string[] = [];
				const manifest = {
					...baseManifest,
					skills: [
						{
							...baseManifest.skills[0],
							summary: undefined,
						},
					],
				};
				await writeFile(
					join(root, 'packages/core/skills/manifest.json'),
					`${JSON.stringify(manifest, null, '\t')}\n`,
					'utf8',
				);
				const result = await runCatalogGeneratorCli(['--root', root], {
					...testIo({
						warn: (message: string) => warnings.push(message),
					}),
					fixedGeneratedAt: FIXED_NOW,
					loadTools: async () => [...baseTools],
				});
				expect(result.exitCode).toBe(1);
				expect(result.generation?.artifact.skills[0]?.summary).toBe(
					'Fallback paragraph for alpha skill.',
				);
				const warningsPath = join(
					root,
					'docs/mcp-vertex/agent-catalog.generated.lint-warnings.txt',
				);
				const warningText = await readFile(warningsPath, 'utf8');
				expect(warningText).toContain('alpha-skill');
				expect(warnings[0]).toContain('implicit skill summaries');
			},
			{
				manifest: {
					...baseManifest,
					skills: [
						{
							id: 'alpha-skill',
							version: '1.0.0',
							minCoreVersion: '0.1.0',
							bodyPath:
								'packages/core/skills/alpha-skill/SKILL.md',
							tags: ['alpha', 'summary'],
							appliesTo: ['@delendai/*'],
						},
					],
				},
			},
		);
	});

	it('compact mode only surfaces actionable proposal statuses', async () => {
		await withFixture(async (root) => {
			const result = await buildAgentCatalogArtifact(
				{ root, mode: 'compact' },
				{
					...testIo(),
					fixedGeneratedAt: FIXED_NOW,
					loadTools: async () => [...baseTools],
				},
			);
			expect(
				result.artifact.proposals.actionable.every((proposal) =>
					ACTIONABLE_PROPOSAL_STATUSES.includes(proposal.status),
				),
			).toBe(true);
			expect(result.artifact.proposals.actionable).toHaveLength(2);
			expect(result.artifact.proposals.byStatus.done).toBe(1);
		});
	});

	it('self-heals the proposal index from checked-in markdown when the cache is absent (fresh CI checkout)', async () => {
		// Reproduces the `drift` workflow's actual failure mode: a fresh
		// `actions/checkout` has `docs/mcp-vertex/proposals/**` (tracked)
		// but no `.cache/mcp-vertex/proposals/index.json` (gitignored —
		// only ever built by the MCP server or an explicit sync). The
		// generator must rebuild the index from the markdown, not throw.
		await withFixture(
			async (root) => {
				const result = await buildAgentCatalogArtifact(
					{ root, mode: 'full' },
					{
						...testIo(),
						fixedGeneratedAt: FIXED_NOW,
						loadTools: async () => [...baseTools],
					},
				);
				const ids = result.artifact.proposals.all?.map(
					(proposal) => proposal.id,
				);
				expect(ids).toContain('f00001');
			},
			{
				skipProposalsIndex: true,
				proposalMarkdownFiles: {
					'ready/f00001-self-heal-example.md': [
						'---',
						'id: f00001',
						'title: "Self-heal example"',
						'kind: feat',
						'status: ready',
						'type: proposal',
						'track: general',
						'date: 2026-06-20',
						'---',
						'',
						'# f00001 — Self-heal example',
						'',
						'Body.',
						'',
					].join('\n'),
				},
			},
		);
	});

	it('sorts deterministically even when inputs arrive in different orders', async () => {
		await withFixture(async (root) => {
			const forward = await buildAgentCatalogArtifact(
				{ root, mode: 'full' },
				{
					...testIo(),
					fixedGeneratedAt: FIXED_NOW,
					loadTools: async () => [...baseTools],
				},
			);
			const reversed = await buildAgentCatalogArtifact(
				{ root, mode: 'full' },
				{
					...testIo(),
					fixedGeneratedAt: FIXED_NOW,
					loadTools: async () => [...baseTools].reverse(),
					readText: async (absPath) => {
						if (absPath.endsWith('manifest.json')) {
							const raw = await readFile(absPath, 'utf8');
							const parsed = JSON.parse(
								raw,
							) as typeof baseManifest;
							parsed.skills = [...parsed.skills].reverse();
							return `${JSON.stringify(parsed, null, '\t')}\n`;
						}
						if (absPath.endsWith('index.json')) {
							const raw = await readFile(absPath, 'utf8');
							const parsed = JSON.parse(
								raw,
							) as typeof baseProposals;
							parsed.proposals = [...parsed.proposals].reverse();
							return `${JSON.stringify(parsed, null, '\t')}\n`;
						}
						try {
							return await readFile(absPath, 'utf8');
						} catch {
							return undefined;
						}
					},
				},
			);
			expect(reversed.text).toBe(forward.text);
		});
	});
});
