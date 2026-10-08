import readExcelFile from 'read-excel-file/universal';
import type { RawCell, RawWorkbook } from '@fitapp/domain';
import { ExcelReadError } from '../errors';

/** Reads every sheet of an .xlsx file into plain rows (dates arrive as Date objects). */
export async function readXlsxToRaw(data: ArrayBuffer): Promise<RawWorkbook> {
  try {
    const sheets = await readExcelFile(data);
    return { sheets: sheets.map((s) => ({ name: s.sheet, rows: s.data as RawCell[][] })) };
  } catch (e) {
    throw new ExcelReadError((e as Error).message || 'файл повреждён или не является .xlsx');
  }
}
