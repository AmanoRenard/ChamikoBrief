// 文件名关键词高亮：把名字按搜索词切成片段，命中片段由组件渲染成 <mark>。
// 纯字符串处理，不依赖任何库。

export interface NameSegment {
  text: string;
  match: boolean;
}

/**
 * 按搜索词切分文件名（大小写不敏感）。
 * 搜索词为空、或输入含大小写折叠后长度会变的特殊字符时，返回整段不命中，保证切片位置不错位。
 */
export function splitByKeyword(name: string, query: string): NameSegment[] {
  const keyword = query.trim();
  const plain: NameSegment[] = [{ text: name, match: false }];
  if (!keyword) return plain;

  const haystack = name.toLowerCase();
  const needle = keyword.toLowerCase();
  if (haystack.length !== name.length) return plain;

  const segments: NameSegment[] = [];
  let cursor = 0;

  for (;;) {
    const hit = haystack.indexOf(needle, cursor);
    if (hit < 0) break;
    if (hit > cursor) segments.push({ text: name.slice(cursor, hit), match: false });
    segments.push({ text: name.slice(hit, hit + needle.length), match: true });
    cursor = hit + needle.length;
  }

  if (segments.length === 0) return plain;
  if (cursor < name.length) segments.push({ text: name.slice(cursor), match: false });
  return segments;
}
