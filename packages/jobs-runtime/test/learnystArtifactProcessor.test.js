'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  processPdf,
  processXlsx,
  processDocx,
  processPptx,
  processAttachmentFile,
  updateLearnystLessonsDb,
} = require('../lib/learnystArtifactProcessor');
const db = require('../lib/db');

describe('learnystArtifactProcessor', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact_test_'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('processAttachmentFile rejects unsupported extensions', async () => {
    const fakeFile = path.join(tmpDir, 'test.unknown');
    fs.writeFileSync(fakeFile, 'some data');
    await expect(processAttachmentFile(fakeFile)).rejects.toThrow(
      /Unsupported attachment extension/
    );
  });

  test('processAttachmentFile handles a mock PDF via cleanRaw option', async () => {
    const pdfFile = path.join(tmpDir, 'sample.pdf');
    // Minimal valid PDF structure
    const minimalPdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer << /Size 4 /Root 1 0 R >>
startxref
190
%%EOF`;
    fs.writeFileSync(pdfFile, minimalPdf);

    const res = await processAttachmentFile(pdfFile, { cleanRaw: false });
    expect(res).toBeDefined();
    expect(res.format).toBe('txt');
    expect(fs.existsSync(path.join(tmpDir, 'sample.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'sample.json'))).toBe(true);
  });

  test('updateLearnystLessonsDb operates without crashing on empty db', () => {
    const res = updateLearnystLessonsDb(new Map(), new Map());
    expect(res).toHaveProperty('lessonsUpdated');
    expect(res).toHaveProperty('attachmentsTagged');
  });
});
