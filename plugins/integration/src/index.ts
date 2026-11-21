/**
 * @delendai/integration — from a ready pull request to a merged commit and
 * a told session. This slice ships the rehearsal that proves the flow on
 * the real forge; the integrator moves in with later slices. It serves no
 * tool: the rehearsal is run from the CLI (`delendai integration rehearse`).
 */
import { definePlugin } from '@delendai/core/plugin';
import z from 'zod';

export * from './public/index';

export default definePlugin({
	name: 'integration',
	version: '0.3.0',
	describe:
		'The pull request flow proven on real GitHub: a rehearsal that plays every case and production failure as a scenario and reports what the forge did.',
	optionsSchema: z.object({}),
	register() {
		return { tools: [] };
	},
});
