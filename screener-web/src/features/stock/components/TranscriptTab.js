import { useState, useEffect } from 'react';
import { transcriptAPI } from '../../../core/lib/api';
import { formatDate } from '../../../core/lib/utils/formatters';
import LoadingSpinner from '../../../core/components/common/LoadingSpinner';

export default function TranscriptTab({ symbol }) {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTranscript, setSelectedTranscript] = useState(null);

  useEffect(() => {
    const fetchTranscripts = async () => {
      if (!symbol) return;

      try {
        setLoading(true);
        setError(null);
        const response = await transcriptAPI.getTranscripts(symbol);
        if (response.data.success) {
          const data = response.data.data || [];
          setTranscripts(data);
          // Auto-select the first transcript if available
          if (data.length > 0) {
            setSelectedTranscript(data[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching transcripts:', err);
        setError('Unable to load earnings call transcripts');
      } finally {
        setLoading(false);
      }
    };

    fetchTranscripts();
  }, [symbol]);

  const handleTranscriptSelect = (e) => {
    const attachmentName = e.target.value;
    const transcript = transcripts.find((t) => t.ATTACHMENTNAME === attachmentName);
    setSelectedTranscript(transcript);
  };

  if (loading) return <LoadingSpinner size="sm" />;

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-error mb-2">{error}</div>
        <p className="text-sm opacity-50">
          Earnings call transcripts may not be available for this stock.
        </p>
      </div>
    );
  }

  if (transcripts.length === 0) {
    return (
      <div className="text-center py-8 opacity-50">
        <svg
          className="w-12 h-12 mx-auto mb-4 opacity-30"
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
        <p>No earnings call transcripts available for this stock.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">Earnings Call Transcripts</h3>

        {/* Date Selector and View Action */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px] max-w-md form-control">
            <label htmlFor="transcript-date" className="label">
              <span className="label-text font-medium">Select Earnings Call Date</span>
            </label>
            <select
              id="transcript-date"
              value={selectedTranscript?.ATTACHMENTNAME || ''}
              onChange={handleTranscriptSelect}
              className="select select-bordered w-full"
            >
              {transcripts.map((transcript, index) => (
                <option key={index} value={transcript.ATTACHMENTNAME}>
                  {formatDate(transcript.NEWS_DT)}
                </option>
              ))}
            </select>
          </div>

          {/* View PDF Button */}
          {selectedTranscript?.ATTACHMENTNAME && (
            <a
              href={`https://www.bseindia.com/xml-data/corpfiling/AttachHis/${selectedTranscript.ATTACHMENTNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline btn-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              View Transcript
            </a>
          )}
        </div>
      </div>

      {/* Attribution */}
      <p className="text-xs opacity-50 mt-4">
        Data source: BSE India. Earnings call transcripts are provided by the company.
      </p>
    </div>
  );
}
