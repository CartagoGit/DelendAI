/**
 * A blocking pre-push command must run on the push it exists to judge.
 *
 * The incident this pins: under the shared-checkout model a candidate is
 * published by pushing a `commit-tree` object while the checkout sits on
 * an unchanged `develop`. lefthook computes an empty file set for that
 * push and — by default — skips every command. Measured on a real
 * publication, the secrets scan, the drift check, branch discipline, the
 * release gate and the publication pre-flight all printed `skip`, and
 * the hook summary still looked like success.
 *
 * `skip_empty: false` is the fix. This spec is the reason it stays: a
 * command added later without it would silently inherit the same hole,
 * and nothing in a green run would say so.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { repoRoot } from '../../scripts/lib/monorepo-paths';

interface ILefthookCommand {
	readonly run?: string;
	readonly skip_empty?: boolean;
}

const prePushCommands = (): ReadonlyMap<string, ILefthookCommand> => {
	const document = parse(
		readFileSync(join(repoRoot(), 'lefthook.yml'), 'utf8'),
	) as {
		readonly 'pre-push'?: {
			readonly commands?: Record<string, ILefthookCommand>;
		};
	};
	return new Map(Object.entries(document['pre-push']?.commands ?? {}));
};

/** Advisory commands end in `|| true`: they report and never block. */
const isBlocking = (command: ILefthookCommand): boolean =>
	!(command.run ?? '').includes('|| true');

describe('pre-push gates', () => {
	it('has commands to check at all', () => {
		// Guards the guard: a parse that silently yields nothing would
		// make every assertion below vacuously true.
		expect(prePushCommands().size).toBeGreaterThan(4);
	});

	it('never lets a blocking command skip itself on an empty file set', () => {
		const offenders = [...prePushCommands()]
			.filter(([, command]) => isBlocking(command))
			.filter(([, command]) => command.skip_empty !== false)
			.map(([name]) => name);
		expect(offenders).toEqual([]);
	});

	it('leaves the advisory formatters free to skip', () => {
		// They are about a file list. Nothing changed, nothing to format
		// — paying for them on every ref push would be noise.
		const advisory = [...prePushCommands()].filter(
			([, command]) => !isBlocking(command),
		);
		expect(advisory.length).toBeGreaterThan(0);
		for (const [, command] of advisory) {
			expect(command.skip_empty).toBeUndefined();
		}
	});
});
