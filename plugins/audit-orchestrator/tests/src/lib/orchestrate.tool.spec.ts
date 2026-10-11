import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
	FakeDispatchPort,
	type IDispatchPort,
} from '@delendai/agent-orchestrator/public';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildOrchestratePlanRegistration,
	buildOrchestrateRunRegistration,
} from '../../../src/lib/tools/orchestrate.tool';

const invoke = async (
	registration:
		| ReturnType<typeof buildOrchestratePlanRegistration>
		| ReturnType<typeof buildOrchestrateRunRegistration>,
	args: unknown,
): Promise<{ content: Array<{ text: string }> }> => {
	let handler:
		| ((value: unknown) => Promise<{ content: Array<{ text: string }> }>)
		| undefined;
	await registration.register({
		registerTool: (
			_name: string,
			_description: unknown,
			fn: typeof handler,
		) => {
			handler = fn;
		},
	} as never);
	if (!handler)
		throw new Error('orchestrator tool did not register a handler');
	return handler(args);
};

const workspaceProvider = (root: string) => ({
	root,
	resolve: (relativePath: string) => join(root, relativePath),
});

const plan = `---
id: q00001
status: ready
type: plan
kind: plan
title: Example plan
contains:
    proposals:
        - id: x00001
          kind: fix
          required: true
          title: Repair boundary
---

# q00001

## Slices

### q00001-s1 — Fix: Repair boundary
- **Files**:
    - \`src/example.ts\`
- **Acceptance**: tests pass
`;

describe('audit orchestrator tools', () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'audit-orchestrator-'));
		await mkdir(join(root, 'docs'), { recursive: true });
		await writeFile(join(root, 'docs', 'plan.md'), plan, 'utf8');
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('previews tasks without dispatching', async () => {
		const out = JSON.parse(
			(
				await invoke(
					buildOrchestratePlanRegistration({
						namespacePrefix: 'audit',
						workspace: workspaceProvider(root),
					}),
					{ planPath: 'docs/plan.md' },
				)
			).content[0]!.text,
		);
		expect(out.dryRun).toBe(true);
		expect(out.tasks[0].id).toBe('q00001-q00001-s1');
	});

	it('refuses real execution without an injected port', async () => {
		const out = JSON.parse(
			(
				await invoke(
					buildOrchestrateRunRegistration({
						namespacePrefix: 'audit',
						workspace: workspaceProvider(root),
					}),
					{ planPath: 'docs/plan.md', dryRun: false },
				)
			).content[0]!.text,
		);
		expect(out.ok).toBe(false);
		expect(out.error.reason).toBe('dispatch-port-not-configured');
	});

	it('executes derived tasks through the injected dispatch port', async () => {
		const port: IDispatchPort = new FakeDispatchPort();
		const out = JSON.parse(
			(
				await invoke(
					buildOrchestrateRunRegistration({
						namespacePrefix: 'audit',
						workspace: workspaceProvider(root),
						dispatchPort: () => port,
					}),
					{ planPath: 'docs/plan.md', dryRun: false, mode: 'linear' },
				)
			).content[0]!.text,
		);
		expect(out.dryRun).toBe(false);
		expect(out.results).toHaveLength(1);
		expect(out.results[0].ok).toBe(true);
	});
});
