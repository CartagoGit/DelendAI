import { describe, expect, it } from 'vitest';

import { findLandingClaims, readHostDocs } from './host-docs-landing.script';

const doc = (text: string) => [{ path: 'AGENTS.md', text }];

describe('host-docs-landing', () => {
	it('refuses the bootstrap line that sent a merging project to pull requests', () => {
		const claims = findLandingClaims(
			doc(
				'intro\n  A publication ref is never checked out: publish with\n  `forge:publish --from-work-branch`.',
			),
		);

		expect(claims).toHaveLength(1);
		expect(claims[0]).toMatchObject({ path: 'AGENTS.md', line: 3 });
	});

	it('refuses a pull request or a merge stated as the route', () => {
		expect(
			findLandingClaims(doc('Then open a pull request.')),
		).toHaveLength(1);
		expect(
			findLandingClaims(
				doc('The branch integrates through pull requests.'),
			),
		).toHaveLength(1);
		expect(
			findLandingClaims(doc('Merge it into the integration branch.')),
		).toHaveLength(1);
		expect(findLandingClaims(doc('Run gh pr create.'))).toHaveLength(1);
	});

	it('accepts a document that points to the served work model', () => {
		expect(
			findLandingClaims(
				doc(
					'How work starts and lands is the project’s development profile, and the server states it.',
				),
			),
		).toEqual([]);
	});

	it('reads this repository’s host documents, and they pass', () => {
		const docs = readHostDocs(process.cwd());

		expect(docs.map((entry) => entry.path)).toContain(
			'docs/delendai/AGENT-BOOTSTRAP.md',
		);
		expect(findLandingClaims(docs)).toEqual([]);
	});

	it('finds nothing to read in a directory with no host document', () => {
		expect(readHostDocs('/nonexistent-host-docs-root')).toEqual([]);
	});
});
