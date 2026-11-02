#!/usr/bin/env bun
import { runFromManifestsGenerator } from './from-manifests.script.ts';

const result = await runFromManifestsGenerator(process.argv.slice(2));
process.exit(result.exitCode);
