/**
 * Unit specs for the pure round-context resume derivation (t00001 S3 /
 * audit H4). `buildRoundId` and `buildResumeHint` are pure folds over an
 * already-collected snapshot — these specs pin the round-id stability
 * and every branch of the resume/next decision tree without any
 * filesystem access.
 */
import { describe, expect, it } from 'vitest';

import {
	buildResumeHint,
	buildRoundId,
} from '../../../../src/lib/swarm/round-context-resume';
import type {
	IRoundContextAgent,
	IRoundContextCheckpoint,
	IRoundContextChatContext,
	IRoundContextLock,
	IRoundContextSourceMeta,
	IRoundContextSources,
} from '../../../../src/lib/swarm/round-context-types';

const sourceMeta = (fingerprint: string): IRoundContextSourceMeta => ({
	state: 'present',
	fingerprint,
	timestamp: '2026-06-22T10:00:00.000Z',
	ageMinutes: 1,
	temporallyStale: false,
});

const sources = (): IRoundContextSources => ({
	chatContext: sourceMeta('cc'),
	checkpoint: sourceMeta('ck'),
	lock: sourceMeta('lk'),
	registry: sourceMeta('rg'),
});

const lock = (taskId: string): IRoundContextLock => ({
	taskId,
	agent: 'agent-A',
	ownershipCount: 1,
	filesPreview: ['src/a.ts'],
	lastSeen: '2026-06-22T10:00:00.000Z',
});

const agent = (taskId: string): IRoundContextAgent => ({
	agent: 'agent-A',
	taskId,
	slot: 'implementation_runner',
	depth: 0,
	lastSeen: '2026-06-22T10:00:00.000Z',
	adopted: false,
});

const baseRoundId = () => ({
	activeProposalId: 'f00001',
	currentTaskId: 'f00001-S1',
	coreDocHashes: { 'AGENTS.md': 'abc' },
	sources: sources(),
	activeLocks: [lock('f00001-S1')],
	activeAgents: [agent('f00001-S1')],
});

describe('buildRoundId', () => {
	it('is deterministic for identical input', () => {
		expect(buildRoundId(baseRoundId())).toBe(buildRoundId(baseRoundId()));
	});

	it('starts with the round- prefix', () => {
		expect(buildRoundId(baseRoundId())).toMatch(/^round-/);
	});

	it('changes when the active proposal changes', () => {
		const a = buildRoundId(baseRoundId());
		const b = buildRoundId({
			...baseRoundId(),
			activeProposalId: 'f00002',
		});
		expect(a).not.toBe(b);
	});

	it('depends only on lock/agent taskIds, not their volatile fields', () => {
		const a = buildRoundId(baseRoundId());
		const b = buildRoundId({
			...baseRoundId(),
			activeLocks: [
				{
					...lock('f00001-S1'),
					lastSeen: 'DIFFERENT',
					ownershipCount: 9,
				},
			],
		});
		expect(a).toBe(b);
	});
});

const chat = (proposalIds: readonly string[]): IRoundContextChatContext => ({
	proposalIds,
});

const checkpoint = (
	over: Partial<IRoundContextCheckpoint> = {},
): IRoundContextCheckpoint => ({ ...over });

describe('buildResumeHint', () => {
	it('resumes when the checkpoint is open', () => {
		const hint = buildResumeHint({
			activeProposalId: 'f00001',
			currentTaskId: 'f00001-S1',
			chatContext: chat([]),
			checkpoint: checkpoint({
				proposalId: 'f00001',
				status: 'in-progress',
			}),
			activeLocks: [],
			activeAgents: [],
		});
		expect(hint.mode).toBe('resume');
		expect(hint.proposalId).toBe('f00001');
	});

	it('advances to next when the checkpoint is closed', () => {
		const hint = buildResumeHint({
			activeProposalId: 'f00001',
			currentTaskId: 'f00001-S1',
			chatContext: chat([]),
			checkpoint: checkpoint({ proposalId: 'f00001', status: 'done' }),
			activeLocks: [],
			activeAgents: [],
		});
		expect(hint.mode).toBe('next');
	});

	it('resumes the chat-context proposal when no checkpoint signal exists', () => {
		const hint = buildResumeHint({
			activeProposalId: 'f00009',
			currentTaskId: 'unknown',
			chatContext: chat(['f00003']),
			checkpoint: checkpoint(),
			activeLocks: [],
			activeAgents: [],
		});
		expect(hint.mode).toBe('resume');
		expect(hint.proposalId).toBe('f00003');
	});

	it('infers the in-flight slice from an active lock', () => {
		const hint = buildResumeHint({
			activeProposalId: 'f00009',
			currentTaskId: 'unknown',
			chatContext: chat([]),
			checkpoint: checkpoint(),
			activeLocks: [lock('p81-slice-2')],
			activeAgents: [],
		});
		expect(hint.mode).toBe('resume');
		expect(hint.taskId).toBe('p81-slice-2');
		expect(hint.proposalId).toBe('p81');
	});

	it('returns unknown when there is no signal at all', () => {
		const hint = buildResumeHint({
			activeProposalId: 'f00009',
			currentTaskId: 'unknown',
			chatContext: chat([]),
			checkpoint: checkpoint(),
			activeLocks: [],
			activeAgents: [],
		});
		expect(hint.mode).toBe('unknown');
	});
});
