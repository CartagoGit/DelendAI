#!/usr/bin/env bun
import { runAutoWork } from '@delendai/proposals/lib/tools/auto-work.tool';
import { join } from 'node:path';

const workspaceRoot = '/home/cartago/_projects/delendai';
const proposalsDirAbs = join(workspaceRoot, 'docs/delendai/proposals');

const result = await runAutoWork({
	namespacePrefix: 'proposals',
	indexPathAbs: join(workspaceRoot, '.cache/delendai/proposals/index.json'),
	lockPathAbs: join(workspaceRoot, '.cache/delendai/agents.lock.json'),
	proposalsDirAbs,
	workspaceRoot,
});

const text = result.content?.[0]?.text ?? '';
const parsed = JSON.parse(text);
console.log(JSON.stringify(parsed, null, 2));
