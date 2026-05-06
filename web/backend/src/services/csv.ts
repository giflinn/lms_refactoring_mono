// Hand-rolled CSV writer — RFC 4180-ish. We reach for this instead of a lib
// because the report exports are flat tabular data with predictable shape;
// adding a dep for ~30 lines of escape logic is overkill.
//
// Returns a UTF-8 BOM + content string. The BOM is what makes Excel detect
// UTF-8 instead of mojibake-ing Cyrillic; OpenOffice / Numbers handle it
// either way. Callers send this with Content-Type: text/csv;charset=utf-8.

export type CsvCell = string | number | null | undefined;

function escapeCell(v: CsvCell): string {
  if (v == null) return "";
  const s = typeof v === "number" ? String(v) : v;
  // Quote when the cell contains the delimiter, a quote, or a newline.
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(","));
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  // BOM lets Excel for Windows detect UTF-8 instead of cp1251.
  return "﻿" + lines.join("\r\n") + "\r\n";
}
