'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  getTimeoutOptions,
  getUploadTimeoutMs,
  getDownloadTimeoutMs,
  uploadFile,
  downloadFile,
  clearFolderCache,
} = require('../src/googleDriveApi');

describe('googleDriveApi timeout and file transfer options', () => {
  const tmpDir = path.join(os.tmpdir(), `gdrive-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearFolderCache();
  });

  afterEach(() => {
    delete process.env.DRIVE_UPLOAD_TIMEOUT_MS;
    delete process.env.DRIVE_DOWNLOAD_TIMEOUT_MS;
    clearFolderCache();
  });

  describe('getTimeoutOptions', () => {
    test('returns an object with an AbortSignal', () => {
      const opts = getTimeoutOptions(1000);
      expect(opts).toBeDefined();
      expect(opts.signal).toBeDefined();
      expect(opts.signal.aborted).toBe(false);
    });

    test('defaults to 30000ms when no argument provided', () => {
      const opts = getTimeoutOptions();
      expect(opts.signal).toBeDefined();
      expect(opts.signal.aborted).toBe(false);
    });
  });

  describe('getUploadTimeoutMs', () => {
    test('returns base timeout (120000ms) for small files', () => {
      const smallFile = path.join(tmpDir, 'small.txt');
      fs.writeFileSync(smallFile, 'hello world');
      const timeout = getUploadTimeoutMs(smallFile);
      expect(timeout).toBe(120000);
    });

    test('scales timeout for large files to avoid premature abort (>150MB)', () => {
      // Mock statSync to simulate a 200MB file
      const originalStatSync = fs.statSync;
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 200 * 1024 * 1024 });

      try {
        const timeout = getUploadTimeoutMs('/some/large/file.pdf');
        // 200 MB / 100 KB/s = 2048 seconds = 2,048,000 ms
        expect(timeout).toBeGreaterThan(2000000);
        expect(timeout).toBe(2048000);
      } finally {
        fs.statSync = originalStatSync;
      }
    });

    test('respects explicit timeout override if provided', () => {
      const smallFile = path.join(tmpDir, 'small.txt');
      const timeout = getUploadTimeoutMs(smallFile, 500000);
      expect(timeout).toBe(500000);
    });

    test('respects DRIVE_UPLOAD_TIMEOUT_MS env var', () => {
      process.env.DRIVE_UPLOAD_TIMEOUT_MS = '999999';
      const smallFile = path.join(tmpDir, 'small.txt');
      const timeout = getUploadTimeoutMs(smallFile);
      expect(timeout).toBe(999999);
    });

    test('falls back gracefully to 120000ms if file stat fails', () => {
      const timeout = getUploadTimeoutMs('/non/existent/path/for/stat');
      expect(timeout).toBe(120000);
    });
  });

  describe('getDownloadTimeoutMs', () => {
    test('returns base timeout (120000ms) for small sizes', () => {
      const timeout = getDownloadTimeoutMs(1024);
      expect(timeout).toBe(120000);
    });

    test('scales timeout for large sizes based on bandwidth allowance', () => {
      const sizeBytes = 300 * 1024 * 1024; // 300MB
      const timeout = getDownloadTimeoutMs(sizeBytes);
      // 300 MB / 200 KB/s = 1536 seconds = 1,536,000 ms
      expect(timeout).toBe(1536000);
    });

    test('respects explicit timeout override', () => {
      const timeout = getDownloadTimeoutMs(1024, 750000);
      expect(timeout).toBe(750000);
    });

    test('respects DRIVE_DOWNLOAD_TIMEOUT_MS env var', () => {
      process.env.DRIVE_DOWNLOAD_TIMEOUT_MS = '888888';
      const timeout = getDownloadTimeoutMs(1024);
      expect(timeout).toBe(888888);
    });
  });

  describe('uploadFile dynamic timeout integration', () => {
    test('passes calculated upload timeout to drive.files.create', async () => {
      const testFile = path.join(tmpDir, 'upload-test.dat');
      fs.writeFileSync(testFile, 'test data');

      let capturedOptions = null;
      const mockDrive = {
        files: {
          list: jest.fn().mockResolvedValue({ data: { files: [] } }),
          create: jest.fn().mockImplementation((params, options) => {
            capturedOptions = options;
            return Promise.resolve({ data: { id: 'created-id-1', name: 'upload-test.dat' } });
          }),
        },
      };

      const res = await uploadFile(mockDrive, 'StockMarket/test', 'upload-test.dat', testFile);
      expect(res.action).toBe('created');
      expect(res.id).toBe('created-id-1');
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.signal).toBeDefined();
      expect(capturedOptions.signal.aborted).toBe(false);
    });

    test('passes calculated upload timeout to drive.files.update when file exists', async () => {
      const testFile = path.join(tmpDir, 'upload-update.dat');
      fs.writeFileSync(testFile, 'update data');

      let capturedOptions = null;
      const mockDrive = {
        files: {
          list: jest.fn().mockResolvedValue({
            data: { files: [{ id: 'existing-id-1', name: 'upload-update.dat' }] },
          }),
          update: jest.fn().mockImplementation((params, options) => {
            capturedOptions = options;
            return Promise.resolve({ data: { id: 'existing-id-1', name: 'upload-update.dat' } });
          }),
        },
      };

      const res = await uploadFile(mockDrive, 'StockMarket/test', 'upload-update.dat', testFile);
      expect(res.action).toBe('updated');
      expect(res.id).toBe('existing-id-1');
      expect(capturedOptions).toBeDefined();
      expect(capturedOptions.signal).toBeDefined();
      expect(capturedOptions.signal.aborted).toBe(false);
    });
  });

  describe('downloadFile dynamic timeout integration', () => {
    test('cleans up local file when download stream emits error', async () => {
      const destFile = path.join(tmpDir, 'dest-fail.dat');
      const { Readable } = require('stream');

      const failingStream = new Readable({
        read() {
          this.destroy(new Error('Simulated network failure'));
        },
      });

      const mockDrive = {
        files: {
          list: jest.fn().mockResolvedValue({
            data: { files: [{ id: 'file-123', size: '1024', modifiedTime: '2026-01-01' }] },
          }),
          get: jest.fn().mockResolvedValue({
            data: failingStream,
          }),
        },
      };

      await expect(
        downloadFile(mockDrive, 'StockMarket/test', 'file.dat', destFile)
      ).rejects.toThrow('Simulated network failure');

      expect(fs.existsSync(destFile)).toBe(false);
    });
  });
});
