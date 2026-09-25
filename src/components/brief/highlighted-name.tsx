import { splitByKeyword } from "@/lib/highlight";

interface HighlightedNameProps {
  name: string;
  /** 当前搜索词；为空时原样输出 */
  query: string;
}

/** 文件名（命中搜索词的部分以主色淡底高亮） */
export function HighlightedName({ name, query }: HighlightedNameProps) {
  const segments = splitByKeyword(name, query);

  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            className="bg-primary/25 text-primary-lighter rounded-[3px] px-px"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  );
}
