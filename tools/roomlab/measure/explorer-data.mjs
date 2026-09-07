// Rebuild the static explorer data from the exact TypeScript network and the
// audited room-art masks. No browser, screenshots or duplicate room definitions.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { ROOM_ART, roomNavigation } from '../explorer-room-art.js';

const modules = new Map();
async function loadTypeScript(file) {
  if (modules.has(file)) return modules.get(file);
  const source = await readFile(file, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const dependencies = new Map();
  for (const specifier of new Set(imports)) {
    if (!specifier.startsWith('.')) throw new Error(`Unexpected nonlocal dependency: ${specifier}`);
    dependencies.set(specifier, await loadTypeScript(resolve(dirname(file), `${specifier}.ts`)));
  }
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: file,
  });
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!dependencies.has(specifier)) throw new Error(`Unresolved dependency: ${specifier}`);
    return dependencies.get(specifier);
  };
  new Function('module', 'exports', 'require', result.outputText)(module, module.exports, localRequire);
  modules.set(file, module.exports);
  return module.exports;
}

const source = fileURLToPath(new URL('../../../src/lib/habitat/navigation.ts', import.meta.url));
const { createHabitatNavigation } = await loadTypeScript(source);
const masks = Object.fromEntries(Object.keys(ROOM_ART).map((id) => [id, roomNavigation(id)]));
const network = createHabitatNavigation(masks);
const output = new URL('../explorer-network.json', import.meta.url);
await writeFile(output, `${JSON.stringify(network, null, 2)}\n`);
const halls = network.scenes.filter((scene) => scene.kind === 'corridor').length;
const rooms = network.scenes.filter((scene) => scene.roomId && !scene.sealed).length;
console.log(`Explorer: ${rooms} accessible existing spaces, ${halls} hallway scenes; Breach sealed.`);
