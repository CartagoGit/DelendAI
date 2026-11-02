/**
 * tier-trigger.spec.ts — c00139 (Track G).
 *
 * Verifies the CI trigger contract:
 *   - ci: pull_request scoped to the change, push to develop in full.
 *   - tier2: pull_request ready_for_review / synchronize / reopened — pre-merge.
 *   - tier3: schedule nightly + push to develop — extended battery.
 *
 * We assert on the raw workflow source so a refactor cannot silently
 * change the contract.
 *
 * `tier1` used to own the fast-feedback tier and is gone. It re-derived
 * the affected set that `affected.yml` had just computed, then ran `bun
 * run lint` over the whole repository — byte-identical to what
 * `ci/lint-biome` was running in parallel — and finished by running
 * essentially the whole suite under a five-minute budget. Its last
 * thirty runs were 28 cancelled and 2 failed: not one green verdict,
 * while showing red on every pull request. Fast feedback that never
 * finishes is not a second opinion, it is a second bill.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..', '..');

const workflowSource = (file: string): Promise<string> =>
	readFile(join(repoRoot, '.github/workflows', file), 'utf8');

describe('c00139 — tier triggers', () => {
	it('ci runs on pull requests and on pushes to the integration branch', async () => {
		const source = await workflowSource('ci.yml');
		expect(source).toContain('pull_request');
		expect(source).toContain('push');
		expect(source).toContain('develop');
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

	// The pair of assertions that keeps the trade honest: a pull
	// request is allowed to run a subset ONLY because the integration
	// branch still runs everything. Dropping the second half turns a
	// filter into a hole.
	it('ci scopes a pull request to what the change can reach', async () => {
		const source = await workflowSource('ci.yml');
		expect(source).toContain(
			'--changed ${{ github.event.pull_request.base.sha }}',
		);
	});

	it('ci still runs the full suite when it is not a pull request', async () => {
		const source = await workflowSource('ci.yml');
		expect(source).toMatch(
			/if \[ "\$\{\{ github\.event_name \}\}" = "pull_request" \]/u,
		);
	});
});
