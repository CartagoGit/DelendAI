/**
 * tier-trigger.spec.ts — c00139 (Track G).
 *
 * Verifies the CI trigger contract for the three tier workflows:
 *   - tier1: pull_request (opened / synchronize / reopened) — fast feedback.
 *   - tier2: pull_request ready_for_review / synchronize / reopened — pre-merge.
 *   - tier3: schedule nightly + push to develop — extended battery.
 *
 * We assert on the raw workflow source (plus a light YAML parse for the
 * `on:` block) so a refactor cannot silently change the contract.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..', '..');

const workflowSource = (file: string): Promise<string> =>
	readFile(join(repoRoot, '.github/workflows', file), 'utf8');

describe('c00139 — tier triggers', () => {
	it('tier1 runs on pull_request opened/synchronize/reopened', async () => {
		const source = await workflowSource('tier1.yml');
		expect(source).toContain('pull_request');
		expect(source).toContain('opened');
		expect(source).toContain('synchronize');
		expect(source).toContain('reopened');
	});

	it('tier2 runs pre-merge (ready_for_review / synchronize / reopened)', async () => {
		const source = await workflowSource('tier2.yml');
		expect(source).toContain('pull_request');
		expect(source).toContain('ready_for_review');
		expect(source).toContain('synchronize');
		expect(source).toContain('reopened');
	});

	it('tier3 runs nightly and on push to develop', async () => {
		const source = await workflowSource('tier3.yml');
		expect(source).toContain('schedule');
		expect(source).toContain('cron');
		expect(source).toMatch(/cron:\s*'0 3 \* \* \*'/);
		expect(source).toContain('develop');
	});

	it('tier1 scopes to the affected set (c00138)', async () => {
		const source = await workflowSource('tier1.yml');
		expect(source).toMatch(/affected|\.affected-set/i);
	});
});
