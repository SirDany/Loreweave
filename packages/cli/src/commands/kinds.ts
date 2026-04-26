import { loadSaga } from '@loreweave/core';

interface KindsOptions {
  json?: boolean;
}

export async function kindsCmd(saga: string, opts: KindsOptions): Promise<void> {
  const s = await loadSaga(saga);
  const list = s.kinds ? Array.from(s.kinds.byId.values()) : [];
  list.sort((a, b) => a.id.localeCompare(b.id));

  if (opts.json) {
    console.log(
      JSON.stringify(
        list.map((k) => ({
          id: k.id,
          name: k.name,
          echoPrefix: k.echoPrefix,
          aliases: k.aliases,
          storage: k.storage,
          builtin: k.builtin,
          source: k.source,
          description: k.description,
          properties: k.properties,
          display: k.display,
        })),
        null,
        2,
      ),
    );
    return;
  }

  if (list.length === 0) {
    console.log('no kinds loaded.');
    return;
  }
  for (const k of list) {
    const tag = k.builtin
      ? k.source
        ? 'builtin (overridden)'
        : 'builtin'
      : 'saga';
    const aliases = k.aliases.length ? `  aliases: ${k.aliases.join(', ')}` : '';
    console.log(`@${k.echoPrefix}  (${k.id})  ${k.name}  [${tag}]`);
    console.log(`  storage: ${k.storage}${aliases}`);
    if (k.description) console.log(`  ${k.description}`);
  }
}
