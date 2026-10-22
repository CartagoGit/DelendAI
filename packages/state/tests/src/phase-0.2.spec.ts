/**
 * phase-0.2.spec.ts — the in-memory driver keeps the registry contract.
 */
import { defineInMemoryStateRegistry } from '../../src/lib/driver-in-memory';
import { phaseTwoContract } from './contract/phase-0.2-contract.helper';

phaseTwoContract('in-memory', defineInMemoryStateRegistry);
