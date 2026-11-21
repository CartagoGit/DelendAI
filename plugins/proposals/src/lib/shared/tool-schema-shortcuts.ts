import z from 'zod';

export const optionalUnknown = () => z.unknown().optional();
export const optionalString = () => z.string().optional();
export const optionalBoolean = () => z.boolean().optional();
