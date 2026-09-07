import { describe, expect, it } from 'vitest'

import {
	canonicalProposalCandidates,
	digestProposalCandidates,
} from '../../../../src/lib/repository/digest'

describe('digest (q00022 S3)', () => {
	it('canonicalizes candidates by uid then path', () => {
		const canonical = canonicalProposalCandidates([
			{
				uid: 'x00002',
				slug: 'x00002',
				path: 'ready/fixes/x00002.md',
				title: 'two',
				kind: 'fix',
				status: 'ready',
				type: 'proposal',
				track: 'general',
				bodyHash: 'b',
			},
			{
				uid: 'x00001',
				slug: 'x00001',
				path: 'ready/fixes/x00001.md',
				title: 'one',
				kind: 'fix',
				status: 'ready',
				type: 'proposal',
				track: 'general',
				bodyHash: 'a',
			},
		])

		expect(canonical.map((entry) => entry.uid)).toEqual(['x00001', 'x00002'])
	})

	it('produces the same digest for the same logical projection in different orders', () => {
		const a = digestProposalCandidates([
			{
				uid: 'x00002',
				slug: 'x00002',
				path: 'ready/fixes/x00002.md',
				title: 'two',
				kind: 'fix',
				status: 'ready',
				type: 'proposal',
				track: 'general',
				bodyHash: 'b',
			},
			{
				uid: 'x00001',
				slug: 'x00001',
				path: 'ready/fixes/x00001.md',
				title: 'one',
				kind: 'fix',
				status: 'ready',
				type: 'proposal',
				track: 'general',
				bodyHash: 'a',
			},
		])
		const b = digestProposalCandidates([
			{
				uid: 'x00001',
				slug: 'x00001',
				path: 'ready/fixes/x00001.md',
				title: 'one',
				kind: 'fix',
				status: 'ready',
				type: 'proposal',
				track: 'general',
				bodyHash: 'a',
			},
			{
				uid: 'x00002',
				slug: 'x00002',
				path: 'ready/fixes/x00002.md',
				title: 'two',
				kind: 'fix',
				status: 'ready',
				type: 'proposal',
				track: 'general',
				bodyHash: 'b',
			},
		])

		expect(a).toBe(b)
	})
})