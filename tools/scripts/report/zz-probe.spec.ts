import { it } from 'vitest';
import {
	connectTokenBudgetClient,
	createTokenBudgetFixtureWorkspace,
} from './token-budget-report-lib';
it('probe', { timeout: 300000 }, async () => {
	const ws = createTokenBudgetFixtureWorkspace();
	const c = await connectTokenBudgetClient(ws, {
		pluginList: 'swarm',
		preset: true,
		surfaceMode: 'native',
	});
	const t = await c.client.listTools();
	(await import('node:fs')).writeFileSync('/tmp/claude-1000/probe.txt', [
		'PROBE tools',
		t.tools.length,
		'errors',
		JSON.stringify(c.loadErrors, null, 1),
		'plugins',
		c.pluginIds.join(','),
	);
	await c.close();
});
