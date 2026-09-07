import z from 'zod';

import { definePlugin } from '@delendai/core/public';

import { SKILLS_PACK_SKILLS } from './skills/catalog';

const OptionsSchema = z.object({});

export default definePlugin({
	name: 'skills-pack',
	version: '0.1.1',
	describe:
		'Skills pack: dev (debugging, performance, pr-review), safety (security-hardening, incident-response), and migration playbooks. Pure guidance, no execution.',
	optionsSchema: OptionsSchema,
	register() {
		return {
			skills: SKILLS_PACK_SKILLS.map((skill) => ({
				id: skill.id,
				path: skill.path,
			})),
			knowledge: [
				{
					id: 'skills-pack-overview',
					title: 'Skills pack overview',
					body: [
						'# Skills pack overview',
						'',
						'This plugin adds six pure-guidance playbooks to the skill surface.',
						'',
											 '- delendai-debugging-playbook: logs, proposal state, and lock triage.',
											 '- delendai-performance-optimization: benchmark, bundle, profile, and quality loop.',
											 '- delendai-pr-review-checklist: scope, history, CI, quality, and security review.',
											 '- delendai-security-hardening-checklist: audit, deps, SAST, secrets, and env posture.',
											 '- delendai-incident-response: remote error intake plus local log and state repair workflow.',
											 '- delendai-migrate-from-x: migration planning using legacy-migration discipline plus refactor tools.',
						'',
						'Every skill is documentation only: no tool execution, no hidden writes, and no project-specific secrets.',
					].join('\n'),
				},
			],
		};
	},
});
