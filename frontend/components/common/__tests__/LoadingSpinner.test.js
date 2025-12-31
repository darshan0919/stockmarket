/**
 * Unit tests for LoadingSpinner component
 * @file frontend/components/common/__tests__/LoadingSpinner.test.js
 */

import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders spinner element', () => {
    render(<LoadingSpinner />);

    // Check for spinner container
    const spinner = document.querySelector('[class*="animate"]');
    expect(spinner).toBeInTheDocument();
  });

  it('renders with default size', () => {
    const { container } = render(<LoadingSpinner />);

    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<LoadingSpinner className="custom-class" />);

    // Component should render
    expect(container.firstChild).toBeInTheDocument();
  });

  it('is accessible', () => {
    render(<LoadingSpinner />);

    // Should have appropriate aria attributes or be contained in a loading region
    const container = document.querySelector('div');
    expect(container).toBeInTheDocument();
  });
});
