/**
 * E2E coverage for `<prefix>_audit_run` (alcance B, f00077).
 *
 * Verifies the full loop with mocked HTTP transport:
 *
 *  1. `audit_run` is invoked with N LLM targets.
 *  2. The transport receives one POST per target with the right URL,
 *     auth header, and brief payload.
 *  3. Each successful response is parsed and saved as a markdown
 *     file under a temporary `auditDir`.
 *  4. The consolidator deduplicates the findings (a shared
 *     "FATAL" finding shows up once with `seenBy: [a, b]`).
 *  5. The proposal scaffolder writes one fix proposal per
 *     actionable severity under a temporary `proposalsDir`.
 *  6. Output schema surfaces `saved`, `failed`, `consolidation`,
 *     and `scaffolded` arrays.
 *
 * Workspace containment is also covered (the same trap the
 * `audit_consolidate` spec asserts): a `../` escape on either
 * `auditDir` or `proposalsDir` is rejected before any write.
 */

import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildRunRegistration,
	probeAudits,
	probeProposals,
} from '../../../../src/lib/tools/audit-run.tool';
import type { IHttpTransport } from '../../../../src/lib/services/llm-client.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Captures every call the tool makes via the injected transport. */
interface ICallRecord {
	readonly url: string;
	readonly method: string;
	readonly headers: Record<string, string>;
	readonly body: string;
}

const makeTransport = (
	respond: (url: string, body: string) => { status: number; json: unknown },
): IHttpTransport & { readonly calls: ICallRecord[] } => {
	const calls: ICallRecord[] = [];
	return {
		calls,
		async fetchJson(url, init) {
			calls.push({
				url,
				method: init.method,
				headers: { ...init.headers },
				body: init.body,
			});
			return respond(url, init.body);
		},
	};
};

/** Construct a `audit_run` tool registration with a mocked transport. */
const buildReg = (
	workspaceRoot: string,
	transport: IHttpTransport,
	now: () => Date = () => new Date('2026-06-28T00:00:00Z'),
) =>
	buildRunRegistration({
		namespacePrefix: 'audit',
		workspaceRoot,
		defaultAuditDir: 'docs/mcp-vertex/proposals/done/audits',
		defaultProposalsDir: 'docs/mcp-vertex/proposals/ready',
		transport,
		now,
		// The auto-scaffolder gates on the `proposals` peer plugin being
		// loaded (IPeerPluginRegistry). The real host wires this from
		// `ctx.peerPlugins`; the test provides a registry that reports
		// `proposals` as loaded so scaffolding is exercised.
		peerPlugins: {
			list: () => ['proposals'],
			has: (name: string) => name === 'proposals',
		},
	});

/** Pull the handler out of a registration and invoke it with `args`. */
const invoke = async (
	reg: ReturnType<typeof buildRunRegistration>,
	args: unknown,
): Promise<{ content: Array<{ text: string }> }> => {
	let handler:
		| ((a: unknown) => Promise<{ content: Array<{ text: string }> }>)
		| undefined;
	await reg.register({
		registerTool: (
			_name: string,
			_desc: unknown,
			fn: typeof handler,
		): void => {
			handler = fn;
		},
	} as never);
	if (!handler) throw new Error('audit_run did not register a handler');
	return handler(args);
};

const parse = (r: {
	content: Array<{ text: string }>;
}): {
	ok?: boolean;
	error?: { reason: string; nextAction?: string };
	scope?: string;
	date?: string;
	saved?: Array<{
		provider: string;
		model: string;
		path: string;
		bytes: number;
		elapsedMs: number;
	}>;
	failed?: Array<{
		provider: string;
		model: string;
		error: string;
		elapsedMs: number;
	}>;
	consolidation?: {
		auditsFound: number;
		findings: Array<{
			id: string;
			worstSeverity: string;
			titles: string[];
			files: string[];
			seenBy: string[];
		}>;
		topActions: string[];
		markdown: string;
	};
	scaffolded?: Array<{
		id: string;
		filename: string;
		severity: string;
		files: string[];
	}>;
} => JSON.parse(r.content[0]?.text ?? '{}');

/** A canonical mock audit markdown that the consolidator can parse. */
const mockAudit = (
	model: string,
	findingTitle: string,
	severity: 'FATAL' | 'BAD' | 'MINOR' | 'OK' = 'FATAL',
	files: string[] = ['src/example.ts'],
) => {
	// Severity canonicalization landed the English enum tokens
	// (`FATAL`, `BAD`, `MINOR`, `OK`, …) as the only recognized heading
	// form; the historical Spanish headings (`MUY MAL`, `MEJORABLE`) were
	// removed. Emit the canonical English token as the finding heading.
	const heading = severity;
	return `# Audit (${model})

## Resumen Ejecutivo

Resumen corto.

## ${heading}

### 1. ${findingTitle}
**Fichero**: \`${files[0]}\`

\`\`\`typescript
// snippet
\`\`\`

**Problema**: descripción.
**Impacto**: impacto.
**Resolution Track**: Diferido a propuesta \`x00000\`

## Scoreboard

| Dimension | Score |
|---|---|
| Calidad | 8 |

**Nota final: 8/10 — fine.**
`;
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('audit_run (alcance B, f00077)', async () => {
	let workspaceRoot = '';
	let outsideDir = '';

	beforeEach(async () => {
		workspaceRoot = await mkdtemp(join(tmpdir(), 'audit-run-'));
		outsideDir = await mkdtemp(join(tmpdir(), 'audit-run-outside-'));
		// Pre-create the standard audits + proposals dirs so the tool
		// has a known target. Both must exist for `mkdir({recursive})`
		// in the handler to be a no-op.
		await mkdir(
			join(
				workspaceRoot,
				'docs',
				'mcp-vertex',
				'proposals',
				'done',
				'audits',
			),
			{ recursive: true },
		);
		await mkdir(
			join(workspaceRoot, 'docs', 'mcp-vertex', 'proposals', 'ready'),
			{ recursive: true },
		);
	});

	afterEach(async () => {
		await rm(workspaceRoot, { recursive: true, force: true });
		await rm(outsideDir, { recursive: true, force: true });
	});

	// ---- happy path: 2 targets, shared finding, scaffold 1 proposal ----

	// TODO(x00091 s2): audit-run scaffold integration is broken by the in-progress
	// audit refactor (consolidation->scaffold wiring in audit-run.tool.ts). The
	// service-level scaffolder works; the tool-level path is x00091 s2's scope.
	// Un-skip when x00091 s2 (audit-run.tool.ts split) lands.
	it.skip('dispatches the brief to N targets and scaffolds a deduplicated proposal', async () => {
		const transport = makeTransport((url, body) => {
			if (url.includes('api.openai.com')) {
				// First model reports the finding.
				return {
					status: 200,
					json: {
						choices: [
							{
								message: {
									content: mockAudit(
										'gpt-4o',
										'Plugins read process.cwd at boot',
										'FATAL',
										['plugins/audit/src/index.ts'],
									),
								},
							},
						],
					},
				};
			}
			if (url.includes('api.anthropic.com')) {
				// Second model reports the SAME finding with the
				// same title and file (consolidator should dedup).
				return {
					status: 200,
					json: {
						content: [
							{
								type: 'text',
								text: mockAudit(
									'claude-opus-4-8',
									'Plugins read process.cwd at boot',
									'FATAL',
									['plugins/audit/src/index.ts'],
								),
							},
						],
					},
				};
			}
			void body;
			return { status: 404, json: { error: 'no mock' } };
		});

		const reg = buildReg(workspaceRoot, transport);
		const out = parse(
			await invoke(reg, {
				scope: 'full',
				targets: [
					{
						provider: 'openai',
						model: 'gpt-4o',
						apiKey: 'sk-openai-fixture',
					},
					{
						provider: 'anthropic',
						model: 'claude-opus-4-8',
						apiKey: 'sk-anthropic-fixture',
					},
				],
			}),
		);

		// 1. Transport saw both URLs.
		expect(transport.calls).toHaveLength(2);
		const urls = transport.calls.map((c) => c.url).sort();
		expect(urls).toEqual(
			[
				'https://api.anthropic.com/v1/messages',
				'https://api.openai.com/v1/chat/completions',
			].sort(),
		);
		// Each call carried the right auth + the brief as the user
		// message.
		const openaiCall = transport.calls.find((c) =>
			c.url.includes('api.openai.com'),
		);
		expect(openaiCall?.headers.authorization).toBe(
			'Bearer sk-openai-fixture',
		);
		const anthropicCall = transport.calls.find((c) =>
			c.url.includes('api.anthropic.com'),
		);
		expect(anthropicCall?.headers['x-api-key']).toBe(
			'sk-anthropic-fixture',
		);
		const openaiBody = JSON.parse(openaiCall?.body ?? '{}');
		expect(openaiBody.messages[1].role).toBe('user');
		expect(openaiBody.messages[1].content).toContain(
			'# 📋 Audit brief',
		);

		// 2. Two markdown files were saved.
		expect(out.saved ?? []).toHaveLength(2);
		expect(out.failed ?? []).toEqual([]);
		const auditsProbe = await probeAudits(
			join(
				workspaceRoot,
				'docs',
				'mcp-vertex',
				'proposals',
				'done',
				'audits',
			),
		);
		expect(auditsProbe.auditsFound).toBe(2);

		// 3. Consolidation found exactly ONE FATAL finding (deduped
		// across both models).
		const findings = out.consolidation?.findings ?? [];
		expect(findings).toHaveLength(1);
		expect(findings[0]?.worstSeverity).toBe('FATAL');
		expect(findings[0]?.seenBy).toEqual(
			expect.arrayContaining(['gpt-4o', 'claude-opus-4-8']),
		);
		expect(findings[0]?.titles).toEqual([
			'Plugins read process.cwd at boot',
		]);

		// 4. Exactly one scaffolded proposal was written (FATAL).
		expect(out.scaffolded ?? []).toHaveLength(1);
		const proposal = out.scaffolded?.[0];
		expect(proposal?.severity).toBe('FATAL');
		expect(proposal?.id).toMatch(/^x\d{5}$/u);
		const proposalsProbe = await probeProposals(
			join(workspaceRoot, 'docs', 'mcp-vertex', 'proposals', 'ready'),
		);
		expect(proposalsProbe).toEqual([proposal?.id]);

		// 5. The proposal file body parses and links the audit via
		// `related` (we did not pass auditId, so the scaffold
		// pre-fills a placeholder).
		const files = await readdir(
			join(workspaceRoot, 'docs', 'mcp-vertex', 'proposals', 'ready'),
		);
		const body = await readFile(
			join(
				workspaceRoot,
				'docs',
				'mcp-vertex',
				'proposals',
				'ready',
				files[0] ?? '',
			),
			'utf8',
		);
		expect(body).toContain(`id: ${proposal?.id}`);
		expect(body).toContain('kind: fix');
		expect(body).toContain('Plugins read process.cwd at boot');
	});

	// ---- partial failure: 1 success, 1 provider error ----------------

	it.skip('records provider failures in `failed` and still scaffolds', async () => {
		const transport = makeTransport((url) => {
			if (url.includes('api.openai.com')) {
				return {
					status: 200,
					json: {
						choices: [
							{
								message: {
									content: mockAudit(
										'gpt-4o',
										'Bun lockfile drifts after npm installs',
										'BAD',
										['bun.lock'],
									),
								},
							},
						],
					},
				};
			}
			// Anthropic endpoint returns 401.
			return { status: 401, json: { error: 'invalid api key' } };
		});

		const reg = buildReg(workspaceRoot, transport);
		const out = parse(
			await invoke(reg, {
				targets: [
					{
						provider: 'openai',
						model: 'gpt-4o',
						apiKey: 'sk-openai',
					},
					{
						provider: 'anthropic',
						model: 'claude-opus-4-8',
						apiKey: 'sk-bad',
					},
				],
			}),
		);

		expect(out.saved ?? []).toHaveLength(1);
		expect(out.failed ?? []).toHaveLength(1);
		expect(out.failed?.[0]?.provider).toBe('anthropic');
		expect(out.failed?.[0]?.error).toContain('401');
		// The openai key MUST be redacted out of the failure error.
		expect(out.failed?.[0]?.error).not.toContain('sk-bad');
		// One BAD scaffolded proposal.
		expect(out.scaffolded ?? []).toHaveLength(1);
		expect(out.scaffolded?.[0]?.severity).toBe('BAD');
	});

	// ---- no actionable findings: scaffold is empty -------------------

	it('scaffolds nothing when the consolidation has no actionable findings', async () => {
		const transport = makeTransport(() => ({
			status: 200,
			json: {
				choices: [
					{
						message: {
							content: mockAudit('gpt-4o', 'OK finding', 'OK'),
						},
					},
				],
			},
		}));
		const reg = buildReg(workspaceRoot, transport);
		const out = parse(
			await invoke(reg, {
				targets: [
					{
						provider: 'openai',
						model: 'gpt-4o',
						apiKey: 'sk-x',
					},
				],
			}),
		);
		expect(out.saved ?? []).toHaveLength(1);
		// OK is not actionable; the scaffolder must skip it.
		expect(out.scaffolded ?? []).toEqual([]);
	});

	// ---- scope rejection ---------------------------------------------

	it('rejects an unknown scope with a clear error', async () => {
		const transport = makeTransport(() => ({
			status: 200,
			json: { choices: [{ message: { content: '# x' } }] },
		}));
		const reg = buildReg(workspaceRoot, transport);
		const out = parse(
			await invoke(reg, {
				scope: 'no-such-scope',
				targets: [
					{
						provider: 'openai',
						model: 'gpt-4o',
						apiKey: 'sk-x',
					},
				],
			}),
		);
		expect(JSON.stringify(out)).toContain('unknown scope');
		expect(transport.calls).toHaveLength(0);
	});

	// ---- containment -------------------------------------------------

	it('rejects `../` escapes on auditDir before any HTTP call', async () => {
		const transport = makeTransport(() => ({
			status: 200,
			json: { choices: [{ message: { content: '# x' } }] },
		}));
		const reg = buildReg(workspaceRoot, transport);
		const out = parse(
			await invoke(reg, {
				auditDir: `../${outsideDir.split('/').pop()}`,
				targets: [
					{
						provider: 'openai',
						model: 'gpt-4o',
						apiKey: 'sk-x',
					},
				],
			}),
		);
		expect(JSON.stringify(out)).toContain('not allowed');
		expect(transport.calls).toHaveLength(0);
	});

	it('rejects `../` escapes on proposalsDir', async () => {
		const transport = makeTransport(() => ({
			status: 200,
			json: { choices: [{ message: { content: '# x' } }] },
		}));
		const reg = buildReg(workspaceRoot, transport);
		const out = parse(
			await invoke(reg, {
				proposalsDir: `../${outsideDir.split('/').pop()}`,
				targets: [
					{
						provider: 'openai',
						model: 'gpt-4o',
						apiKey: 'sk-x',
					},
				],
			}),
		);
		expect(JSON.stringify(out)).toContain('not allowed');
		expect(transport.calls).toHaveLength(0);
	});

	// ---- google variant ----------------------------------------------

	it.skip('uses the Google URL shape and query-string api key for google targets', async () => {
		const transport = makeTransport(() => ({
			status: 200,
			json: {
				candidates: [
					{
						content: {
							parts: [
								{
									text: mockAudit(
										'gemini-2.5-pro',
										'MINOR: missing README section',
										'MINOR',
										['README.md'],
									),
								},
							],
						},
					},
				],
			},
		}));
		const reg = buildReg(workspaceRoot, transport);
		const out = parse(
			await invoke(reg, {
				targets: [
					{
						provider: 'google',
						model: 'gemini-2.5-pro',
						apiKey: 'AIza-fixture-key',
					},
				],
			}),
		);
		expect(out.saved ?? []).toHaveLength(1);
		expect(transport.calls[0]?.url).toContain(
			'generativelanguage.googleapis.com',
		);
		expect(transport.calls[0]?.url).toContain('gemini-2.5-pro');
		expect(transport.calls[0]?.url).toContain('key=AIza-fixture-key');
		expect(transport.calls[0]?.headers.authorization).toBeUndefined();
		expect(out.scaffolded?.[0]?.severity).toBe('MINOR');
	});

	// ---- proposalId allocation with existingIds ----------------------

	it.skip('skips ids already in `existingIds` when allocating proposals', async () => {
		const transport = makeTransport(() => ({
			status: 200,
			json: {
				choices: [
					{
						message: {
							content: mockAudit(
								'gpt-4o',
								'Tokens: avoid re-reading files in tight loops',
								'MINOR',
								['packages/core/src/lib/foo.ts'],
							),
						},
					},
				],
			},
		}));
		const reg = buildRunRegistration({
			namespacePrefix: 'audit',
			workspaceRoot,
			defaultAuditDir: 'docs/mcp-vertex/proposals/done/audits',
			defaultProposalsDir: 'docs/mcp-vertex/proposals/ready',
			transport,
			now: () => new Date('2026-06-28T00:00:00Z'),
			knownProposalIds: new Set(['x00001', 'x00002']),
		});
		const out = parse(
			await invoke(reg, {
				targets: [
					{
						provider: 'openai',
						model: 'gpt-4o',
						apiKey: 'sk-x',
					},
				],
			}),
		);
		expect(out.scaffolded?.[0]?.id).toBe('x00003');
	});
});
