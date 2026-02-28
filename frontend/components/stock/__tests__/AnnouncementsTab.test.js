/**
 * Unit tests for AnnouncementsTab component
 * @file frontend/components/stock/__tests__/AnnouncementsTab.test.js
 * @see docs/frontend/components/AnnouncementsTab.md for documentation
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AnnouncementsTab from '../AnnouncementsTab';
import { announcementsAPI } from '../../../lib/api';

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
      },
    });
  });

  it('renders loading state initially', () => {
    announcementsAPI.getBySymbol.mockImplementation(() => new Promise(() => {}));
    render(<AnnouncementsTab symbol="FORCEMOT" />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders announcements after loading', async () => {
    render(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      expect(screen.getByText('3 announcements')).toBeInTheDocument();
    });

    const financialResults = screen.getAllByText(/Financial Results/i);
    const boardMeeting = screen.getAllByText(/Board Meeting/i);
    const dividend = screen.getAllByText(/Dividend/i);

    expect(financialResults.length).toBeGreaterThan(0);
    expect(boardMeeting.length).toBeGreaterThan(0);
    expect(dividend.length).toBeGreaterThan(0);
  });

  it('displays correct count of announcements', async () => {
    render(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      expect(screen.getByText('3 announcements')).toBeInTheDocument();
    });
  });

  it('renders download button counting only announcements with attachments', async () => {
    render(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      const downloadButton = screen.getByTitle(/download all pdf attachments/i);
      expect(downloadButton).toBeInTheDocument();
      // Only 2 of 3 announcements have attchmntFile
      expect(downloadButton).toHaveTextContent('Download PDFs (2)');
    });
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

    render(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      expect(screen.getByText(/1 announcements/i)).toBeInTheDocument();
    });

    expect(screen.queryByTitle(/download all pdf attachments/i)).not.toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    announcementsAPI.getBySymbol.mockRejectedValue(new Error('API Error'));

    render(<AnnouncementsTab symbol="FORCEMOT" />);

    await waitFor(() => {
      expect(screen.getByText(/unable to load announcements/i)).toBeInTheDocument();
    });
  });
});
