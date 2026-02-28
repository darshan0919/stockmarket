import { useState, useEffect, useMemo } from 'react';
import { announcementsAPI } from '../../lib/api';
import LoadingSpinner from '../common/LoadingSpinner';

// Helper function to format relative time
const formatTimeAgo = (dateString) => {
  if (!dateString) return '';

  // NSE date format: "31-Dec-2025 10:30:00"
  let date;
  if (dateString.includes('-')) {
    const parts = dateString.split(' ');
    const dateParts = parts[0].split('-');
    const months = {
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11,
    };
    date = new Date(parseInt(dateParts[2]), months[dateParts[1]], parseInt(dateParts[0]));
  } else {
    date = new Date(dateString);
  }

  if (isNaN(date.getTime())) return dateString;

  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`;
  return `${Math.floor(diffInSeconds / 31536000)} years ago`;
};

// Announcement Card Component
const AnnouncementCard = ({ announcement }) => {
  const { subject, desc, an_dt, attchmntFile, attchmntText } = announcement;

  return (
    <div className="finance-card-hover p-5 group">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Title/Subject */}
          <h3 className="text-sm font-semibold mb-1 leading-tight">
            {subject?.replace(/_/g, ' ') || 'Announcement'}
          </h3>

          {/* Description */}
          {desc && <p className="text-sm opacity-60 mt-2 line-clamp-3 leading-relaxed">{desc}</p>}

          {/* Attachment Text */}
          {attchmntText && (
            <div className="mt-3 flex items-start gap-2">
              <svg
                className="w-4 h-4 opacity-40 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
              <span className="text-xs opacity-50 leading-relaxed">{attchmntText}</span>
            </div>
          )}
        </div>

        {/* External Link Icon */}
        {attchmntFile && (
          <a
            href={attchmntFile}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 p-2 opacity-40 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title="View attachment"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        )}
      </div>

      {/* Time ago */}
      <div className="mt-4 pt-3 border-t border-base-200">
        <span className="text-xs opacity-50">{formatTimeAgo(an_dt)}</span>
      </div>
    </div>
  );
};

// Empty State Component
const EmptyState = ({ searchTerm }) => (
  <div className="text-center py-12">
    <svg
      className="w-16 h-16 mx-auto mb-4 opacity-30"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
    <h3 className="text-lg font-medium opacity-70 mb-1">No announcements found</h3>
    <p className="text-sm opacity-50">
      {searchTerm
        ? `No results for "${searchTerm}". Try a different search term.`
        : 'No announcements available for this company.'}
    </p>
  </div>
);

export default function AnnouncementsTab({ symbol }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);

  // Fetch announcements
  useEffect(() => {
    const fetchAnnouncements = async () => {
      if (!symbol) return;

      try {
        setLoading(true);
        setError(null);

        const response = await announcementsAPI.getBySymbol(symbol);

        if (response.data.success) {
          const data = response.data.data || [];
          setAnnouncements(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Error fetching announcements:', err);
        setError('Unable to load announcements');
        setAnnouncements([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAnnouncements();
  }, [symbol]);

  // Filter announcements based on search term
  const filteredAnnouncements = useMemo(() => {
    if (!searchTerm.trim()) return announcements;

    const lowerSearch = searchTerm.toLowerCase();
    return announcements.filter(
      (ann) =>
        ann.subject?.toLowerCase().includes(lowerSearch) ||
        ann.desc?.toLowerCase().includes(lowerSearch)
    );
  }, [announcements, searchTerm]);

  // Get visible announcements
  const visibleAnnouncements = filteredAnnouncements.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAnnouncements.length;

  // Load more handler
  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 20);
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setVisibleCount(20); // Reset visible count when searching
  };

  // Clear search
  const handleClearSearch = () => {
    setSearchTerm('');
    setVisibleCount(20);
  };

  if (loading) {
    return <LoadingSpinner size="sm" />;
  }

  if (error && announcements.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-error mb-2">{error}</div>
        <p className="text-sm opacity-50">Announcements may not be available for this stock.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h3 className="text-lg font-semibold">Announcements</h3>

        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="w-5 h-5 opacity-40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search announcements..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-10 py-2 border border-base-300/60 rounded-lg focus:outline-none focus:border-secondary/50 focus:bg-base-100 text-sm bg-base-200/60 transition-all"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-base-content/40 hover:text-base-content/70"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      {announcements.length > 0 && (
        <p className="text-sm opacity-50 mb-4">
          {searchTerm
            ? `Showing ${visibleAnnouncements.length} of ${filteredAnnouncements.length} results`
            : `${announcements.length} announcements`}
        </p>
      )}

      {/* Announcements Grid */}
      {visibleAnnouncements.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleAnnouncements.map((announcement, index) => (
              <AnnouncementCard
                key={`${announcement.an_dt}-${index}`}
                announcement={announcement}
              />
            ))}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={handleLoadMore}
                className="btn btn-sm btn-secondary btn-outline gap-1.5"
              >
                Load More ({filteredAnnouncements.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState searchTerm={searchTerm} />
      )}

      {/* Attribution */}
      <p className="text-xs text-base-content/40 mt-6">
        Data source: NSE India. Announcements are provided by the stock exchange.
      </p>
    </div>
  );
}
