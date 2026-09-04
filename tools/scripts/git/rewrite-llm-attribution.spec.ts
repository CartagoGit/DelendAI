/**
 * rewrite-llm-attribution.spec.ts — f00500 S8.
 *
 * The rewrite is irreversible on the remote, so the parts that decide WHAT
 * changes are pure functions and every one of them is pinned here. The two
 * cases that matter most are the ones that must NOT change anything: a human
 * co-author, and a commit body that merely discusses an LLM rather than
 * crediting one.
 *
 * The owner identity used throughout is a fixture, never the maintainer's
 * real one — the production path reads that from `commit-policy`
 * configuration, and a test that hard-codes it would put the very personal
 * data this proposal removes from GitHub back into a tracked file.
 */
import { describe, expect, it } from 'vitest';

import {
	canonicalIdentity,
	classifyIdentity,
	isLlmAttributionLine,
	rewriteFastExportStream,
	sanitizeCommitMessage,
	type IGitIdentity,
} from './rewrite-llm-attribution.script';

const OWNER: IGitIdentity = {
	name: 'Repo Owner',
	email: 'owner@example.test',
};

describe('identity policy', () => {
	it('leaves the configured owner alone', () => {
		expect(classifyIdentity(OWNER, OWNER)).toBe('canonical');
		expect(canonicalIdentity(OWNER, OWNER)).toEqual(OWNER);
	});

	it('normalises the owner’s other machines onto the configured identity', () => {
		// A second laptop, an old work address: not the canonical identity,
		// so they fold onto it like everything else — no list to maintain.
		expect(
			canonicalIdentity(
				{ name: 'Repo Owner - WSL', email: 'owner@work.example' },
				OWNER,
			),
		).toEqual(OWNER);
	});

	it('rewrites every synthetic agent identity, named vendor or not', () => {
		for (const email of [
			'delendai@MiniMax.local',
			'copilot@anthropic.com',
			'ci@anthropic.com',
			'mensa-orchestrator@copilot',
			'night-shift@local',
			'auto@vertex',
			// The point of the allowlist: a vendor nobody has heard of yet is
			// already covered, with no edit to this file.
			'agent@some-model-shipped-next-year.ai',
		])
			expect(
				canonicalIdentity({ name: 'whoever', email }, OWNER),
			).toEqual(OWNER);
	});

	it('keeps dependabot, because erasing it would misattribute bot commits to a human', () => {
		const dependabot = {
			name: 'dependabot[bot]',
			email: '49699333+dependabot[bot]@users.noreply.github.com',
		};
		expect(classifyIdentity(dependabot, OWNER)).toBe('allowed');
		expect(canonicalIdentity(dependabot, OWNER)).toEqual(dependabot);
	});
});

describe('attribution lines', () => {
	it('recognises the trailers this repository actually recorded', () => {
		for (const line of [
			'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>',
			'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>',
			'Co-Authored-By: MiniMax M3 <MiniMax@users.noreply.github.com>',
			'Generated with Claude Code',
		])
			expect(isLlmAttributionLine(line)).toBe(true);
	});

	it('leaves a human co-author alone', () => {
		expect(
			isLlmAttributionLine('Co-authored-by: Alice <alice@example.com>'),
		).toBe(false);
	});

	it('leaves prose that merely mentions a model alone', () => {
		// A commit that DESCRIBES model routing is not a commit CREDITED to a
		// model. Deleting this line would silently destroy real history.
		expect(
			isLlmAttributionLine(
				'routes work to cheaper LLMs and escalates to Claude Opus only when needed',
			),
		).toBe(false);
	});
});

describe('sanitizeCommitMessage', () => {
	it('drops the trailer block and the blank line it hung from', () => {
		expect(
			sanitizeCommitMessage(
				'feat(x): do the thing\n\nA real body paragraph.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n',
			),
		).toBe('feat(x): do the thing\n\nA real body paragraph.\n');
	});

	it('strips the branch prefix before prose substitutions can hide it', () => {
		// The ordering bug this pins: substituting the vendor string first
		// turned `agent/copilot-minimax-m3-copilot-orchestrator-…` into
		// `agent/concurrent-agent-copilot-orchestrator-…`, which the branch
		// rule no longer recognised — so the rewrite reported success and
		// left `copilot` in the subject.
		expect(
			sanitizeCommitMessage(
				"Merge branch 'agent/copilot-minimax-m3-copilot-orchestrator-night-shift' into develop\n",
				[{ find: 'copilot-minimax-m3', replace: 'concurrent-agent' }],
			),
		).toBe("Merge branch 'agent/orchestrator-night-shift' into develop\n");
	});

	it('neutralises every vendor segment of an agent branch name', () => {
		expect(
			sanitizeCommitMessage(
				"Merge branch 'agent/copilot-minimax-m3-s57' into develop\n",
			),
		).toBe("Merge branch 'agent/s57' into develop\n");
		expect(
			sanitizeCommitMessage(
				"Merge remote-tracking branch 'origin/agent/claude-x00199-agent-catalog-schema' into develop\n",
			),
		).toBe(
			"Merge remote-tracking branch 'origin/agent/x00199-agent-catalog-schema' into develop\n",
		);
	});

	it('applies reviewed prose substitutions but leaves supported-host prose alone', () => {
		const substitutions = [
			{
				find: 'by Claude Code and Codex (GPT-5.5)',
				replace: 'by two independent reviewers',
			},
		];
		expect(
			sanitizeCommitMessage(
				'feat(audit): add audits by Claude Code and Codex (GPT-5.5)\n',
				substitutions,
			),
		).toBe('feat(audit): add audits by two independent reviewers\n');

		// The sentence that must survive: it names a host the project
		// INTEGRATES with, which is the product, not a credit line.
		const supported =
			'fix(cli): generate Claude Code-native subagent files\n';
		expect(sanitizeCommitMessage(supported, substitutions)).toBe(supported);
	});

	it('leaves a clean message byte-identical', () => {
		const message =
			'fix(core): tighten the walker\n\nWhy: it scanned d.ts.\n';
		expect(sanitizeCommitMessage(message)).toBe(message);
	});
});

describe('rewriteFastExportStream', () => {
	const stream = (message: string, author: string): Buffer =>
		Buffer.from(
			[
				'commit refs/heads/develop',
				'mark :1',
				`author ${author} 1750000000 +0200`,
				`committer ${author} 1750000000 +0200`,
				`data ${Buffer.byteLength(message, 'utf8')}`,
				message,
			].join('\n'),
			'utf8',
		);

	it('rewrites identity and message and keeps the byte count honest', () => {
		const message =
			'feat: añadir soporte\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n';
		const { output, stats } = rewriteFastExportStream(
			stream(message, 'copilot-minimax-m3 <copilot@MiniMax>'),
			OWNER,
		);
		const text = output.toString('utf8');

		expect(stats.commits).toBe(1);
		expect(stats.identitiesRewritten).toBe(2);
		expect(stats.messagesChanged).toBe(1);
		expect(text).toContain(
			`author ${OWNER.name} <${OWNER.email}> 1750000000 +0200`,
		);
		expect(text).not.toContain('Claude');
		expect(text).not.toContain('MiniMax');

		// The header must count BYTES of the rewritten body. A message with
		// an "ñ" in it is where an off-by-one desynchronises the whole
		// stream and silently corrupts every commit after this one.
		const declared = Number(/data (\d+)/u.exec(text)?.[1]);
		const body = text.slice(text.indexOf('\n', text.indexOf('data ')) + 1);
		expect(Buffer.byteLength(body, 'utf8')).toBe(declared);
		expect(body).toBe('feat: añadir soporte\n');
	});

	it('does not touch a commit that was already clean', () => {
		const message = 'fix: something\n';
		const input = stream(message, `${OWNER.name} <${OWNER.email}>`);
		const { output, stats } = rewriteFastExportStream(input, OWNER);
		expect(stats.identitiesRewritten).toBe(0);
		expect(stats.messagesChanged).toBe(0);
		expect(output.toString('utf8')).toBe(input.toString('utf8'));
	});
});
