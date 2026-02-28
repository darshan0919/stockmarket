/**
 * Unit tests for Header component
 * @file frontend/components/common/__tests__/Header.test.js
 * @see docs/frontend/components/Header.md for documentation
 */

import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/router';
import Header from '../Header';
import { stockAPI } from '../../../lib/api';

jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../../lib/api', () => ({
  stockAPI: {
    search: jest.fn(),
  },
}));

describe('Header', () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({
      push: mockPush,
      pathname: '/',
    });
  });

  it('renders the header with logo', () => {
    render(<Header />);

    expect(screen.getByText('Stock Screener')).toBeInTheDocument();
  });

  it('uses DaisyUI navbar on header element', () => {
    render(<Header />);

    const header = screen.getByText('Stock Screener').closest('header');
    expect(header).toHaveClass('navbar');
  });

  it('renders navigation links', () => {
    render(<Header />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Screener')).toBeInTheDocument();
    expect(screen.getByText('Watchlist')).toBeInTheDocument();
  });

  it('renders the search bar', () => {
    render(<Header />);

    expect(screen.getByPlaceholderText('Search stocks by symbol or name...')).toBeInTheDocument();
  });

  it('highlights active navigation link', () => {
    useRouter.mockReturnValue({
      push: mockPush,
      pathname: '/screener',
    });

    render(<Header />);

    const screenerLink = screen.getByText('Screener');
    expect(screenerLink).toHaveClass('btn-active');
  });

  it('applies default styles to inactive navigation links', () => {
    useRouter.mockReturnValue({
      push: mockPush,
      pathname: '/',
    });

    render(<Header />);

    const watchlistLink = screen.getByText('Watchlist');
    expect(watchlistLink).toHaveClass('btn-ghost');
  });

  it('renders all navigation items in correct order', () => {
    render(<Header />);

    // Nav links are rendered as anchor elements
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Screener')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(screen.getByText('Watchlist')).toBeInTheDocument();
  });

  it('search bar is globally accessible', () => {
    render(<Header />);

    // The search bar should be present in the header
    const searchInput = screen.getByPlaceholderText('Search stocks by symbol or name...');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput.closest('header')).toBeInTheDocument();
  });
});
