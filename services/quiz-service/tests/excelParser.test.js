import { afterEach, describe, expect, it } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import { parseExcel } from '../dist/services/parser/excelParser.js';

let tempDirectory;

afterEach(async () => {
  if (tempDirectory) {
    await fs.rm(tempDirectory, { recursive: true, force: true });
    tempDirectory = null;
  }
});

describe('Excel import row limits', () => {
  it('limits worksheet parsing to the configured data-row maximum', async () => {
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'quizfocus-excel-test-'));
    const filePath = path.join(tempDirectory, 'questions.xlsx');
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Question', 'Answer'],
      ['First', 'A'],
      ['Second', 'B'],
      ['Third', 'C'],
      ['Fourth', 'D'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Questions');
    XLSX.writeFile(workbook, filePath);

    const result = parseExcel(filePath, { maxRows: 2 });
    expect(result.headers).toEqual(['Question', 'Answer']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.Question)).toEqual(['First', 'Second']);
  });
});
