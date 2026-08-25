import { createHash } from "node:crypto";

export type CsvDocument = {
  delimiter: string;
  rows: Array<{ lineNumber: number; cells: string[] }>;
};

export function decodeCsv(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): CsvDocument {
  const rows: CsvDocument["rows"] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let lineNumber = 1;
  let rowStartLine = 1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      cells.push(cell.trim());
      if (cells.some((value) => value.length > 0)) rows.push({ lineNumber: rowStartLine, cells });
      cells = [];
      cell = "";
      lineNumber += 1;
      rowStartLine = lineNumber;
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  if (cells.some((value) => value.length > 0)) rows.push({ lineNumber: rowStartLine, cells });
  return { delimiter, rows };
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 8);
  const score = (delimiter: string) => lines.reduce((total, line) => total + countOutsideQuotes(line, delimiter), 0);
  return score(";") > score(",") ? ";" : ",";
}

export function rowsToRecords(headers: string[], rows: CsvDocument["rows"]) {
  return rows.map((row) => ({
    lineNumber: row.lineNumber,
    values: Object.fromEntries(headers.map((header, index) => [header, row.cells[index] ?? ""]))
  }));
}

export function parseMoneyToCents(value: string | number | undefined): number {
  if (typeof value === "number") return Math.round(value * 100);
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Valor financeiro inválido: ${value}`);
  return Math.round(parsed * 100);
}

export function parseStatementDate(value: string): string {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(raw);
  if (!match) throw new Error(`Data inválida: ${value}`);
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function countOutsideQuotes(line: string, character: string) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === character) count += 1;
  }
  return count;
}
