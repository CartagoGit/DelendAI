import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	STATE_ABI_VERSION,
	asWorktreeId,
	type IProducerContext,
	type IResolvedProducerInput,
} from '@delendai/state';

import { ROADMAP_PROPOSALS_INDEX_LOCATOR } from '../../../../src/lib/contracts/constants/roadmap-producer.constant';
import { createRoadmapProducer } from '../../../../src/lib/state/roadmap.producer.service';

const LOCATOR = 'plan/next.yaml';
const encoder = new TextEncoder();

const resolved = (
	kind: 'file' | 'opaque',
	locator: string,
	text: string,
): IResolvedProducerInput => ({
	spec: { kind, locator },
	digest: 'a'.repeat(64),
	content: encoder.encode(text),
});

const contextOf = (...inputs: IResolvedProducerInput[]): IProducerContext => ({
	scope: {
		kind: 'project',
		locator: {
			workspaceRoot: '/repo',
			worktreeId: asWorktreeId('wt-A'),
			cacheRoot: '/repo/.cache/delendai',
			docsRoot: '/repo/docs/delendai',
		},
	},
	fingerprint: { abiVersion: STATE_ABI_VERSION, producers: [] },
	resolved: inputs,
});

const ROADMAP = `schemaVersion: 1
horizons:
  - version: 0.5.0
    bumpHint: minor
    entries:
      - id: a
        title: First
        kind: feature
        state: delivered
        gates:
          - kind: proposal-done
            target: f1
      - id: b
        title: Second
        kind: fix
        state: committed
        gates:
          - kind: check-green
            target: build
`;

const producer = createRoadmapProducer({ roadmapLocator: LOCATOR });

describe('roadmap producer', () => {
	it('declares exactly the roadmap file and the proposal index as inputs', () => {
		expect(producer.inputs).toEqual([
			{ kind: 'file', locator: LOCATOR },
			{ kind: 'opaque', locator: ROADMAP_PROPOSALS_INDEX_LOCATOR },
		]);
		expect(producer.abiVersion).toBe(STATE_ABI_VERSION);
	});

	it('takes the roadmap location from its options, not from a default', () => {
		const other = createRoadmapProducer({
			roadmapLocator: 'elsewhere/r.md',
		});
		expect(other.inputs[0]?.locator).toBe('elsewhere/r.md');
	});

	it('derives bump, counts and gate verdicts from the inputs', () => {
		const result = producer.rebuild(
			contextOf(
				resolved('file', LOCATOR, ROADMAP),
				resolved(
					'opaque',
					ROADMAP_PROPOSALS_INDEX_LOCATOR,
					'{"f1":"done"}',
				),
			),
		);
		const horizons = (
			result.canonical as { horizons: Array<Record<string, any>> }
		).horizons;
		expect(horizons).toHaveLength(1);
		expect(horizons[0]?.bump.kind).toBe('minor');
		expect(horizons[0]?.bump.authority).toBe(
			'@delendai/changelog::inferBump',
		);
		expect(horizons[0]?.counts).toEqual({
			total: 2,
			delivered: 1,
			withdrawn: 0,
			open: 1,
		});
		expect(horizons[0]?.entries[0].gates.status).toBe('pass');
		expect(horizons[0]?.entries[1].gates.status).toBe('unknown');
	});

	it('leaves a gate unknown when the proposal index is absent', () => {
		const result = producer.rebuild(
			contextOf(resolved('file', LOCATOR, ROADMAP)),
		);
		const horizons = (
			result.canonical as { horizons: Array<Record<string, any>> }
		).horizons;
		expect(horizons[0]?.entries[0].gates.status).toBe('unknown');
	});

	it('projects an empty roadmap when the file has no content', () => {
		expect(producer.rebuild(contextOf()).canonical).toEqual({
			horizons: [],
		});
	});

	it('reports a file it cannot read as data instead of throwing', () => {
		const result = producer.rebuild(
			contextOf(resolved('file', LOCATOR, 'horizons: [unclosed')),
		);
		expect(Object.keys(result.canonical as object)).toEqual(['error']);
	});

	it('reconciles to the same projection a rebuild gives', () => {
		const ctx = contextOf(resolved('file', LOCATOR, ROADMAP));
		expect(producer.reconcile(ctx, { kind: 'anything' }).canonical).toEqual(
			producer.rebuild(ctx).canonical,
		);
	});

	it('does not change its inputs', () => {
		const file = resolved('file', LOCATOR, ROADMAP);
		const before = new Uint8Array(file.content);
		producer.rebuild(contextOf(file));
		expect(file.content).toEqual(before);
	});

	it('imports nothing that reads or writes a file', () => {
		const dir = join(import.meta.dirname, '../../../../src/lib/state');
		for (const name of readdirSync(dir)) {
			const source = readFileSync(join(dir, name), 'utf8');
			expect(source).not.toMatch(/from 'node:(fs|child_process)/u);
			expect(source).not.toMatch(/Date\.now|Math\.random/u);
		}
	});
});
