/**
 * Unit tests for ResultCard component
 * @file frontend/components/results/__tests__/ResultCard.test.js
 * @see docs/frontend/components/ResultCard.md for documentation
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ResultCard from '../ResultCard';

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }) => {
    return <a href={href}>{children}</a>;
  };
});

// Mock formatters
jest.mock('../../../lib/utils/formatters', () => ({
  formatNumber: (val) => (val !== null && val !== undefined ? val.toFixed(2) : 'N/A'),
  formatLargeNumber: (val) => (val ? `₹${val}Cr` : 'N/A'),
  formatDate: (date) => date || 'N/A',
  getChangeColor: (val) =>
    val > 0 ? 'text-positive' : val < 0 ? 'text-negative' : 'text-gray-600',
}));

describe('ResultCard', () => {
  const mockResult = {
    companyId: 'NSE:SIRCA',
    exchange: 'NSE',
    symbol: 'SIRCA',
    name: 'Sirca Paints India Ltd',
    lastResultDate: '2026-01-31',
    priceToEarnings: 44.22,
    marketCap: 2634.33,
    fundamentalsSource: 'C',
    dataSource: 'Consolidated',
    hasConsolidated: true,
    hasStandalone: true,
    consolidatedData: [
      ['', '202412', '202509', '202512', 'Growth QoQ', 'Growth YoY'],
      ['Revenue', 88.65, 131.17, 112.79, -14.01, 27.23],
      ['Operating Profit', 15.45, 27.4, 23.01, -16.02, 48.93],
      ['OPM', 17.43, 20.89, 20.4, null, null],
      ['PAT', 11.46, 18.1, 15.03, -16.96, 31.15],
      ['NPM', 12.93, 13.8, 13.33, null, null],
      ['EPS', 2.09, 3.24, 2.69, -16.98, 28.71],
    ],
    standaloneData: [
      ['', '202412', '202509', '202512', 'Growth QoQ', 'Growth YoY'],
      ['Revenue', 88.65, 131.17, 112.79, -14.01, 27.23],
      ['Operating Profit', 15.45, 27.4, 23.02, -15.99, 49.0],
      ['OPM', 17.43, 20.89, 20.41, null, null],
      ['PAT', 11.46, 18.1, 15.03, -16.96, 31.15],
      ['NPM', 12.93, 13.8, 13.33, null, null],
      ['EPS', 2.09, 3.24, 2.69, -16.98, 28.71],
    ],
    documents: [
      {
        date: '202512',
        documentType: 'PPT',
        ssUrl: 'test.pdf',
        hasNotes: false,
        fullUrl: 'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/test.pdf',
        notesUrl: null,
      },
      {
        date: '202512',
        documentType: 'Transcript',
        ssUrl: 'transcript.pdf',
        hasNotes: true,
        fullUrl:
          'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/transcript.pdf',
        notesUrl:
          'https://www.stockscans.in/api/company/get-concall-notes/NSE:SIRCA/transcript.pdf',
      },
    ],
  };

  it('should render company symbol and name', () => {
    render(<ResultCard result={mockResult} />);

    expect(screen.getByText('SIRCA')).toBeInTheDocument();
    expect(screen.getByText('Sirca Paints India Ltd')).toBeInTheDocument();
  });

  it('should render result date', () => {
    render(<ResultCard result={mockResult} />);

    expect(screen.getByText('2026-01-31')).toBeInTheDocument();
  });

  it('should render P/E ratio', () => {
    render(<ResultCard result={mockResult} />);

    expect(screen.getByText('44.22')).toBeInTheDocument();
  });

  it('should render market cap', () => {
    render(<ResultCard result={mockResult} />);

    expect(screen.getByText('₹2634.33Cr')).toBeInTheDocument();
  });

  it('should render financial data rows', () => {
    render(<ResultCard result={mockResult} />);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Op. Profit')).toBeInTheDocument();
    expect(screen.getByText('PAT')).toBeInTheDocument();
    expect(screen.getByText('EPS')).toBeInTheDocument();
  });

  it('should render document badges', () => {
    render(<ResultCard result={mockResult} />);

    expect(screen.getByText('PPT')).toBeInTheDocument();
    expect(screen.getByText('Transcript')).toBeInTheDocument();
  });

  it('should render Notes button for documents with notesUrl', () => {
    render(<ResultCard result={mockResult} />);

    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('should toggle between Consolidated and Standalone data', () => {
    render(<ResultCard result={mockResult} />);

    // Initially shows Consolidated
    const consolidatedBtn = screen.getByText('Consolidated');
    const standaloneBtn = screen.getByText('Standalone');

    expect(consolidatedBtn).toHaveClass('bg-primary-600');

    // Click Standalone
    fireEvent.click(standaloneBtn);

    expect(standaloneBtn).toHaveClass('bg-primary-600');
  });

  it('should render link to stock page', () => {
    render(<ResultCard result={mockResult} />);

    const link = screen.getByRole('link', { name: 'SIRCA' });
    expect(link).toHaveAttribute('href', '/stock/SIRCA');
  });

  it('should handle result with only standalone data', () => {
    const standaloneOnlyResult = {
      ...mockResult,
      hasConsolidated: false,
      hasStandalone: true,
      consolidatedData: null,
    };

    render(<ResultCard result={standaloneOnlyResult} />);

    // Should not show toggle buttons when only one type is available
    expect(screen.queryByText('Consolidated')).not.toBeInTheDocument();
  });

  it('should handle result with no documents', () => {
    const noDocsResult = {
      ...mockResult,
      documents: [],
    };

    render(<ResultCard result={noDocsResult} />);

    // Should still render without errors
    expect(screen.getByText('SIRCA')).toBeInTheDocument();
  });
});
