import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { createWriteGitRunner, UNANCHORED } from '@delendai/core/public';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

const projectRoot = pathToFileURL(`${process.cwd()}/`);
const { bindWipCheckpointPort } = await import(
	new URL(
		'plugins/commit-policy/src/lib/persistence/wip-binding.ts',
		projectRoot,
	).href
);
const { createPolicyPersistence } = await import(
	new URL(
		'plugins/commit-policy/src/lib/persistence/wip-persistence.ts',
		projectRoot,
	).href
);
const execFileAsync = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'commit-policy-owner-mismatch-'));

try {
	const git = (args: readonly string[]) =>
		execFileAsync('git', [...args], { cwd: root });
	await git(['init', '-q', '-b', 'develop']);
	await git(['config', 'user.name', 'Audit']);
	await git(['config', 'user.email', 'audit@example.test']);
	await writeFile(join(root, 'src.ts'), 'export const value = 1;\n');
	await git(['add', 'src.ts']);
	await git(['commit', '-qm', 'chore: fixture']);
	await writeFile(join(root, 'src.ts'), 'export const value = 2;\n');

	const run = createWriteGitRunner(root);
	const wip = await bindWipCheckpointPort(root, UNANCHORED);
	if (wip === undefined) throw new Error('could not bind WIP engine');
	const policy = {
		...expandProfile('shared-checkout-merge'),
		persistence: {
			...expandProfile('shared-checkout-merge').persistence,
			autoPushAfterCommit: false,
		},
	};
	const persistFor = (agentId: string) =>
		createPolicyPersistence({
			policy,
			run,
			wip,
			agentId,
			agentDeclared: () => true,
		});
	const agentA = persistFor('agent-a');
	const agentB = persistFor('agent-b');
	if (agentA === undefined || agentB === undefined)
		throw new Error('WIP route not selected');
	const request = {
		triggerKind: 'slice' as const,
		proposalId: 'f00999',
		sliceId: 'S1',
		message: 'feat(f00999): implement slice S1',
		claimedPaths: ['src.ts'],
		eventId: 'same-slice-event',
	};
	const first = await agentA.persist(request);
	const second = await agentB.persist(request);
	const refs = await git([
		'for-each-ref',
		'--format=%(refname)',
		'refs/heads/wip',
	]);
	console.log(
		JSON.stringify(
			{
				sameEventId: request.eventId,
				agentA:
					first.handled && first.status !== 'refused'
						? first.report.ref
						: first,
				agentB:
					second.handled && second.status !== 'refused'
						? second.report.ref
						: second,
				localWorkRefs: refs.stdout.trim().split('\n').filter(Boolean),
			},
			null,
			2,
		),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
