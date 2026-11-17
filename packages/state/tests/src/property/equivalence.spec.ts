/**
 * equivalence.spec.ts — the in-memory driver keeps the equivalence property.
 */
import { defineInMemoryStateRegistry } from '../../../src/lib/driver-in-memory';
import { equivalenceProperty } from '../contract/equivalence-property.helper';

equivalenceProperty('in-memory', defineInMemoryStateRegistry);
