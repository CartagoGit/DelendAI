/**
 * agent-slots-in-sync.spec.ts — a host list kept beside `AGENT_HOSTS` is found.
 */
import { describe, expect, it } from 'vitest';

import { parallelHostLists } from './agent-slots-in-sync.script';

const vocabulary = new Set(['claude-code', 'cursor', 'CLAUDECODE']);

describe('parallelHostLists', () => {
	it('names a new array that spells two host names', () => {
		expect(
			parallelHostLists(
				[
					{
						path: 'packages/core/src/lib/x.ts',
						text: "const a = 1;\nexport const HOSTS = ['claude-code', 'cursor'];\n",
					},
				],
				vocabulary,
			),
		).toEqual(['packages/core/src/lib/x.ts:2 [claude-code, cursor]']);
	});

	it('leaves one name, the source and an exempt file alone', () => {
		expect(
			parallelHostLists(
				[
					{
						path: 'packages/core/src/lib/y.ts',
						text: "['cursor', 'vim']",
					},
					{
						path: 'packages/core/src/lib/contracts/constants/agent-hosts.constant.ts',
						text: "['claude-code', 'cursor']",
					},
					{
						path: 'apps/web/src/data/marquees.ts',
						text: "['claude-code', 'cursor']",
					},
				],
				vocabulary,
			),
		).toEqual([]);
	});
});
