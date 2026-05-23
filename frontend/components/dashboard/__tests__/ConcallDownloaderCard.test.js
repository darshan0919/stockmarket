/**
 * Tests for ConcallDownloaderCard
 * @file frontend/components/dashboard/__tests__/ConcallDownloaderCard.test.js
 * @see docs/API_REFERENCE.md#download-latest-concall-transcripts-zip
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConcallDownloaderCard from '../ConcallDownloaderCard';
import { announcementsAPI } from '../../../lib/api';

jest.mock('../../common/Modal', () => {
  /**
   * @param {Object} props
   * @param {boolean} props.isOpen
   * @param {string} [props.title]
   * @param {import('react').ReactNode} props.children
   */
  return function MockModal({ children, isOpen, title }) {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    );
  };
});

jest.mock('../../../lib/api', () => ({
  announcementsAPI: {
    downloadLatestConcalls: jest.fn(),
  },
}));

const showSnackbar = jest.fn();
jest.mock('../../../lib/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSnackbar }),
}));

const SAMPLE_SCAN_URL = 'https://www.stockscans.in/scans/saved/c29a98ebbb568f073162ba24';

describe('ConcallDownloaderCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    URL.createObjectURL = jest.fn(() => 'blob:mock');
    URL.revokeObjectURL = jest.fn();
  });

  it('opens modal and submits saved scan URL for ZIP download', async () => {
    const user = userEvent.setup();
    announcementsAPI.downloadLatestConcalls.mockResolvedValue({
      data: new Blob(['zip'], { type: 'application/zip' }),
      headers: { 'content-disposition': 'attachment; filename="concalls_202603.zip"' },
    });

    render(<ConcallDownloaderCard />);
    await user.click(screen.getByRole('button', { name: /Concall Downloader/i }));

    await user.type(screen.getByLabelText(/Saved scan URL/i), SAMPLE_SCAN_URL);
    await user.click(screen.getByRole('button', { name: /Download ZIP/i }));

    await waitFor(() => {
      expect(announcementsAPI.downloadLatestConcalls).toHaveBeenCalledWith({
        scanUrl: SAMPLE_SCAN_URL,
        quarterDate: undefined,
      });
    });
    expect(showSnackbar).toHaveBeenCalledWith('Concall transcripts ZIP downloaded.', 'success');
  });
});
