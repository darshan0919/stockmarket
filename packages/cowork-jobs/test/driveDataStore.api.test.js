'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Tests for the Google Drive API transport layer.
 * Uses mocked googleapis to avoid real network calls.
 */

// Mock googleapis before requiring the modules
const mockFilesList = jest.fn();
const mockFilesCreate = jest.fn(async (opts) => {
  if (opts && opts.media && opts.media.body) {
    opts.media.body.destroy(); // Prevent Unhandled 'error' event on stream
  }
  return { data: { id: 'file-1', name: 'test.json' } };
});
const mockFilesUpdate = jest.fn(async (opts) => {
  if (opts && opts.media && opts.media.body) {
    opts.media.body.destroy();
  }
  return { data: { id: 'existing-file', name: 'test.json' } };
});
const mockFilesGet = jest.fn();

const mockDrive = {
  files: {
    list: mockFilesList,
    create: mockFilesCreate,
    update: mockFilesUpdate,
    get: mockFilesGet,
  },
};

const mockAuth = {
  setCredentials: jest.fn(),
};

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => mockAuth),
    },
    drive: jest.fn(() => mockDrive),
  },
}));

// Set env vars before requiring modules
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token';

const driveApiModule = require('../lib/googleDriveApi');
const store = require('../lib/driveDataStore');

function writeFile(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body);
}

beforeEach(() => {
  jest.clearAllMocks();
  driveApiModule.clearFolderCache();
});

describe('googleDriveApi', () => {
  test('isApiConfigured returns true when all env vars are set', () => {
    expect(driveApiModule.isApiConfigured()).toBe(true);
  });

  test('createDriveClient creates a client with refresh token', () => {
    const { drive, auth } = driveApiModule.createDriveClient();
    expect(auth.setCredentials).toHaveBeenCalledWith({
      refresh_token: 'test-refresh-token',
    });
    expect(drive).toBe(mockDrive);
  });

  test('ensureFolder creates nested folder structure', async () => {
    // First segment 'StockMarket': not found → create
    mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
    mockFilesCreate.mockResolvedValueOnce({ data: { id: 'folder-1' } });

    // Second segment 'cowork-jobs': found
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: 'folder-2', name: 'cowork-jobs' }] },
    });

    const id = await driveApiModule.ensureFolder(mockDrive, 'StockMarket/cowork-jobs');
    expect(id).toBe('folder-2');
    expect(mockFilesCreate).toHaveBeenCalledTimes(1);
  });

  test('uploadFile creates a new file when none exists', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-api-test-'));
    const localFile = path.join(tmp, 'test.json');
    writeFile(localFile, '{"test": true}');

    // ensureFolder for 'v1': found
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: 'root-id', name: 'v1' }] },
    });
    // Check if file exists: not found
    mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
    // Create file
    mockFilesCreate.mockResolvedValueOnce({
      data: { id: 'file-1', name: 'test.json' },
    });

    const result = await driveApiModule.uploadFile(
      mockDrive,
      'v1',
      'test.json',
      localFile
    );
    expect(result).toMatchObject({ id: 'file-1', action: 'created' });

    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('uploadFile updates existing file', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-api-update-'));
    const localFile = path.join(tmp, 'test.json');
    writeFile(localFile, '{"test": true}');

    // ensureFolder: found
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: 'root-id', name: 'v1' }] },
    });
    // Check if file exists: found
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: 'existing-file', name: 'test.json', size: '100' }] },
    });
    // Update file
    mockFilesUpdate.mockResolvedValueOnce({
      data: { id: 'existing-file', name: 'test.json' },
    });

    const result = await driveApiModule.uploadFile(
      mockDrive,
      'v1',
      'test.json',
      localFile
    );
    expect(result).toMatchObject({ id: 'existing-file', action: 'updated' });

    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

describe('driveDataStore transport detection', () => {
  const originalDriveRoot = process.env.COWORK_DRIVE_ROOT;
  const originalSync = process.env.COWORK_DRIVE_SYNC;

  afterEach(() => {
    if (originalDriveRoot === undefined) delete process.env.COWORK_DRIVE_ROOT;
    else process.env.COWORK_DRIVE_ROOT = originalDriveRoot;
    if (originalSync === undefined) delete process.env.COWORK_DRIVE_SYNC;
    else process.env.COWORK_DRIVE_SYNC = originalSync;
  });

  test('detects api transport when API credentials are set and no local mount', () => {
    delete process.env.COWORK_DRIVE_ROOT;
    delete process.env.COWORK_DRIVE_SYNC;
    expect(store.detectTransport()).toBe('api');
  });

  test('detects disabled when COWORK_DRIVE_SYNC=0', () => {
    process.env.COWORK_DRIVE_SYNC = '0';
    expect(store.detectTransport()).toBe('disabled');
  });

  test('doctor reports api transport and apiConfigured', () => {
    delete process.env.COWORK_DRIVE_ROOT;
    delete process.env.COWORK_DRIVE_SYNC;
    const info = store.doctor();
    expect(info.transport).toBe('api');
    expect(info.apiConfigured).toBe(true);
    expect(info.driveRoot).toMatch(/^drive:\/\//);
  });
});

describe('driveDataStore API sync', () => {
  test('syncToDrive with API transport uploads local documents', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-sync-api-'));
    const dataRoot = path.join(tmp, 'data');
    writeFile(
      path.join(dataRoot, 'daily_gainers', '2026-06-26_gainers_raw.json'),
      '{"test": true}'
    );

    // Mock the googleDriveApi wrapper methods directly instead of googleapis
    const uploadSpy = jest.spyOn(driveApiModule, 'uploadFile').mockResolvedValue({ id: 'new-file', action: 'created' });
    const listSpy = jest.spyOn(driveApiModule, 'listAllFiles').mockResolvedValue([]);
    const downloadSpy = jest.spyOn(driveApiModule, 'downloadFile').mockResolvedValue(true);

    const origRoot = process.env.COWORK_DRIVE_ROOT;
    delete process.env.COWORK_DRIVE_ROOT;

    try {
      const result = await store.syncToDrive({ dataRoot });
      expect(result.transport).toBe('api');
      expect(result.enabled).toBe(true);
      expect(result.direction).toBe('push');
      expect(result.copied).toBe(1);
      expect(uploadSpy).toHaveBeenCalledTimes(1);
    } finally {
      if (origRoot !== undefined) process.env.COWORK_DRIVE_ROOT = origRoot;
      fs.rmSync(tmp, { recursive: true, force: true });
      uploadSpy.mockRestore();
      listSpy.mockRestore();
      downloadSpy.mockRestore();
    }
  });
});
