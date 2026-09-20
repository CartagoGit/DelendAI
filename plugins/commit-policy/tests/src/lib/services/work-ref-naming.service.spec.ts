import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/core/public';

import {
	agentIdOf,
	createSliceTopicResolver,
	topicFromProposalFilename,
	topicFromProposalText,
	topicSlug,
	workRefAgent,
} from '../../../../src/lib/services/work-ref-naming.service';

describe('workRefAgent — who a work ref is named after', () => {
	it('prefers the declared model, then what the environment declares', () => {
		expect(
			workRefAgent({ model: 'claude-opus-5', host: 'claude-code' })(),
		).toBe('claude-opus-5');
		expect(workRefAgent({ host: 'copilot' })()).toBe('copilot');
	});

	it('uses the MCP client name when nothing was declared, read at call time', () => {
		let handshake: string | undefined;
		const agent = workRefAgent({ clientName: () => handshake });
		// Before the handshake nobody has said who is working, and the
		// machine is NOT an answer (x00560).
		expect(agent()).toBe('unknown-agent');
		handshake = 'codex-mcp-client';
		expect(agent()).toBe('codex-mcp-client');
	});

	it('never names a ref after the machine', () => {
		// The chain used to end at `os.hostname()`, which is how
		// `delendai/wip/desktop-9ctqrs7/…` reached this repository.
		expect(workRefAgent({})()).toBe('unknown-agent');
	});

	it('ignores blank declarations instead of naming a ref after nothing', () => {
		expect(
			workRefAgent({
				model: '  ',
				host: '',
				clientName: () => 'Visual Studio Code',
			})(),
		).toBe('visual-studio-code');
	});

	it('agentIdOf accepts a fixed id or a resolver', () => {
		expect(agentIdOf('agent-a')).toBe('agent-a');
		expect(agentIdOf(() => 'agent-b')).toBe('agent-b');
	});
});

describe('slice topics', () => {
	it('slugs a title within the length limit, at a word boundary', () => {
		expect(topicSlug('Bultos ruta: verde/rojo — saltar tomada')).toBe(
			'bultos-ruta-verde-rojo-saltar-tomada',
		);
		// Accents are folded, so a title in any language still names the ref.
		expect(topicSlug('\u00f1and\u00fa acci\u00f3n')).toBe('nandu-accion');
		const long = topicSlug(
			'one two three four five six seven eight nine ten eleven twelve',
		);
		expect(long?.length).toBeLessThanOrEqual(48);
		expect(long?.endsWith('-')).toBe(false);
		expect(topicSlug('—')).toBeUndefined();
	});

	it('reads the slice heading, and only that slice', () => {
		const text = [
			'## slices',
			'### S1 — Tetris mock with 4-7 occupied slots',
			'### S10 — Something else',
			'### S2: Columns auto-wrap',
		].join('\n');
		expect(topicFromProposalText(text, 'S1')).toBe(
			'tetris-mock-with-4-7-occupied-slots',
		);
		expect(topicFromProposalText(text, 'S2')).toBe('columns-auto-wrap');
		expect(topicFromProposalText(text, 'S10')).toBe('something-else');
		expect(topicFromProposalText(text, 'S3')).toBeUndefined();
	});

	it('falls back to the proposal filename slug', () => {
		expect(
			topicFromProposalFilename(
				'x00057-bultos-ruta-verde-rojo.md',
				'x00057',
			),
		).toBe('bultos-ruta-verde-rojo');
		expect(topicFromProposalFilename('f00001-other.md', 'x00057')).toBe(
			undefined,
		);
	});
});

describe('createSliceTopicResolver', () => {
	let root = '';
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'topic-'));
		mkdirSync(join(root, 'docs/delendai/proposals/ready/fixes'), {
			recursive: true,
		});
		writeFileSync(
			join(
				root,
				'docs/delendai/proposals/ready/fixes/x00056-tetris-mock-small.md',
			),
			'# x00056\n\n### S1 — Initial pool of occupied slots\n\n### S2\n',
		);
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const listing =
		(output: string, ok = true): IGitRunner =>
		async () =>
			({ ok, output }) as Awaited<ReturnType<IGitRunner>>;
	const resolverWith = (run: IGitRunner) =>
		createSliceTopicResolver({
			run,
			workspaceRoot: root,
			proposalsDir: 'docs/delendai/proposals',
		});
	const FILE =
		'docs/delendai/proposals/ready/fixes/x00056-tetris-mock-small.md\n';

	it('names the slice from its heading', async () => {
		expect(
			await resolverWith(listing(FILE))({
				proposalId: 'x00056',
				sliceId: 'S1',
			}),
		).toBe('initial-pool-of-occupied-slots');
	});

	it('falls back to the proposal slug when the slice has no title', async () => {
		expect(
			await resolverWith(listing(FILE))({
				proposalId: 'x00056',
				sliceId: 'S2',
			}),
		).toBe('tetris-mock-small');
	});

	it('never fails a checkpoint: unknown proposal or failed listing yields undefined', async () => {
		expect(
			await resolverWith(listing(FILE))({
				proposalId: 'x00099',
				sliceId: 'S1',
			}),
		).toBeUndefined();
		expect(
			await resolverWith(listing('', false))({
				proposalId: 'x00056',
				sliceId: 'S1',
			}),
		).toBeUndefined();
		expect(
			await resolverWith(listing(FILE))({ proposalId: '', sliceId: '' }),
		).toBeUndefined();
	});
});
