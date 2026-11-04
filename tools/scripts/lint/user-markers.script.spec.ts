#!/usr/bin/env bun
/**
 * user-markers.script.spec.ts — proposal f00071 S7 acceptance.
 *
 * `lintUserMarkers` reads `plugins.status-marker.options.markers` from a
 * parsed config object and reports whether the declared markers collide
 * cleanly with the built-ins. The branches under test:
 *   1. No `markers` block (or no status-marker plugin) → ok, declared:false.
 *   2. A clean `add`/`disable`/`override` config → ok, declared:true.
 *   3. A schema violation (bad `id` casing) → not ok.
 *   4. A merge violation (emoji collision, disabling HECHO) → not ok.
 */

import { describe, expect, it } from 'vitest';

import { lintUserMarkers } from './user-markers.script';

describe('user-markers lint (f00071)', () => {
	it('is a no-op success when no markers are declared', () => {
		const r = lintUserMarkers({
			plugins: { 'status-marker': { options: {} } },
		});
		expect(r.ok).toBe(true);
		expect(r.declared).toBe(false);
	});

	it('is a no-op success when status-marker is absent entirely', () => {
		const r = lintUserMarkers({ plugins: { docs: { options: {} } } });
		expect(r.ok).toBe(true);
		expect(r.declared).toBe(false);
	});

	it('tolerates a non-object / empty config', () => {
		expect(lintUserMarkers(undefined).ok).toBe(true);
		expect(lintUserMarkers(null).ok).toBe(true);
		expect(lintUserMarkers({}).ok).toBe(true);
	});

	it('accepts a clean add/disable/override config and reports the count', () => {
		const r = lintUserMarkers({
			plugins: {
				'status-marker': {
					options: {
						markers: {
							add: [
								{
									id: 'REVIEW',
									emoji: '🔷',
									requiresReason: true,
									locales: { es: 'REVISIÓN', en: 'REVIEW' },
								},
							],
							disable: ['SIN PROPUESTA DE NINGUN TIPO'],
							override: {
								BLOQUEADO: { instruction: 'external dep' },
							},
						},
					},
				},
			},
		});
		expect(r.ok).toBe(true);
		expect(r.declared).toBe(true);
		// 8 built-ins − 1 disabled + 1 added.
		expect(r.stateCount).toBe(8);
	});

	it('fails when an added id is not UPPER_SNAKE_CASE (schema)', () => {
		const r = lintUserMarkers({
			plugins: {
				'status-marker': {
					options: {
						markers: {
							add: [
								{
									id: 'review',
									emoji: '🔷',
									requiresReason: false,
								},
							],
						},
					},
				},
			},
		});
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/UPPER_SNAKE_CASE|schema/);
	});

	it('fails when an added emoji collides with a built-in (merge)', () => {
		const r = lintUserMarkers({
			plugins: {
				'status-marker': {
					options: {
						markers: {
							add: [
								{
									id: 'REVIEW',
									emoji: '🟩',
									requiresReason: false,
								},
							],
						},
					},
				},
			},
		});
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/emoji/);
	});

	it('fails when disabling the floor state HECHO (merge)', () => {
		const r = lintUserMarkers({
			plugins: {
				'status-marker': {
					options: { markers: { disable: ['HECHO'] } },
				},
			},
		});
		expect(r.ok).toBe(false);
		expect(r.error).toMatch(/HECHO|floor/);
	});
});
