/**
 * core-public-consumers.spec.ts — x00541 S2.
 *
 * The decision is a pure function over three inputs, so every verdict
 * that matters is a case here rather than a barrel somebody has to
 * stage: an export with a caller, one with a note, one with neither,
 * and — the property the ratchet rests on — one that was already
 * unmoored yesterday.
 */
import { describe, expect, it } from 'vitest';

import {
	ADOPTER_API_TAG,
	annotatedNames,
	judgeConsumers,
} from './core-public-consumers.script';

describe('which names the barrel says are for adopters', () => {
	it('reads a note as covering the block under it', () => {
		const found = annotatedNames(
			[
				`/** ${ADOPTER_API_TAG} an adopting project lands work with these. */`,
				'export {',
				'	createIntegrationEngine,',
				'	runIntegrationCycle,',
				"} from '../lib/integration-engine/index';",
			].join('\n'),
		);

		expect(found.has('createIntegrationEngine')).toBe(true);
		expect(found.has('runIntegrationCycle')).toBe(true);
	});

	it('does not let a note leak into the next block', () => {
		// The note describes what follows it, and nothing else. A leak
		// would silently excuse exports nobody vouched for.
		const found = annotatedNames(
			[
				`/** ${ADOPTER_API_TAG} for adopters. */`,
				"export { covered } from '../lib/a';",
				"export { notCovered } from '../lib/b';",
			].join('\n'),
		);

		expect(found.has('covered')).toBe(true);
		expect(found.has('notCovered')).toBe(false);
	});

	it('finds nothing in a barrel with no notes', () => {
		expect(annotatedNames("export { plain } from '../lib/a';").size).toBe(
			0,
		);
	});
});

describe('judging an export against its callers', () => {
	const entry = (name: string, annotated = false) => ({ name, annotated });

	it('accepts one a caller in this repository uses', () => {
		const report = judgeConsumers({
			exports: [entry('used')],
			consumers: new Set(['used']),
			baseline: new Set(),
		});

		expect(report.withConsumer).toBe(1);
		expect(report.newlyUnmoored).toEqual([]);
	});

	it('accepts one whose note says who it is for', () => {
		// `@delendai/core` is published: "no in-repo importer" is not
		// proof of dead code, which is the whole reason the note exists.
		const report = judgeConsumers({
			exports: [entry('forAdopters', true)],
			consumers: new Set(),
			baseline: new Set(),
		});

		expect(report.annotated).toBe(1);
		expect(report.newlyUnmoored).toEqual([]);
	});

	it('refuses one with neither', () => {
		const report = judgeConsumers({
			exports: [entry('published-in-anticipation')],
			consumers: new Set(),
			baseline: new Set(),
		});

		expect(report.newlyUnmoored).toEqual(['published-in-anticipation']);
	});

	it('tolerates the debt that was already there', () => {
		// A ratchet, not a wall: 527 exports are in this state today and
		// deciding each one is a judgement call, not a lint's job.
		const report = judgeConsumers({
			exports: [entry('old'), entry('new')],
			consumers: new Set(),
			baseline: new Set(['old']),
		});

		expect(report.unmoored).toEqual(['old', 'new']);
		expect(report.newlyUnmoored).toEqual(['new']);
	});

	it('reports a baselined export that has since gained a caller', () => {
		// So the win can be locked in rather than quietly kept as debt.
		const report = judgeConsumers({
			exports: [entry('wasUnmoored')],
			consumers: new Set(['wasUnmoored']),
			baseline: new Set(['wasUnmoored']),
		});

		expect(report.resolved).toEqual(['wasUnmoored']);
		expect(report.newlyUnmoored).toEqual([]);
	});
});
