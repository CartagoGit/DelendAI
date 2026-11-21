/**
 * promotion-declared.spec.ts — a project whose integration engine is `land`
 * declares a promotion schedule. Land opens the promotion; without the
 * schedule open-promotion finds nothing declared and stays silent, which
 * is how main went unpromoted from 2026-11-11 (commit 4cbf96af6).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { describe, expect, it } from 'vitest';

import { repoRoot } from '../lib/repo-root';
import { promotionDeclaration } from './open-promotion.script';

describe('the promotion is declared under land', () => {
	it('[<50ms] this repository declares a schedule while its engine is land', () => {
		const text = readFileSync(
			join(repoRoot(), 'delendai.config.json'),
			'utf8',
		);
		const policy = resolveDevelopmentPolicy(
			JSON.parse(text.replace(/^\s*\/\/.*$/gmu, '')) as never,
		);
		if (policy.integration.engine !== 'land') return;
		expect(promotionDeclaration(text)).toHaveProperty('plan');
	});

	it('[<10ms] a land project with two branches and no schedule is refused with a reason', () => {
		const text = JSON.stringify({
			development: { integration: { engine: 'land' } },
			plugins: { roadmap: { options: { file: 'r.yaml' } } },
		});
		expect(promotionDeclaration(text)).toEqual({ nothing: 'no-schedule' });
	});
});
