import { describe, expect, it } from 'vitest';

import { writeIdentityFindings } from './workflow-write-identity.script';

const wf = (step: string): string =>
	`name: x\non: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${step}\n`;

describe('workflow-write-identity', () => {
	it('[<10ms] refuses a pull request opened with the workflow token', () => {
		const found = writeIdentityFindings(
			'a.yml',
			wf(
				'      - name: open\n        env:\n          GH_TOKEN: ${{ github.token }}\n        run: gh pr create --fill',
			),
		);
		expect(found.map((f) => f.step)).toEqual(['open']);
	});

	it('[<10ms] refuses a branch pushed with no token named', () => {
		expect(
			writeIdentityFindings(
				'a.yml',
				wf(
					'      - name: sync\n        run: git push origin HEAD:sync',
				),
			),
		).toHaveLength(1);
	});

	it('[<10ms] accepts the identity token and a tag push', () => {
		expect(
			writeIdentityFindings(
				'a.yml',
				wf(
					'      - name: open\n        env:\n          GH_TOKEN: ${{ steps.identity.outputs.token }}\n        run: gh pr create --fill',
				),
			),
		).toEqual([]);
		expect(
			writeIdentityFindings(
				'a.yml',
				wf(
					'      - name: tag\n        run: git push origin "v$VERSION"',
				),
			),
		).toEqual([]);
	});

	it('[<10ms] refuses a create-pull-request action given the workflow token', () => {
		expect(
			writeIdentityFindings(
				'a.yml',
				wf(
					'      - name: pr\n        uses: peter-evans/create-pull-request@v1\n        with:\n          token: ${{ secrets.GITHUB_TOKEN }}',
				),
			),
		).toHaveLength(1);
	});
});
