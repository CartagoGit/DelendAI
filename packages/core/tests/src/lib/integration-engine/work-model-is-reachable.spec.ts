/**
 * work-model-is-reachable.spec.ts — both integration models must be
 * reachable from the SHIPPED surface, not only from inside this repo.
 *
 * The failure this pins was invisible for as long as it existed.
 * `createWipEngine` was exported from the public barrel, so an agent in
 * any project could checkpoint work to a ref — and the engine that
 * LANDS that work was not on the surface at all, reachable only from
 * inside its own module and its specs. This repository never noticed,
 * because it lands work with `forge:publish`, a script that lives here
 * and ships nowhere. Every other project got half a work model: a way
 * to save work and no way to integrate it.
 */

import { describe, expect, it } from 'vitest';

import * as surface from '@delendai/core/public';

describe('the shipped surface carries a whole work model', () => {
	it('offers a way to SAVE work', () => {
		expect(typeof surface.createWipEngine).toBe('function');
	});

	it('offers a way to LAND it, under both integration models', () => {
		// A project on `shared-checkout-pr` needs the pull-request cycle;
		// one on `shared-checkout-merge` needs the local merge. Shipping
		// one without the other leaves that project unable to finish.
		expect(typeof surface.createIntegrationEngine).toBe('function');
		expect(typeof surface.runIntegrationCycle).toBe('function');
		expect(typeof surface.runLocalMergeCycle).toBe('function');
	});

	it('declares the model it expects the project to follow', () => {
		// A work model an agent has to infer is one it will infer wrong.
		expect(typeof surface.declareWorkflow).toBe('function');
		expect(typeof surface.resolveDevelopmentPolicy).toBe('function');
	});
});
