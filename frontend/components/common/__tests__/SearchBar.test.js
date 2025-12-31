/**
 * Unit tests for SearchBar component
 * @file frontend/components/common/__tests__/SearchBar.test.js
 * @see docs/frontend/components/SearchBar.md for documentation
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/router';
import SearchBar from '../SearchBar';
import { stockAPI } from '../../../lib/api';

jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../../lib/api', () => ({
  stockAPI: {
    search: jest.fn(),
  },
}));

describe('SearchBar', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: mockPush });
  });

  it('renders search input with default placeholder', () => {
    render(<SearchBar />);

    expect(screen.getByPlaceholderText('Search stocks...')).toBeInTheDocument();
  });

  it('renders with custom placeholder', () => {
    render(<SearchBar placeholder="Find a stock" />);

    expect(screen.getByPlaceholderText('Find a stock')).toBeInTheDocument();
  });

  it('shows loading state during search', async () => {
    stockAPI.search.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Search stocks...');

    await userEvent.type(input, 'REL');

    await waitFor(() => {
      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });
  });

  it('displays search results', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [
          { symbol: 'RELIANCE', name: 'Reliance Industries Limited' },
          { symbol: 'RELIANCEPOWER', name: 'Reliance Power Limited' },
        ],
        total: 2,
      },
    });

    render(<SearchBar />);
    await userEvent.type(screen.getByPlaceholderText('Search stocks...'), 'REL');

    await waitFor(() => {
      expect(screen.getByText(/Reliance Industries/)).toBeInTheDocument();
      expect(screen.getByText(/Reliance Power/)).toBeInTheDocument();
    });
  });

  it('highlights matching text in results', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [{ symbol: 'RELIANCE', name: 'Reliance Industries' }],
        total: 1,
      },
    });

    render(<SearchBar />);
    await userEvent.type(screen.getByPlaceholderText('Search stocks...'), 'Reli');

    await waitFor(() => {
      const highlight = screen.getByText('Reli');
      expect(highlight.tagName).toBe('MARK');
    });
  });

  it('navigates to stock page on result click', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [{ symbol: 'RELIANCE', name: 'Reliance Industries' }],
        total: 1,
      },
    });

    render(<SearchBar />);
    await userEvent.type(screen.getByPlaceholderText('Search stocks...'), 'REL');

    await waitFor(() => {
      fireEvent.click(screen.getByText(/Reliance Industries/));
    });

    expect(mockPush).toHaveBeenCalledWith('/stock/RELIANCE');
  });

  it('clears search after selection', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [{ symbol: 'RELIANCE', name: 'Reliance Industries' }],
        total: 1,
      },
    });

    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Search stocks...');
    await userEvent.type(input, 'REL');

    await waitFor(() => {
      fireEvent.click(screen.getByText(/Reliance Industries/));
    });

    expect(input.value).toBe('');
  });

  it('shows no results message when empty', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [],
        total: 0,
      },
    });

    render(<SearchBar />);
    await userEvent.type(screen.getByPlaceholderText('Search stocks...'), 'ZZZZZ');

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
  });

  it('handles keyboard navigation with arrow keys', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [
          { symbol: 'RELIANCE', name: 'Reliance Industries' },
          { symbol: 'RELIANCEPOWER', name: 'Reliance Power' },
        ],
        total: 2,
      },
    });

    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Search stocks...');
    await userEvent.type(input, 'REL');

    await waitFor(() => {
      expect(screen.getByText(/Reliance Industries/)).toBeInTheDocument();
    });

    // Navigate down
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Navigate down again
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Navigate up
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    // Select with Enter
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockPush).toHaveBeenCalledWith('/stock/RELIANCE');
  });

  it('hides results on Escape key', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [{ symbol: 'RELIANCE', name: 'Reliance Industries' }],
        total: 1,
      },
    });

    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Search stocks...');
    await userEvent.type(input, 'REL');

    await waitFor(() => {
      expect(screen.getByText(/Reliance Industries/)).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText(/Reliance Industries/)).not.toBeInTheDocument();
    });
  });

  it('hides results on click outside', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [{ symbol: 'RELIANCE', name: 'Reliance Industries' }],
        total: 1,
      },
    });

    render(
      <div>
        <SearchBar />
        <button>Outside</button>
      </div>
    );

    await userEvent.type(screen.getByPlaceholderText('Search stocks...'), 'REL');

    await waitFor(() => {
      expect(screen.getByText(/Reliance Industries/)).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText('Outside'));

    await waitFor(() => {
      expect(screen.queryByText(/Reliance Industries/)).not.toBeInTheDocument();
    });
  });

  it('debounces search requests', async () => {
    stockAPI.search.mockResolvedValue({
      data: { success: true, results: [], total: 0 },
    });

    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Search stocks...');

    // Type quickly
    await userEvent.type(input, 'RELIANCE', { delay: 50 });

    // Wait for debounce
    await waitFor(
      () => {
        // Should have debounced to fewer calls than characters typed
        expect(stockAPI.search.mock.calls.length).toBeLessThan(8);
      },
      { timeout: 1000 }
    );
  });

  it('displays stock exchange in results', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [{ symbol: 'RELIANCE', name: 'Reliance', exchange: 'NSE' }],
        total: 1,
      },
    });

    render(<SearchBar />);
    await userEvent.type(screen.getByPlaceholderText('Search stocks...'), 'REL');

    await waitFor(() => {
      expect(screen.getByText(/NSE/)).toBeInTheDocument();
    });
  });

  it('shows load more button when more results available', async () => {
    stockAPI.search.mockResolvedValue({
      data: {
        success: true,
        results: [{ symbol: 'RELIANCE', name: 'Reliance' }],
        total: 20,
      },
    });

    render(<SearchBar />);
    await userEvent.type(screen.getByPlaceholderText('Search stocks...'), 'REL');

    await waitFor(() => {
      expect(screen.getByText(/Show next/)).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    stockAPI.search.mockRejectedValue(new Error('Network error'));
    console.error = jest.fn(); // Suppress error logs

    render(<SearchBar />);
    await userEvent.type(screen.getByPlaceholderText('Search stocks...'), 'REL');

    await waitFor(() => {
      // Should not crash and should show no results
      expect(screen.queryByText(/Searching.../)).not.toBeInTheDocument();
    });
  });
});
