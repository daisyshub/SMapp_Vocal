/**
 * Vocal interface layer — public entry point.
 *
 * Frontend code should import from here only:
 *
 *   import { createMockApi, SCREENS, type VocalAPI } from '@vocal/interface';
 *
 * When the backend is ready, replace `createMockApi()` with a real client that
 * also implements `VocalAPI` — no screen code changes.
 */

export * from './types';
export * from './services';
export * from './screen-map';
export { createMockApi, type MockApiOptions } from './mock/mock-api';
export * as seed from './mock/data';
