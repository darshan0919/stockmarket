/**
 * Tests for TweetDownloaderCard
 * @file frontend/components/dashboard/__tests__/TweetDownloaderCard.test.js
 * @see docs/API_REFERENCE.md#x-twitter-apis
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TweetDownloaderCard from '../TweetDownloaderCard';
import { twitterAPI } from '../../../lib/api';

jest.mock('../../common/Modal', () => {
  /**
   * Lightweight modal stub — jsdom does not implement HTMLDialogElement.showModal/close.
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
  twitterAPI: {
    fetchTweets: jest.fn(),
  },
}));

jest.mock('../../../lib/contexts/SnackbarContext', () => ({
  useSnackbar: () => ({ showSnackbar: jest.fn() }),
}));

describe('TweetDownloaderCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens modal when main button is clicked', async () => {
    const user = userEvent.setup();
    render(<TweetDownloaderCard />);

    await user.click(screen.getByRole('button', { name: /Tweet Downloader/i }));

    expect(screen.getByRole('dialog', { name: 'Tweet Downloader' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Twitter handle/i)).toBeInTheDocument();
  });

  it('calls twitterAPI.fetchTweets on submit', async () => {
    const user = userEvent.setup();

    twitterAPI.fetchTweets.mockResolvedValue({
      data: {
        success: true,
        data: { user: { id: '1' }, tweets: [], meta: {} },
      },
    });

    render(<TweetDownloaderCard />);
    await user.click(screen.getByRole('button', { name: /Tweet Downloader/i }));
    await user.type(screen.getByPlaceholderText(/elonmusk/i), 'demo_user');
    await user.click(screen.getByRole('button', { name: /Fetch & download/i }));

    await waitFor(() => {
      expect(twitterAPI.fetchTweets).toHaveBeenCalledWith({
        handle: 'demo_user',
        intervalDays: 7,
      });
    });
  });
});
