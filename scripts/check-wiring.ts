/**
 * Fails if the screen map points at an API method that doesn't exist, and
 * warns about VocalAPI methods no screen references (possible dead contract).
 *
 *   npm run check:wiring
 */
import { createMockApi } from '../src/mock/mock-api';
import { SCREENS, assertScreenMapWiring } from '../src/screen-map';

const api = createMockApi();
const problems = assertScreenMapWiring(api);

const referenced = new Set<string>();
for (const screen of Object.values(SCREENS)) {
  for (const p of [...screen.loads, ...screen.actions.flatMap((a) => a.calls)]) referenced.add(p);
}

const unreferenced: string[] = [];
for (const [ns, svc] of Object.entries(api)) {
  for (const method of Object.keys(svc as Record<string, unknown>)) {
    if (typeof (svc as Record<string, unknown>)[method] === 'function' && !referenced.has(`${ns}.${method}`)) {
      unreferenced.push(`${ns}.${method}`);
    }
  }
}

if (problems.length) {
  console.error('\n❌ screen-map references methods that do not exist:\n' + problems.map((p) => '  - ' + p).join('\n'));
}
if (unreferenced.length) {
  console.warn(
    '\n⚠️  API methods no screen references (ok for CRUD extras — review):\n' +
      unreferenced.map((p) => '  - ' + p).join('\n'),
  );
}
if (!problems.length) {
  console.log(`\n✅ All ${referenced.size} screen-map API references resolve against VocalAPI.`);
}
process.exit(problems.length ? 1 : 0);
