import { createHash } from 'node:crypto';
import { mkdir, lstat, rename, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Documents can evict generated chunks into cloud-only placeholders on macOS.
// Keep disposable build output local while leaving the source in this project.
const projectDir = resolve(fileURLToPath(new URL('../', import.meta.url)));
const documentsDir = join(homedir(), 'Documents');
const useCache = process.env.FAVOURLOOP_LOCAL_CACHE === 'true' ||
  (process.platform === 'darwin' && projectDir.startsWith(`${documentsDir}/`) &&
    process.env.FAVOURLOOP_LOCAL_CACHE !== 'false');
if (useCache) {
  const name = process.env.FAVOURLOOP_BUILD_DIR || '.next';
  if (!/^\.next(?:-[a-z0-9_-]+)?$/i.test(name)) {
    throw new Error('The local build cache supports .next or .next-<name>.');
  }
  const key = createHash('sha256').update(projectDir).digest('hex').slice(0, 10);
  const workspace = join(homedir(), 'Library', 'Caches', 'FavourLoop', 'builds', key);
  await mkdir(workspace, { recursive: true });
  const modules = join(workspace, 'node_modules');
  const existingModules = await lstat(modules).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!existingModules) await symlink(join(projectDir, 'node_modules'), modules, 'dir');
  const output = join(projectDir, name);
  const current = await lstat(output).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (!current?.isSymbolicLink()) {
    if (current) {
      if (!current.isDirectory()) throw new Error(`${name} must be a build directory.`);
      const backup = `${output}.before-cache-${Date.now()}`;
      await rename(output, backup);
      console.log(`Preserved the previous generated output at ${backup}`);
    }
    const cache = join(workspace, name);
    await mkdir(cache, { recursive: true });
    await symlink(cache, output, 'dir');
    console.log(`FavourLoop build cache: ${cache}`);
  }
}
