import XLSX from 'xlsx';
import {
  inspectPdfSignature,
  inspectCsvHeuristics,
  inspectJsonQuestionBank,
  validateAndInspectFile,
} from '../src/services/security/fileInspection.service.js';
import {
  isMacroExtension,
  scanExecutableSignatures,
  scanZipForVbaMacros,
  sanitizeErrorPath,
  detectMacrosAndExecutables,
} from '../src/services/security/macroDetector.service.js';
import { SecurityPipeline } from '../src/services/security/securityPipeline.js';

describe('Feature F4: Multi-Format Ingestion & Inspection', () => {
  it('F4-1: Validates standard PDF signature (%PDF-) at offset 0', async () => {
    const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF');
    const result = await validateAndInspectFile(validPdf, 'sample.pdf', 'application/pdf');

    expect(result.ok).toBe(true);
    expect(result.detectedType).toBe('pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.status).toBe('ready');
  });

  it('F4-2: Validates XLSX ZIP container signature (PK 0x50 0x4B)', async () => {
    // Standard ZIP local file header with empty content
    const zipHeader = Buffer.from([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const result = await validateAndInspectFile(zipHeader, 'workbook.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    expect(result.ok).toBe(true);
    expect(result.detectedType).toBe('xlsx');
    expect(result.isMacroFree).toBe(true);
  });

  it('F4-3: Validates CSV text document without null bytes and with valid delimiters', async () => {
    const csvContent = 'Question,Option A,Option B,Correct\r\nWhat is DNS?,Domain Name System,Data Network Service,A\nWhat is TCP?,Transmission Control Protocol,Timing Control Protocol,A';
    const result = await validateAndInspectFile(Buffer.from(csvContent), 'quiz.csv', 'text/csv');

    expect(result.ok).toBe(true);
    expect(result.detectedType).toBe('csv');
    expect(result.mimeType).toBe('text/csv');
  });

  it('F4-4: Validates QuizFocus question-bank JSON and schema fields', async () => {
    const jsonBank = {
      title: 'Computer Science Fundamentals',
      resourceType: 'mcq_bank',
      totalQuestions: 2,
      questions: [
        {
          id: 'q1',
          prompt: 'What is the primary role of an operating system kernel?',
          options: ['Hardware abstraction and process management', 'Web rendering', 'User interface styling', 'Database indexing'],
          correctAnswer: 0,
        },
        {
          id: 'q2',
          prompt: 'What does ACID stand for in transaction processing?',
          options: ['Atomicity, Consistency, Isolation, Durability', 'Algorithm, Cache, Index, Data', 'Application, Client, Interface, Device', 'None of the above'],
          correctAnswer: 0,
        },
      ],
    };

    const result = await validateAndInspectFile(Buffer.from(JSON.stringify(jsonBank)), 'assessment.json', 'application/json');
    expect(result.ok).toBe(true);
    expect(result.detectedType).toBe('json');
    expect(result.status).toBe('ready');
  });

  it('F4-B1: Rejects truncated PDF header (%PD without F-)', async () => {
    const truncatedPdf = Buffer.from('%PD');
    const result = await validateAndInspectFile(truncatedPdf, 'corrupt.pdf', 'application/pdf');

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('INVALID_PDF_HEADER');
    expect(result.status).toBe('rejected');
  });

  it('F4-B2: Rejects empty file buffer (0 bytes)', async () => {
    const emptyBuf = Buffer.alloc(0);
    const result = await validateAndInspectFile(emptyBuf, 'empty.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('EMPTY_FILE');
    expect(result.status).toBe('rejected');
  });

  it('F4-B3: Rejects CSV document containing illegal binary null bytes', async () => {
    const binaryCsv = Buffer.concat([Buffer.from('Question,Option\n'), Buffer.from([0x00, 0x01, 0x02])]);
    const inspection = inspectCsvHeuristics(binaryCsv);

    expect(inspection.valid).toBe(false);
    expect(inspection.failureCode).toBe('BINARY_DATA_IN_CSV');
  });

  it('F4-B4: Rejects JSON question bank with 0 questions (schema violation)', async () => {
    const emptyBank = {
      title: 'Empty Bank',
      resourceType: 'mcq_bank',
      questions: [],
    };
    const inspection = inspectJsonQuestionBank(JSON.stringify(emptyBank));

    expect(inspection.valid).toBe(false);
    expect(inspection.failureCode).toBe('EMPTY_QUESTION_BANK');
  });

  it('F4-B5: Rejects polyglot file with leading HTML before %PDF- header', async () => {
    const polyglot = Buffer.concat([
      Buffer.from('<html><script>evil()</script>'),
      Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj'),
    ]);
    const result = await validateAndInspectFile(polyglot, 'polyglot.pdf', 'application/pdf');

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('POLYGLOT_DETECTED');
    expect(result.status).toBe('rejected');
  });

  it('F4-5: Rejects MIME spoofing when executable binary pretends to be PDF', async () => {
    // Windows PE binary header (MZ) disguised with .pdf filename and application/pdf declared MIME
    const spoofedBinary = Buffer.concat([
      Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
      Buffer.from('DANGEROUS_PAYLOAD_EXECUTABLE_CONTENT'),
    ]);

    const result = await validateAndInspectFile(spoofedBinary, 'syllabus.pdf', 'application/pdf');
    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('MALICIOUS_HEADER_DETECTED');
    expect(result.status).toBe('quarantined');
  });

  it('F4-XLSX-CLEAN: Validates genuine multi-row Excel workbook generated by SheetJS', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer'],
      ['What is the time complexity of binary search?', 'O(n)', 'O(log n)', 'O(1)', 'O(n^2)', 'B'],
      ['Which protocol runs on port 443?', 'HTTP', 'FTP', 'SSH', 'HTTPS', 'D'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'MCQs');
    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Validate directly via file inspection
    const fileResult = await validateAndInspectFile(
      xlsxBuffer,
      'clean_assessment.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(fileResult.ok).toBe(true);
    expect(fileResult.status).toBe('ready');
    expect(fileResult.isMacroFree).toBe(true);
    expect(fileResult.detectedType).toBe('xlsx');

    // Validate via full security pipeline
    const pipelineResult = await SecurityPipeline.inspectUpload({
      buffer: xlsxBuffer,
      filename: 'clean_assessment.xlsx',
      declaredMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(pipelineResult.ok).toBe(true);
    expect(pipelineResult.status).toBe('ready');
    expect(pipelineResult.isMacroFree).toBe(true);
    expect(pipelineResult.detectedType).toBe('xlsx');
  });

  it('F4-CSV-ERR1: Preserves CSV_INSUFFICIENT_ROWS failure code when CSV has header only', async () => {
    const headerOnly = Buffer.from('Question,Option A,Option B,Correct\n');
    const result = await validateAndInspectFile(headerOnly, 'single_row.csv', 'text/csv');

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('CSV_INSUFFICIENT_ROWS');
    expect(result.status).toBe('rejected');
  });

  it('F4-CSV-ERR2: Preserves CSV_NO_DELIMITER failure code when CSV has no standard delimiter', async () => {
    const noDelimiter = Buffer.from('QuestionWithNoDelimiterHeader\nAnswerRowWithoutAnyDelimiters\n');
    const result = await validateAndInspectFile(noDelimiter, 'nodelim.csv', 'text/csv');

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe('CSV_NO_DELIMITER');
    expect(result.status).toBe('rejected');
  });
});

describe('Feature F5: Macro & Executable Rejection', () => {
  it('F5-1 / F5-B1: Rejects case-insensitive macro extensions (.xlsm, .xltm, .xlsb, .XLSM, .XltM)', () => {
    const macroExts = ['sheet.xlsm', 'template.xltm', 'binary.xlsb', 'addon.xlam', 'SHEET.XLSM', 'doc.XltM'];
    for (const file of macroExts) {
      expect(isMacroExtension(file)).toBe(true);
    }

    const nonMacro = ['data.xlsx', 'report.xls', 'table.csv', 'bank.json', 'doc.pdf'];
    for (const file of nonMacro) {
      expect(isMacroExtension(file)).toBe(false);
    }
  });

  it('F5-2: Detects and rejects embedded vbaProject.bin in workbook containers', () => {
    const header = Buffer.from('PK\x03\x04\x14\x00\x00\x00\x08\x00', 'binary');
    const vbaPath = Buffer.from('xl/vbaProject.bin', 'utf8');
    const dummyData = Buffer.from('VBA_PROJECT_SIGNATURE_DATA', 'utf8');
    const container = Buffer.concat([header, vbaPath, dummyData]);

    const scan = scanZipForVbaMacros(container);
    expect(scan.hasMacros).toBe(true);
  });

  it('F5-B2: Detects embedded VBA signature in nested arbitrary path', () => {
    const nestedContainer = Buffer.from('test/nested/deep/path/xl/vbaProject.bin');
    const scan = scanZipForVbaMacros(nestedContainer);
    expect(scan.hasMacros).toBe(true);
  });

  it('F5-3: Rejects Windows PE executable files (MZ header 0x4D 0x5A)', () => {
    const peHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    const scan = scanExecutableSignatures(peHeader);

    expect(scan.isExecutable).toBe(true);
    expect(scan.type).toBe('PE');
  });

  it('F5-B3: Rejects Linux ELF executable files (0x7F ELF header)', () => {
    const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01]);
    const scan = scanExecutableSignatures(elfHeader);

    expect(scan.isExecutable).toBe(true);
    expect(scan.type).toBe('ELF');
  });

  it('F5-4 / F5-B4: Macro rejection records exact quarantine code in asset status', async () => {
    const macroBuffer = Buffer.concat([
      Buffer.from('PK\x03\x04\x14\x00\x00\x00\x08\x00', 'binary'),
      Buffer.from('xl/vbaProject.bin', 'utf8'),
      Buffer.from('DUMMY_VBA_PAYLOAD'),
    ]);

    const result = await detectMacrosAndExecutables({
      buffer: macroBuffer,
      filename: 'macro-infected.xlsx',
    });

    expect(result.isClean).toBe(false);
    expect(result.status).toBe('quarantined');
    expect(result.failureCode).toBe('MACRO_STREAM_DETECTED');
  });

  it('F5-5: Safe error reporting never leaks internal server storage paths', () => {
    const rawPaths = [
      'Failed reading C:\\Users\\asus\\Desktop\\mcq\\uploads\\secret\\file.xlsm',
      'Error occurred at D:\\mcq-platform\\storage\\payload.bin',
      'Cannot open /home/ubuntu/mcq-platform/media-storage/quarantine/infected.exe',
      'Unlink failed on /var/upload/temp/bomb.zip',
    ];

    for (const msg of rawPaths) {
      const sanitized = sanitizeErrorPath(msg);
      expect(sanitized).not.toMatch(/[C-Z]:\\|\/home\/|\/var\/upload|mcq-platform/i);
      expect(sanitized).toContain('[internal-storage-path]');
    }
  });
});
