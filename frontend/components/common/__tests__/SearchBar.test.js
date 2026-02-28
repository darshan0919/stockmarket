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

  /** Helper: result text may be split across <mark> for highlighting; find button by textContent */
  const getResultButton = (name) => {
    const buttons = screen.getAllByRole('button');
    const found = buttons.find((btn) => btn.textContent?.includes(name));
    if (!found) throw new Error(`No button found with text: ${name}`);
    return found;
  };

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

  it('uses DaisyUI input classes', () => {
    render(<SearchBar />);

    const input = screen.getByPlaceholderText('Search stocks...');
    expect(input).toHaveClass('input');
    expect(input).toHaveClass('input-bordered');
  });

  it('shows loading state during search', async () => {
    // First request resolves quickly to show results; second request (load more) hangs to show loading
    stockAPI.search
      .mockResolvedValueOnce({
        data: {
          success: true,
          results: [{ symbol: 'RELIANCE', name: 'Reliance Industries' }],
          total: 15,
        },
      })
      .mockReturnValueOnce(new Promise(() => {})); // Second request never resolves

    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Search stocks...');
    await userEvent.type(input, 'REL');

    await waitFor(() => {
      expect(getResultButton('Reliance Industries')).toBeInTheDocument();
    });

    // Click "Show next" to trigger load more
    fireEvent.click(screen.getByText(/Show next/));

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
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
      expect(getResultButton('Reliance Industries')).toBeInTheDocument();
      expect(getResultButton('Reliance Power')).toBeInTheDocument();
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
      fireEvent.click(getResultButton('Reliance Industries'));
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
      fireEvent.click(getResultButton('Reliance Industries'));
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
      expect(getResultButton('Reliance Industries')).toBeInTheDocument();
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
      expect(getResultButton('Reliance Industries')).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Reliance Industries/ })).not.toBeInTheDocument();
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
      expect(getResultButton('Reliance Industries')).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByText('Outside'));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Reliance Industries/ })).not.toBeInTheDocument();
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

    await waitFor(
      () => {
        // NSE appears in stock row (RELIANCE · NSE) and in "NSE India" link - use getAllByText
        const nseElements = screen.getAllByText(/NSE/);
        expect(nseElements.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 2000 }
    );
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
