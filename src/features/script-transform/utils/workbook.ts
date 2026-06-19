import * as XLSX from 'xlsx';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function isExcelFile(file: File) {
  return /\.(xls|xlsx)$/i.test(file.name);
}

export function isCsvFile(file: File) {
  return /\.csv$/i.test(file.name);
}

export type LoadedWorkbook = {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
};

export async function readWorkbook(file: File): Promise<LoadedWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (workbook.SheetNames.length === 0) throw new Error('ไม่พบ sheet ในไฟล์ Excel');
  return { workbook, sheetNames: workbook.SheetNames };
}

export function workbookSheetToCsv(wb: XLSX.WorkBook, sheetName: string): string {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`ไม่พบ sheet "${sheetName}"`);
  return XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function downloadCsv(fileName: string, csvContent: string) {
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
