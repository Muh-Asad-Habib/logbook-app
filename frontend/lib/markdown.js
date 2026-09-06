// Parser blok ringan. Hasil tetap dirender sebagai React text, bukan HTML mentah.
export function markdownBlocks(teks) {
  const lines = String(teks || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;
  const flush = () => { if (list) blocks.push(list); list = null; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      const next = lines.slice(i + 1).find((s) => s.trim()) || '';
      // Markdown loose lists dapat memiliki baris kosong di antara item.
      if (list && (/^\s*(?:[-*•]|\d+[.)])\s+/.test(next) || /^\s{2,}\S/.test(next))) continue;
      flush(); continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      if (!list || list.type !== type) { flush(); list = { type, start: ol ? Number(ol[1]) : undefined, items: [] }; }
      list.items.push(ul ? ul[1] : ol[2]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += '\n' + line.trim(); continue; }
    flush();
    const heading = line.match(/^\s*#{1,4}\s+(.*)$/);
    blocks.push({ type: heading ? 'heading' : 'p', text: heading ? heading[1] : line });
  }
  flush();
  return blocks;
}
