import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { test } from 'node:test';

const sourceRoot = resolve(process.cwd(), 'src');
const extensions = ['.ts', '.tsx'];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : extensions.includes(extname(path)) ? [normalize(path)] : [];
  });
}

function resolveImport(from: string, specifier: string, files: Set<string>) {
  const base = specifier.startsWith('@/') ? resolve(process.cwd(), specifier.slice(2)) : specifier.startsWith('.') ? resolve(from, '..', specifier) : undefined;
  if (!base) return undefined;
  return [base, ...extensions.map(extension => `${base}${extension}`), ...extensions.map(extension => join(base, `index${extension}`))].map(normalize).find(candidate => files.has(candidate));
}

function importGraph() {
  const files = sourceFiles(sourceRoot), fileSet = new Set(files), graph = new Map(files.map(file => [file, [] as string[]]));
  const imports = /(?:import|export)\s+(?:type\s+)?(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const file of files) for (const match of readFileSync(file, 'utf8').matchAll(imports)) {
    if (/^(?:import|export)\s+type\b/.test(match[0])) continue;
    const target = resolveImport(file, match[1], fileSet);
    if (target) graph.get(file)!.push(target);
  }
  return graph;
}

test('application source import graph has no circular dependencies', () => {
  const graph = importGraph();
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (file: string, ancestry: string[]): void => {
    if (visiting.has(file)) assert.fail(`Circular import: ${[...ancestry, file].map(item => item.replace(`${sourceRoot}\\`, '')).join(' -> ')}`);
    if (visited.has(file)) return;
    visiting.add(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency, [...ancestry, file]);
    visiting.delete(file); visited.add(file);
  };
  for (const file of graph.keys()) visit(file, []);
});
