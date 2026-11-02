/**
 * The key a registered tool keeps its declared outputSchema under when the
 * SDK was given another one: a union of objects is registered as one object
 * the SDK can validate against, and the declared union stays here for the
 * type generator. Such a tool lists no outputSchema, as it did before.
 */
export const DECLARED_OUTPUT_SCHEMA = 'declaredOutputSchema';
