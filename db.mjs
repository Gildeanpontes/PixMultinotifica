import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDemoState } from './domain.mjs';

// Uma instância por processo; todas as alterações usam a mesma fila de gravação.
export function createDatabase(directory) {
  const file = path.join(directory, 'app.json');
  let data;
  let queue = (async () => {
    await mkdir(directory, {recursive:true});
    try {
      data = JSON.parse(await readFile(file, 'utf8'));
      if (data.version !== 1 || !data.state || !Array.isArray(data.state.stores)) throw new Error('Formato de armazenamento inválido.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw Object.assign(new Error('Falha ao ler o armazenamento.',{cause:error}),{code:'STORAGE_ERROR'});
      data = {version:1,admin:null,state:createDemoState()};
    }
  })();
  const ready = queue;
  void ready.catch(() => {});
  return {
    async read() { await ready; await queue; return structuredClone(data); },
    update(change) {
      const operation = queue.then(async () => {
        await ready;
        const next = structuredClone(data);
        await change(next);
        const temporary = path.join(directory, `.app-${randomUUID()}.tmp`);
        await writeFile(temporary, JSON.stringify(next, null, 2), {mode:0o600});
        await rename(temporary, file);
        data = next;
        return structuredClone(data);
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
