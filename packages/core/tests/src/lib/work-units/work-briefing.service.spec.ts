/**
 * What an entering agent is told, asked without a repository.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	ISwarmUnit,
	ISwarmView,
} from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';
import {
	briefingFrom,
	describeBriefing,
} from '@delendai/core/lib/work-units/work-briefing.service';

const unit = (agent: string, paths: readonly string[]): ISwarmUnit =>
	fakePartial<ISwarmUnit, 'agent' | 'ref' | 'subject' | 'paths'>({
		agent,
		ref: `delendai/wip/${agent}/x00001-S1-g1/its-own-work`,
		subject: 'its own work',
		paths,
	});

const view = (
	units: readonly ISwarmUnit[],
	overlaps: readonly { readonly path: string }[] = [],
	published: readonly ISwarmUnit[] = [],
): ISwarmView =>
	fakePartial<ISwarmView, 'units' | 'overlaps' | 'published'>({
		units,
		published,
		overlaps: overlaps.map((overlap) =>
			fakePartial<ISwarmView['overlaps'][number], 'path' | 'refs'>({
				path: overlap.path,
				refs: ['a', 'b'],
			}),
		),
	});

describe('briefingFrom (x00555 S3)', () => {
	it('states the other live units and leaves out the entering agent own', () => {
		const briefing = briefingFrom({
			agent: 'claude-opus-5',
			view: view([
				unit('gpt-5', ['src/a.ts']),
				unit('claude-opus-5', ['src/mine.ts']),
			]),
		});
		expect(briefing.others).toHaveLength(1);
		expect(briefing.others[0]?.agent).toBe('gpt-5');
	});

	it('carries the paths more than one unit is already changing', () => {
		expect(
			briefingFrom({
				agent: 'a',
				view: view([unit('b', ['src/a.ts'])], [{ path: 'src/a.ts' }]),
			}).contested,
		).toStrictEqual(['src/a.ts']);
	});

	it('says nobody else out loud rather than printing nothing', () => {
		const lines = describeBriefing(
			briefingFrom({ agent: 'a', view: view([]) }),
		);
		// Silence would be indistinguishable from a briefing that never
		// ran, and an agent that cannot tell has to go and check anyway.
		expect(lines.join('\n')).toContain('nobody else');
	});

	it('names each other unit and the contested paths in words', () => {
		const said = describeBriefing(
			briefingFrom({
				agent: 'a',
				view: view(
					[unit('gpt-5', ['src/a.ts', 'src/b.ts'])],
					[{ path: 'src/a.ts' }],
				),
			}),
		).join('\n');
		expect(said).toContain('gpt-5');
		expect(said).toContain('its own work');
		expect(said).toContain('2 path(s)');
		expect(said).toContain('contested');
		expect(said).toContain('src/a.ts');
	});

	it("states somebody else's publication that has not landed, and not one that has", () => {
		const pending = { ...unit('gpt-5', ['src/a.ts']), ahead: 2 };
		const landed = { ...unit('glm-5', ['src/b.ts']), ahead: 0 };
		const mine = { ...unit('a', ['src/c.ts']), ahead: 1 };
		const briefing = briefingFrom({
			agent: 'a',
			view: view([], [], [pending, landed, mine]),
		});
		expect(briefing.others.map((other) => other.agent)).toEqual(['gpt-5']);
		expect(briefing.others[0]?.published).toBe(true);
		expect(describeBriefing(briefing).join('\n')).toContain(
			'(published, waiting to land)',
		);
	});
});
