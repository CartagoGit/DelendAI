/**
 * work-ref-mention.spec.ts — a unit of work is recognised by the
 * project's own ref shape, in whatever words a forge wrapped it.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { findWorkRefMention } from '@delendai/proposals/lib/services/work-ref-mention';

const THIS_REPO = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
}).branches;
const DEFAULTS = resolveDevelopmentPolicy({
	development: { profile: 'shared-checkout-pr' },
}).branches;

const READABLE = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: 'delendai',
			workRefTemplate:
				'heads/delendai/wip/${kind}/${agent}/${scope}/${topic}',
		},
	},
}).branches;

const UNIT = 'claude-opus-5/x00568-S1-g1/a-publication-keeps-its-name';

describe('findWorkRefMention in the scope grammar (f00808)', () => {
	const NEW_UNIT =
		'implement/claude-opus-5/x00568-S1+S4-G2/a-publication-keeps-its-name';

	it('[<20ms] finds a unit named in either spelling, whatever template is configured', () => {
		for (const branches of [THIS_REPO, READABLE]) {
			expect(
				findWorkRefMention(
					`Merge pull request #3 from Owner/delendai/pr/${NEW_UNIT}`,
					branches,
				),
			).toEqual({
				ref: `refs/heads/delendai/wip/${NEW_UNIT}`,
				agent: 'claude-opus-5',
				proposal: 'x00568',
				slice: 'S1+S4',
			});
			expect(
				findWorkRefMention(
					`Merge pull request #3 from Owner/delendai/pr/${UNIT}`,
					branches,
				)?.agent,
			).toBe('claude-opus-5');
		}
	});
});

describe('findWorkRefMention', () => {
	const FORGES: readonly (readonly [string, string])[] = [
		['GitHub', `Merge pull request #303 from Owner/delendai/pr/${UNIT}`],
		['GitLab', `Merge branch 'delendai/pr/${UNIT}' into 'develop'`],
		['Bitbucket', `Merged in delendai/pr/${UNIT} (pull request #303)`],
		[
			'plain git',
			`Merge remote-tracking branch 'origin/delendai/pr/${UNIT}' into develop`,
		],
		[
			'the engine trailer',
			`feat: the work\n\nDelendai-Wip-Ref: refs/heads/delendai/wip/${UNIT}`,
		],
	];

	it.each(FORGES)(
		'[<20ms] reads the unit out of a %s message',
		(_forge, message) => {
			expect(findWorkRefMention(message, THIS_REPO)).toEqual({
				ref: `refs/heads/delendai/wip/${UNIT}`,
				agent: 'claude-opus-5',
				proposal: 'x00568',
				slice: 'S1',
			});
		},
	);

	it('[<200ms] uses the project defaults when no namespace is configured', () => {
		expect(
			findWorkRefMention(
				"Merge branch 'pr/codex-5/f00001-S2-g3/topic' into 'main'",
				DEFAULTS,
			)?.agent,
		).toBe('codex-5');
	});

	it('[<200ms] finds the agent wherever the template puts it', () => {
		const shape = {
			workRefTemplate:
				'heads/team/work/${proposal}-${slice}-g${generation}/${agent}', // work-ref-shape: alternative
			workRefPrefix: 'heads/team/work/',
			publicationRefPrefix: 'team/review/',
		};
		expect(
			findWorkRefMention(
				'Merge pull request #9 from acme/team/review/f00012-S1-g2/copilot-gpt',
				shape,
			),
		).toMatchObject({
			agent: 'copilot-gpt',
			proposal: 'f00012',
			slice: 'S1',
		});
	});

	it('[<200ms] names nobody when the ref does not fit the template', () => {
		expect(
			findWorkRefMention(
				'Merge pull request #301 from Owner/delendai/pr/x00566-guards-run',
				THIS_REPO,
			),
		).toBeUndefined();
		expect(
			findWorkRefMention(
				"Merge branch 'feature/login' into develop",
				THIS_REPO,
			),
		).toBeUndefined();
	});

	it('[<200ms] does not take a prefix that only appears inside another word', () => {
		expect(
			findWorkRefMention(`see notdelendai/pr/${UNIT}`, THIS_REPO),
		).toBeUndefined();
	});
});

describe('findWorkRefMention across namespaces (f00808)', () => {
	const NOW = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: {
				namespacePrefix: '',
				formerNamespacePrefixes: ['delendai'],
			},
		},
	}).branches;

	it('[<20ms] names the agent of a unit under the former namespace', () => {
		for (const text of [
			'Merge pull request #7 from Org/delendai/pr/implement/claude-opus-5/x00568-S1/t',
			'Merge pull request #7 from Org/pr/implement/claude-opus-5/x00568-S1/t',
		]) {
			expect(findWorkRefMention(text, NOW)?.agent).toBe('claude-opus-5');
		}
	});
});
