/**
 * declared-adoptions.spec.ts — the core applies what a plugin's manifest
 * declares for an adoption, and names no plugin itself.
 */
import { describe, expect, it } from 'vitest';

import { declaredAdoptions } from '../../../../src/lib/adopt/declared-adoptions.service';
import type { IPluginRegistryEntry } from '../../../../src/lib/contracts/interfaces/plugin-registry.interface';
import { FIRST_PARTY_PLUGIN_INDEX } from '../../../../src/lib/registry/first-party-index';

const tracker: IPluginRegistryEntry = {
	origin: 'first-party',
	id: 'tracker',
	package: '@delendai/tracker',
	summary: 'A tracker nobody in the core has heard of.',
	tags: [],
	adoption: {
		from: 'repo',
		option: 'project',
		launchPreset: 'swarm',
		rationale: 'Tracker wired for {value}.',
		whenWired: 'Run `{namespacePrefix}_tracker_check` for {value}.',
		whenNotWired:
			'Wire the tracker later with `{namespacePrefix}_tracker_setup`.',
	},
};
const plain: IPluginRegistryEntry = {
	origin: 'first-party',
	id: 'plain',
	package: '@delendai/plain',
	summary: 'Declares nothing.',
	tags: [],
};

describe('declaredAdoptions', () => {
	it('wires a declaring plugin from the request, fills its texts and names its launch preset', () => {
		expect(
			declaredAdoptions([plain, tracker], {
				repo: 'acme/widgets',
				namespacePrefix: 'acme',
			}),
		).toEqual({
			plugins: { tracker: { options: { project: 'acme/widgets' } } },
			rationale: ['Tracker wired for acme/widgets.'],
			residual: ['Run `acme_tracker_check` for acme/widgets.'],
			launchPreset: 'swarm',
		});
	});

	it('leaves the step for later, wires nothing and keeps the launch preset when the field is absent or blank', () => {
		for (const repo of [undefined, '  ']) {
			expect(
				declaredAdoptions([tracker], {
					...(repo === undefined ? {} : { repo }),
					namespacePrefix: 'acme',
				}),
			).toEqual({
				plugins: {},
				rationale: [],
				residual: ['Wire the tracker later with `acme_tracker_setup`.'],
				launchPreset: undefined,
			});
		}
	});

	it('does not wire a plugin the adoption stage defers, and leaves its step for later', () => {
		expect(
			declaredAdoptions([tracker], {
				repo: 'acme/widgets',
				namespacePrefix: 'acme',
				deferredPluginIds: new Set(['tracker']),
			}),
		).toEqual({
			plugins: {},
			rationale: [],
			residual: ['Wire the tracker later with `acme_tracker_setup`.'],
			launchPreset: undefined,
		});
	});

	it('finds the issues declaration in the first-party index, where adoption reads it', () => {
		const declared = declaredAdoptions(FIRST_PARTY_PLUGIN_INDEX.entries, {
			repo: 'acme/widgets',
			namespacePrefix: 'delendai',
		});
		expect(declared.plugins.issues).toEqual({
			options: { repo: 'acme/widgets' },
		});
		expect(declared.launchPreset).toBe('full');
	});
});
