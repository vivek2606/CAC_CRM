function escapeCsvCell(cell: string | number): string {
  const s = String(cell);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const headerLine = headers.map(escapeCsvCell).join(",");
  const lines = rows.map((row) => row.map(escapeCsvCell).join(","));
  return [headerLine, ...lines].join("\r\n");
}
