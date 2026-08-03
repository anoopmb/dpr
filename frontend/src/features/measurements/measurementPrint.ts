import { MEASUREMENT_EXPORT_HEADERS, type MeasurementExportRow } from './measurementExport';

function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CELL = 'border:0.5px solid #777;padding:3px 5px;';
const TH = 'background:#c5d8f0;font-weight:700;';
// Right-align the numeric columns (No, Length, Breadth, Height, Quantity).
const NUMERIC_COLS = new Set([3, 4, 5, 6, 7]);

/** Build a self-contained printable (and Save-as-PDF) Measurement Book page. */
export function buildMeasurementPrintableHTML(
  rows: MeasurementExportRow[],
  opts: { projectName: string; rangeLabel: string; fmtDate: (v: string) => string; preparedByName: string | null },
): string {
  const header = MEASUREMENT_EXPORT_HEADERS.map(
    (h, i) => `<th style="${CELL}${TH}${NUMERIC_COLS.has(i) ? 'text-align:right' : 'text-align:left'}">${esc(h)}</th>`,
  ).join('');

  const body = rows
    .map((r) => {
      const cells = [
        opts.fmtDate(r.date), r.item, r.specification, r.no, r.length,
        r.breadth, r.height, r.quantity, r.unit, r.remarks,
      ];
      const tds = cells
        .map((c, i) => `<td style="${CELL}${NUMERIC_COLS.has(i) ? 'text-align:right;white-space:nowrap' : ''}">${esc(c ?? '')}</td>`)
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  const emptyRow = rows.length === 0
    ? `<tr><td colspan="${MEASUREMENT_EXPORT_HEADERS.length}" style="${CELL}text-align:center;color:#777;padding:12px">No measurements for the selected filters.</td></tr>`
    : '';

  const signatures = `<div style="display:flex;justify-content:space-between;margin-top:32px;padding:0 40px;page-break-inside:avoid">
    <div style="text-align:center;min-width:200px">
      <div style="font-size:8pt;color:#333">Prepared by</div>
      <div style="height:20px"></div>
      <div style="border-top:1px solid #333;padding-top:3px;font-weight:600">${esc(opts.preparedByName ?? '')}</div>
    </div>
    <div style="text-align:center;min-width:200px">
      <div style="font-size:8pt;color:#333">Checked by</div>
      <div style="height:20px"></div>
      <div style="border-top:1px solid #333;padding-top:3px;font-weight:600">&nbsp;</div>
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Measurement Book – ${esc(opts.projectName)} – ${esc(opts.rangeLabel)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #000; margin: 0; padding: 0; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  @media screen {
    body { background: #d0d0d0; padding: 10mm; }
    .page { background: #fff; margin: 0 auto; padding: 10mm; box-shadow: 0 2px 12px rgba(0,0,0,0.2); }
  }
</style>
</head>
<body>
  <div class="page">
    <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1.5px solid #333;padding-bottom:4px;margin-bottom:8px">
      <div style="font-size:12pt;font-weight:700">${esc(opts.projectName)}</div>
      <div style="font-size:10pt;font-weight:600">Measurement Book</div>
      <div style="font-size:9pt;color:#555">Period: ${esc(opts.rangeLabel)}</div>
    </div>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}${emptyRow}</tbody>
    </table>
    ${signatures}
  </div>
</body>
</html>`;
}
