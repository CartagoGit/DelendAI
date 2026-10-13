import { describe, expect, it } from 'vitest';

import { ROADMAP_BUMP_AUTHORITY } from '../../../../src/lib/contracts/constants/bump-intent.constant';
import type { IRoadmapHorizon } from '../../../../src/lib/contracts/interfaces/roadmap.interface';
import {
	horizonDelta,
	isPublished,
} from '../../../../src/lib/read-model/roadmap-delta.service';
import { horizonReadiness } from '../../../../src/lib/read-model/roadmap-readiness.service';
import { entry, horizon } from './read-model.fixture';

const pathGate = (target: string) => ({ kind: 'path-exists', target }) as const;
const evidence = { pathExists: (path: string) => path === 'a.ts' };

const deltaOf = (subject: IRoadmapHorizon, published: boolean | null) =>
	horizonDelta(subject, horizonReadiness(subject, evidence), published);

describe('horizonDelta', () => {
	const mixed = horizon(
		'0.5.0',
		[
			entry('a', 'delivered', [pathGate('a.ts')]),
			entry('b', 'in-progress'),
			entry('c', 'superseded'),
		],
		'minor',
	);

	it('gives the three columns and the bump with its authority', () => {
		const delta = deltaOf(mixed, false);
		expect(delta.declared).toEqual(['a', 'b']);
		expect(delta.delivered).toEqual(['a']);
		expect(delta.published).toBe(false);
		expect(delta.bump).toEqual({
			kind: 'minor',
			authority: ROADMAP_BUMP_AUTHORITY,
			declared: 'minor',
			coherent: true,
		});
	});

	it('says to deliver or withdraw what holds the version back', () => {
		expect(deltaOf(mixed, false).nextAction).toBe(
			'deliver, or withdraw with a reason: b',
		);
	});

	it('says to promote when everything promised is delivered', () => {
		const done = horizon('0.5.0', [
			entry('a', 'delivered', [pathGate('a.ts')]),
		]);
		expect(deltaOf(done, null).nextAction).toMatch(/^promote: /u);
		expect(deltaOf(done, null).published).toBeNull();
	});

	it('says to gather evidence when nothing failed and something is unverified', () => {
		const unverified = horizon('0.5.0', [
			entry('a', 'delivered', [{ kind: 'check-green', target: 'ci' }]),
		]);
		expect(deltaOf(unverified, false).nextAction).toBe(
			'gather the evidence for: a',
		);
	});

	it('asks for the record to be set straight when a version shipped short', () => {
		expect(deltaOf(mixed, true).nextAction).toContain(
			'mark b as deferred, dropped or superseded',
		);
	});

	it('has nothing to do for a published version that kept its promises', () => {
		const done = horizon('0.5.0', [
			entry('a', 'delivered', [pathGate('a.ts')]),
		]);
		expect(deltaOf(done, true).nextAction).toMatch(/^nothing: /u);
	});

	it('reports a declared hint that the promised kinds do not imply', () => {
		const delta = deltaOf(
			horizon('0.5.0', [entry('a', 'committed', [], 'fix')], 'major'),
			false,
		);
		expect(delta.bump.coherent).toBe(false);
		expect(delta.bump.declared).toBe('major');
	});
});

describe('isPublished', () => {
	it('is true once the project version reaches the horizon', () => {
		expect(isPublished('0.5.0', '0.5.0')).toBe(true);
		expect(isPublished('0.5.0', '0.5.1')).toBe(true);
		expect(isPublished('0.5.0', '1.0.0')).toBe(true);
		expect(isPublished('v0.5.0', '0.5.0-rc.1')).toBe(true);
	});

	it('is false while the project version is behind it', () => {
		expect(isPublished('0.5.0', '0.4.9')).toBe(false);
		expect(isPublished('1.0', '0.9.9')).toBe(false);
	});

	it('is null when either cannot be read as numbers, or none is known', () => {
		expect(isPublished('0.5.0', undefined)).toBeNull();
		expect(isPublished('next', '0.5.0')).toBeNull();
		expect(isPublished('0.5.0', 'unreleased')).toBeNull();
	});
});
