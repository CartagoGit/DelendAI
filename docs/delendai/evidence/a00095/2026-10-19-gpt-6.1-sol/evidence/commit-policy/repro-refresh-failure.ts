import { pathToFileURL } from 'node:url';
const root = pathToFileURL(`${process.cwd()}/`);
const { createBranchProtectionAdapter } = await import(
	new URL(
		'plugins/commit-policy/src/lib/services/branch-protection-adapter.ts',
		root,
	).href
);
const { runPushDriver } = await import(
	new URL('plugins/commit-policy/src/lib/services/push-driver.ts', root).href
);
let queryFails = false;
const policy = {
	enabled: true,
	remote: 'origin',
	protectedBranches: [],
	protectedPrefixes: [],
	force: 'never',
};
const adapter = createBranchProtectionAdapter({
	workspaceRoot: process.cwd(),
	policy: policy as never,
	exec: async ({ tool }: { tool: { id: string } }) => {
		if (tool.id === 'git')
			return {
				ok: true,
				stdout: 'https://github.com/example/project.git',
				stderr: '',
				exitCode: 0,
			};
		return queryFails
			? {
					ok: false,
					stdout: '',
					stderr: 'synthetic auth/network failure',
					exitCode: 1,
				}
			: { ok: true, stdout: 'maintenance\n', stderr: '', exitCode: 0 };
	},
});
const first = await adapter.refresh();
queryFails = true;
const second = await adapter.refresh();
const gitCalls: string[][] = [];
const runner = async (args: string[]) => {
	gitCalls.push(args);
	return { ok: true, output: '', exitCode: 0 };
};
const push = await runPushDriver(
	{ remote: 'origin', branch: 'maintenance' },
	policy as never,
	runner as never,
);
console.log(
	JSON.stringify({
		firstState: first.state,
		protectedAfterFirstRefresh: first.effectiveBranches,
		secondState: second.state,
		protectedAfterFailedRefresh: second.effectiveBranches,
		push,
		gitCalls,
	}),
);
