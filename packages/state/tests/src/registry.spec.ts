/**
 * registry.spec.ts — the in-memory driver keeps the registry contract.
 */
import { defineInMemoryStateRegistry } from '../../src/lib/driver-in-memory';
import { registryContract } from './contract/registry-contract.helper';

registryContract('in-memory', defineInMemoryStateRegistry);
