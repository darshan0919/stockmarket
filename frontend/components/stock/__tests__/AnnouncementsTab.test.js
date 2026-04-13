/**
 * Unit tests for AnnouncementsTab component
 * @file frontend/components/stock/__tests__/AnnouncementsTab.test.js
 * @see docs/frontend/components/AnnouncementsTab.md for documentation
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AnnouncementsTab from '../AnnouncementsTab';
import { announcementsAPI } from '../../../lib/api';
import { SnackbarProvider } from '../../../lib/contexts/SnackbarContext';

/**
 * @param {import('react').ReactNode} ui
 * @returns {ReturnType<typeof render>}
 */
function renderWithSnackbar(ui) {
  return render(<SnackbarProvider>{ui}</SnackbarProvider>);
}

// Mock the API
jest.mock('../../../lib/api', () => ({
  announcementsAPI: {
    getBySymbol: jest.fn(),
    downloadPdfs: jest.fn(),
  },
}));

// Mock LoadingSpinner component
jest.mock('../../common/LoadingSpinner', () => {
  return function LoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'mock-url');
global.URL.revokeObjectURL = jest.fn();

describe('AnnouncementsTab', () => {
  const mockAnnouncements = [
    {
      subject: 'Financial_Results',
      desc: 'Q4 Financial Results Announcement',
      an_dt: '01-Mar-2026 10:30:00',
      attchmntFile: 'https://example.com/file1.pdf',
      attchmntText: 'Financial Results PDF',
    },
    {
      subject: 'Board_Meeting',
      desc: 'Board Meeting scheduled',
      an_dt: '15-Feb-2026 14:00:00',
      attchmntFile: 'https://example.com/file2.pdf',
      attchmntText: 'Meeting Notice',
    },
    {
      subject: 'Dividend_Announcement',
      desc: 'Dividend declared for shareholders',
      an_dt: '10-Feb-2026 09:00:00',
      attchmntFile: null,
      attchmntText: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    announcementsAPI.getBySymbol.mockResolvedValue({
      data: {
        success: true,
        data: mockAnnouncements,
        meta: { provider: 'stockscans', offset: 0, limit: 30 },
      },
    });
  });

  it('renders loading state initially', () => {
    announcementsAPI.getBySymbol.mockImplementation(() => new Promise(() => {}));
    renderWithSnackbar(<AnnouncementsTab symbol="FORCEMOT" />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders announcements after loading', async () => {
    renderWithSnackbar(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      expect(screen.getByText('3 announcements')).toBeInTheDocument();
    });

    expect(announcementsAPI.getBySymbol).toHaveBeenCalledWith(
      'FORCEMOT',
      expect.objectContaining({ provider: 'stockscans', offset: 0 })
    );

    const financialResults = screen.getAllByText(/Financial Results/i);
    const boardMeeting = screen.getAllByText(/Board Meeting/i);
    const dividend = screen.getAllByText(/Dividend/i);

    expect(financialResults.length).toBeGreaterThan(0);
    expect(boardMeeting.length).toBeGreaterThan(0);
    expect(dividend.length).toBeGreaterThan(0);
  });

  it('displays correct count of announcements', async () => {
    renderWithSnackbar(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      expect(screen.getByText('3 announcements')).toBeInTheDocument();
    });
  });

  it('renders download button counting only announcements with attachments', async () => {
    renderWithSnackbar(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      const downloadButton = screen.getByTitle(/download all pdf attachments/i);
      expect(downloadButton).toBeInTheDocument();
      // Only 2 of 3 announcements have attchmntFile
      expect(downloadButton).toHaveTextContent('Download PDFs (2)');
    });
  });

  it('includes sanitized search in zip filename when downloading', async () => {
    announcementsAPI.downloadPdfs.mockResolvedValue({ data: new Uint8Array([1, 2, 3]) });
    const createElementSpy = jest.spyOn(document, 'createElement');
    renderWithSnackbar(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      expect(screen.getByText('3 announcements')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/search announcements/i);
    fireEvent.change(input, { target: { value: 'Financial Results' } });

    const downloadButton = screen.getByTitle(/download all pdf attachments/i);
    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(announcementsAPI.downloadPdfs).toHaveBeenCalledWith('FORCEMOT', expect.any(Array), {
        search: 'Financial Results',
      });
    });

    const linkCreated = createElementSpy.mock.results.find(
      (r) => r.value && r.value.tagName === 'A' && r.value.download
    );
    expect(linkCreated?.value.download).toMatch(
      /FORCEMOT_announcements_Financial_Results_\d{4}-\d{2}-\d{2}\.zip/
    );

    createElementSpy.mockRestore();
  });

  it('uses uppercase symbol in browser ZIP filename', async () => {
    announcementsAPI.downloadPdfs.mockResolvedValue({ data: new Uint8Array([1, 2, 3]) });
    const createElementSpy = jest.spyOn(document, 'createElement');
    renderWithSnackbar(<AnnouncementsTab symbol="forcemot" />);

    await waitFor(() => {
      expect(screen.getByText('3 announcements')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle(/download all pdf attachments/i));

    await waitFor(() => {
      expect(announcementsAPI.downloadPdfs).toHaveBeenCalled();
    });

    const linkCreated = createElementSpy.mock.results.find(
      (r) => r.value && r.value.tagName === 'A' && r.value.download
    );
    expect(linkCreated?.value.download).toMatch(/^FORCEMOT_announcements_/);

    createElementSpy.mockRestore();
  });

  it('does not show download button when no announcements have attachments', async () => {
    announcementsAPI.getBySymbol.mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            subject: 'Test',
            desc: 'No attachment',
            an_dt: '01-Mar-2026 10:30:00',
            attchmntFile: null,
            attchmntText: null,
          },
        ],
      },
    });

    renderWithSnackbar(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      expect(screen.getByText(/1 announcements/i)).toBeInTheDocument();
    });

    expect(screen.queryByTitle(/download all pdf attachments/i)).not.toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    announcementsAPI.getBySymbol.mockRejectedValue(new Error('API Error'));

    renderWithSnackbar(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      expect(screen.getByText(/api error/i)).toBeInTheDocument();
    });
  });

  it('shows symbol/NSE hint when backend returns STOCKSCANS_BAD_COMPANY', async () => {
    const err = Object.assign(new Error('Request failed'), {
      response: {
        data: {
          error: 'StockScans returned no data for NSE:FAKE (HTTP 500).',
          code: 'STOCKSCANS_BAD_COMPANY',
        },
      },
    });
    announcementsAPI.getBySymbol.mockRejectedValue(err);

    renderWithSnackbar(<AnnouncementsTab symbol="FAKE" />);

    await waitFor(() => {
      expect(screen.getByText(/stockscans returned no data/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/this ticker may not exist on stockscans/i)).toBeInTheDocument();
    expect(screen.queryByText(/refresh/i)).not.toBeInTheDocument();
  });

  it('shows token hint when StockScans authentication fails', async () => {
    const err = Object.assign(new Error('Request failed'), {
      response: {
        data: {
          error:
            'StockScans authentication failed (HTTP 401). Refresh STOCKSCANS_AUTH_TOKEN in backend/.env from your stockscans.in session.',
          code: 'STOCKSCANS_HTTP_ERROR',
        },
      },
    });
    announcementsAPI.getBySymbol.mockRejectedValue(err);

    renderWithSnackbar(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      expect(screen.getByText(/authentication failed \(http 401\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/from an active stockscans\.in session/i)).toBeInTheDocument();
  });
});
