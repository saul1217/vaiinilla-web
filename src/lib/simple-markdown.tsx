import { Fragment, type ReactNode } from 'react';

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; lang: string | null; code: string }
  | { type: 'table'; header: string[]; rows: string[][] };

function parseGfmTable(lines: string[], start: number): { block: Block; next: number } | null {
  const headerLine = lines[start]!;
  const sepLine = lines[start + 1] ?? '';
  if (!headerLine.includes('|') || !sepLine.includes('|')) return null;
  const isSeparator = sepLine
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .every((c) => /^:?-{3,}:?$/.test(c));
  if (!isSeparator) return null;
  const header = headerLine
    .split('|')
    .map((c) => c.trim())
    .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''));
  const rows: string[][] = [];
  let i = start + 2;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.includes('|')) break;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c, j, arr) => !(j === 0 && c === '') && !(j === arr.length - 1 && c === ''));
    rows.push(cells);
    i += 1;
  }
  return { block: { type: 'table', header, rows }, next: i };
}

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let para: string[] = [];
  let inCode = false;
  let codeLang: string | null = null;
  let codeLines: string[] = [];

  const flushPara = () => {
    if (para.length) {
      const text = para.join(' ').trim();
      if (text) blocks.push({ type: 'paragraph', text });
      para = [];
    }
  };

  while (i < lines.length) {
    const raw = lines[i]!;
    const line = raw.replace(/\t/g, '  ');

    if (inCode) {
      if (line.startsWith('```')) {
        blocks.push({ type: 'code', lang: codeLang, code: codeLines.join('\n') });
        inCode = false;
        codeLang = null;
        codeLines = [];
        i += 1;
        continue;
      }
      codeLines.push(raw);
      i += 1;
      continue;
    }

    // code fence
    if (line.startsWith('```')) {
      flushPara();
      const langPart = line.replace(/^```+/, '').trim();
      codeLang = langPart || null;
      inCode = true;
      codeLines = [];
      i += 1;
      continue;
    }

    // blank line -> flush paragraph
    if (!line.trim()) {
      flushPara();
      i += 1;
      continue;
    }

    // heading
    if (/^#{1,3}\s+/.test(line)) {
      flushPara();
      const m = line.match(/^(#{1,3})\s+(.*)$/);
      const level = (m?.[1]?.length ?? 1) as 1 | 2 | 3;
      const text = (m?.[2] ?? '').trim();
      blocks.push({ type: 'heading', level, text });
      i += 1;
      continue;
    }

    // table
    const table = parseGfmTable(lines, i);
    if (table) {
      flushPara();
      blocks.push(table.block);
      i = table.next;
      continue;
    }

    // default: paragraph line
    para.push(line.trim());
    i += 1;
  }
  flushPara();
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  // Very small inline code support using backticks; no HTML allowed.
  const nodes: ReactNode[] = [];
  const parts = text.split(/(`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(<code key={nodes.length}>{part.slice(1, -1)}</code>);
    } else {
      nodes.push(<Fragment key={nodes.length}>{part}</Fragment>);
    }
  }
  return nodes;
}

export function SimpleMarkdown({ source }: { source: string }) {
  const blocks = parse(source);
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          const Tag = (('h' + b.level) as unknown) as keyof JSX.IntrinsicElements;
          return <Tag key={i}>{b.text}</Tag>;
        }
        if (b.type === 'paragraph') {
          return <p key={i}>{renderInline(b.text)}</p>;
        }
        if (b.type === 'code') {
          return (
            <pre key={i}>
              <code className={b.lang ? `language-${b.lang}` : undefined}>{b.code}</code>
            </pre>
          );
        }
        // table
        return (
          <table key={i}>
            <thead>
              <tr>
                {b.header.map((h, j) => (
                  <th key={j}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </>
  );
}

