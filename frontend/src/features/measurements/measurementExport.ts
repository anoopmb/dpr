import * as XLSX from 'xlsx';
import type { MeasurementRead } from '@/api/hooks/useMeasurements';
import type { BoqItemRead } from '@/api/hooks/useBoq';
import type { UomRow } from '@/api/hooks/useMasters';

// Column order of the Measurement Book export / print sheet.
export const MEASUREMENT_EXPORT_HEADERS = [
  'Date', 'Item', 'Specification', 'No', 'Length', 'Breadth', 'Height', 'Quantity', 'Unit', 'Remarks',
] as const;

export interface MeasurementExportRow {
  date: string;          // ISO measurement_date (formatted at render time)
  item: string;          // BOQ item description
  specification: string; // template name (dimension work) / "{dia} mm" (steel line)
  no: string;
  length: string;
  breadth: string;
  height: string;
  quantity: string;
  unit: string;
  remarks: string;
}

// Steel bar-lines store a single coefficient (MT per bar-metre, e.g. 0.000395
// for 8 mm). The agreed sheet decomposes it into Breadth × Height so that
// No × Length × Breadth × Height = weight — Breadth is this fixed kg→MT factor
// and Height carries the rest (coefficient ÷ factor, e.g. 0.395).
const STEEL_MT_FACTOR = 0.001;

/** Show the raw expression the engineer typed (e.g. "(1+2.5)/2") when present,
 * otherwise the stored numeric value. Blank when the field isn't used. */
function dimCell(m: MeasurementRead, key: string): string {
  const expr = m.dimension_expressions?.[key];
  if (expr != null && expr !== '') return expr;
  const v = m.dimensions?.[key];
  return v != null && v !== '' ? v : '';
}

/** Trim float noise (0.000395 / 0.001 → "0.395", not "0.39500000000000002"). */
function trimNum(n: number): string {
  return String(Number(n.toFixed(6)));
}

/**
 * Flatten measurements into one export row each — except steel measurements,
 * which emit one row per bar-line (matching how a Measurement Book records
 * reinforcement). Sorted chronologically (ascending), like a bound MB.
 */
export function buildMeasurementExportRows(
  measurements: MeasurementRead[],
  boqById: Map<string, BoqItemRead>,
  uomById: Map<string, UomRow>,
): MeasurementExportRow[] {
  const sorted = [...measurements].sort((a, b) =>
    a.measurement_date < b.measurement_date ? -1 : a.measurement_date > b.measurement_date ? 1 : 0,
  );

  const rows: MeasurementExportRow[] = [];
  for (const m of sorted) {
    const boq = boqById.get(m.boq_item_id);
    const item = boq?.description ?? m.boq_item_id;
    const unit = boq ? uomById.get(boq.uom_id)?.code ?? '' : '';
    const remarks = m.notes ?? '';

    if (m.steel_lines && m.steel_lines.length > 0) {
      for (const line of m.steel_lines) {
        const coeff = parseFloat(line.coefficient) || 0;
        rows.push({
          date: m.measurement_date,
          item,
          specification: `${line.diameter_mm} mm`,
          no: line.bar_count,
          length: line.length_m,
          breadth: String(STEEL_MT_FACTOR),
          height: trimNum(coeff / STEEL_MT_FACTOR),
          quantity: line.computed_weight_mt,
          unit,
          remarks,
        });
      }
    } else {
      rows.push({
        date: m.measurement_date,
        item,
        specification: m.boq_template_name ?? '',
        no: dimCell(m, 'nos'),
        length: dimCell(m, 'l'),
        breadth: dimCell(m, 'b'),
        height: dimCell(m, 'd'),
        quantity: m.computed_qty,
        unit,
        remarks,
      });
    }
  }
  return rows;
}

// Coerce a pure number to a real numeric cell (sortable/summable in Excel);
// leave expressions like "(1+2.5)/2" and any non-numeric text as strings.
function cell(v: string): string | number {
  const t = v.trim();
  if (t === '') return '';
  return /^-?\d*\.?\d+$/.test(t) ? Number(t) : v;
}

export function exportMeasurementsToExcel(
  rows: MeasurementExportRow[],
  opts: { projectName: string; rangeLabel: string; fmtDate: (v: string) => string },
): void {
  const aoa: (string | number)[][] = [];
  aoa.push([`Measurement Book: ${opts.projectName}`]);
  aoa.push([`Period: ${opts.rangeLabel}`]);
  aoa.push([]);
  aoa.push([...MEASUREMENT_EXPORT_HEADERS]);

  for (const r of rows) {
    aoa.push([
      opts.fmtDate(r.date),
      r.item,
      r.specification,
      cell(r.no),
      cell(r.length),
      cell(r.breadth),
      cell(r.height),
      cell(r.quantity),
      r.unit,
      r.remarks,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 9 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 26 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Measurements');

  const safe = `${opts.projectName}_${opts.rangeLabel}`.replace(/[^\w.-]+/g, '_');
  XLSX.writeFile(wb, `Measurements_${safe}.xlsx`);
}
