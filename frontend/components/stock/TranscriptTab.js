import { useState, useEffect } from 'react';
import { transcriptAPI } from '../../lib/api';
import { formatDate } from '../../lib/utils/formatters';
import LoadingSpinner from '../common/LoadingSpinner';

// Metric Card Component for numeric values
const MetricCard = ({
  label,
  value,
  unit,
  growth,
  colorClass = 'bg-base-200/50 border-base-200',
}) => {
  if (value === null || value === undefined) return null;

  const isPositiveGrowth = growth > 0;
  const isNegativeGrowth = growth < 0;

  return (
    <div className={`${colorClass} border rounded-xl p-4 transition-all hover:shadow-md`}>
      <p className="text-xs font-medium opacity-60 uppercase tracking-wide mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold">
          {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
        </span>
        {unit && <span className="text-sm opacity-50">{unit}</span>}
      </div>
      {growth !== null && growth !== undefined && (
        <div
          className={`flex items-center gap-1 mt-1 text-sm font-medium ${
            isPositiveGrowth ? 'text-success' : isNegativeGrowth ? 'text-error' : 'opacity-50'
          }`}
        >
          {isPositiveGrowth && (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {isNegativeGrowth && (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <span>{Math.abs(growth)}% YoY</span>
        </div>
      )}
    </div>
  );
};

// Section Header Component
const SectionHeader = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="p-2 bg-primary/10 rounded-lg text-primary">{icon}</div>
    <div>
      <h4 className="text-lg font-semibold">{title}</h4>
      {subtitle && <p className="text-sm opacity-50">{subtitle}</p>}
    </div>
  </div>
);

// Bullet List Component
const BulletList = ({ items, colorClass = 'opacity-60', bulletColor = 'bg-base-content/40' }) => {
  if (!items || items.length === 0) return null;

  return (
    <ul className="space-y-2">
      {items
        .filter((item) => item)
        .map((item, idx) => (
          <li key={idx} className="flex gap-3">
            <span className={`mt-2 w-1.5 h-1.5 rounded-full ${bulletColor} flex-shrink-0`} />
            <span className={`text-sm ${colorClass}`}>{item}</span>
          </li>
        ))}
    </ul>
  );
};

// Text Block Component for commentary
const TextBlock = ({ label, text }) => {
  if (!text) return null;

  return (
    <div className="mb-3">
      <p className="text-xs font-semibold opacity-50 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm opacity-80 leading-relaxed">{text}</p>
    </div>
  );
};

// Main Analysis Result UI Component
const AnalysisResultUI = ({ data }) => {
  if (!data || !data.data) return null;

  const { meta, data: analysisData } = data;
  const {
    current_quarter_financials: financials,
    order_book: orderBook,
    expansion_and_capex: capex,
    guidance_next_quarter: guidance,
    positive_highlights: highlights,
    challenges,
    red_flags: redFlags,
  } = analysisData;

  return (
    <div className="space-y-6">
      {/* Header with Meta Info */}
      <div className="bg-primary text-primary-content rounded-2xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-bold">Earnings Analysis</h3>
            <p className="text-primary-content/80 text-sm mt-1">
              {financials?.quarter} • Period ended {financials?.period_ended}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-primary-content/70">{meta?.doc_type}</p>
            <p className="text-primary-content/80">Extracted: {meta?.extraction_date}</p>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="finance-card">
        <div className="p-5">
          <SectionHeader
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            }
            title="Key Financial Metrics"
            subtitle="Current quarter performance"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Revenue"
              value={financials?.revenue_from_operations}
              unit={financials?.revenue_unit}
              growth={financials?.revenue_growth_yoy}
              colorClass="bg-success/10 border-success/20"
            />
            <MetricCard
              label="EBITDA Margin"
              value={financials?.ebitda_margin}
              unit="%"
              colorClass="bg-info/10 border-info/20"
            />
            <MetricCard
              label="PAT Growth"
              value={financials?.pat_growth_yoy}
              unit="% YoY"
              colorClass="bg-secondary/10 border-secondary/20"
            />
            <MetricCard
              label="Order Book"
              value={orderBook?.current_value}
              unit={orderBook?.value_unit}
              colorClass="bg-warning/10 border-warning/20"
            />
          </div>
        </div>
      </div>

      {/* Order Book Details */}
      {orderBook && (
        <div className="finance-card">
          <div className="p-5">
            <SectionHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              }
              title="Order Book & Pipeline"
            />
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <TextBlock label="Order Intake" text={orderBook.order_intake_current_period} />
                <TextBlock label="Execution Status" text={orderBook.execution_current_quarter} />
              </div>
              {orderBook.orderbook_breakdown && (
                <div className="bg-base-200/30 rounded-xl p-4">
                  <p className="text-xs font-semibold opacity-50 uppercase tracking-wide mb-3">
                    Orderbook Breakdown
                  </p>
                  <BulletList
                    items={[
                      orderBook.orderbook_breakdown.primary_segment_orderbook,
                      orderBook.orderbook_breakdown.secondary_segment_orderbook,
                      orderBook.orderbook_breakdown.other_orderbook,
                    ]}
                    bulletColor="bg-primary"
                  />
                  {orderBook.orderbook_breakdown.orderbook_mix_commentary && (
                    <p className="text-sm opacity-60 mt-3 pt-3 border-t border-base-200">
                      {orderBook.orderbook_breakdown.orderbook_mix_commentary}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Revenue Breakdown */}
      {financials?.revenue_breakdown && (
        <div className="finance-card">
          <div className="p-5">
            <SectionHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
                  />
                </svg>
              }
              title="Revenue Breakdown"
            />
            <div className="space-y-3">
              <BulletList
                items={[
                  financials.revenue_breakdown.primary_segment_revenue,
                  financials.revenue_breakdown.secondary_segment_revenue,
                  financials.revenue_breakdown.other_revenue,
                ]}
                bulletColor="bg-success"
              />
              {financials.revenue_breakdown.revenue_mix_commentary && (
                <div className="bg-base-200/30 rounded-xl p-4 mt-4">
                  <p className="text-xs font-semibold opacity-50 uppercase tracking-wide mb-2">
                    Management Commentary
                  </p>
                  <p className="text-sm opacity-80 leading-relaxed">
                    {financials.revenue_breakdown.revenue_mix_commentary}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expansion & Capex */}
      {capex && (capex.plans || capex.capex_plan_future) && (
        <div className="finance-card">
          <div className="p-5">
            <SectionHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              }
              title="Expansion & Capex"
            />
            <div className="space-y-3">
              <TextBlock label="Expansion Plans" text={capex.plans} />
              <TextBlock label="Current Capex Spend" text={capex.capex_spend_current} />
              <TextBlock label="Future Capex Plan" text={capex.capex_plan_future} />
            </div>
          </div>
        </div>
      )}

      {/* Guidance */}
      {guidance && (
        <div className="finance-card">
          <div className="p-5">
            <SectionHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              }
              title="Forward Guidance"
            />
            <div className="grid md:grid-cols-2 gap-4">
              <TextBlock label="Revenue Expectation" text={guidance.revenue_expectation} />
              <TextBlock label="Margin Expectation" text={guidance.profit_margin_expectation} />
              <TextBlock label="Capex Guidance" text={guidance.capex_guidance} />
              <TextBlock
                label="Expected Revenue from Order Book"
                text={guidance.revenue_expectation_from_order_book_number}
              />
            </div>
          </div>
        </div>
      )}

      {/* Positive Highlights */}
      {highlights && highlights.length > 0 && (
        <div className="bg-success/10 border border-success/20 rounded-2xl p-6">
          <SectionHeader
            icon={
              <svg
                className="w-5 h-5 text-success"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
            title="Positive Highlights"
          />
          <BulletList
            items={highlights}
            colorClass="text-success-content"
            bulletColor="bg-success"
          />
        </div>
      )}

      {/* Challenges */}
      {challenges &&
        (challenges.immediate_issues?.length > 0 || challenges.future_risks?.length > 0) && (
          <div className="bg-warning/10 border border-warning/20 rounded-2xl p-6">
            <SectionHeader
              icon={
                <svg
                  className="w-5 h-5 text-warning"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              }
              title="Challenges"
            />
            <div className="grid md:grid-cols-2 gap-6">
              {challenges.immediate_issues?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-warning-content uppercase tracking-wide mb-3">
                    Immediate Issues
                  </p>
                  <BulletList
                    items={challenges.immediate_issues}
                    colorClass="text-warning-content"
                    bulletColor="bg-warning"
                  />
                </div>
              )}
              {challenges.future_risks?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-warning-content uppercase tracking-wide mb-3">
                    Future Risks
                  </p>
                  <BulletList
                    items={challenges.future_risks}
                    colorClass="text-warning-content"
                    bulletColor="bg-warning"
                  />
                </div>
              )}
            </div>
          </div>
        )}

      {/* Red Flags */}
      {redFlags && redFlags.length > 0 && (
        <div className="bg-error/10 border border-error/20 rounded-2xl p-6">
          <SectionHeader
            icon={
              <svg
                className="w-5 h-5 text-error"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                />
              </svg>
            }
            title="Red Flags"
          />
          <BulletList items={redFlags} colorClass="text-error-content" bulletColor="bg-error" />
        </div>
      )}
    </div>
  );
};

export default function TranscriptTab({ symbol }) {
  const [transcripts, setTranscripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTranscript, setSelectedTranscript] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

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
    setAnalysisResult(null); // Clear previous analysis
  };

  const handleAnalyze = async () => {
    if (!selectedTranscript) return;

    try {
      setAnalyzing(true);
      const response = await transcriptAPI.analyzeTranscript(
        symbol,
        selectedTranscript.ATTACHMENTNAME
      );
      if (response.data.success) {
        setAnalysisResult(response.data.data);
      }
    } catch (err) {
      console.error('Error analyzing transcript:', err);
      setError('Unable to analyze transcript');
    } finally {
      setAnalyzing(false);
    }
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
        <h3 className="text-lg font-semibold mb-4">Earnings Call Transcript Analysis</h3>

        {/* Date Selector */}
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

          <button
            onClick={handleAnalyze}
            disabled={!selectedTranscript || analyzing}
            className="btn btn-secondary flex items-center gap-2"
          >
            {analyzing ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                Analyze Transcript
              </>
            )}
          </button>

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

      {/* Analysis Result */}
      {analysisResult && <AnalysisResultUI data={analysisResult} />}

      {/* Attribution */}
      <p className="text-xs opacity-50 mt-4">
        Data source: BSE India. Earnings call transcripts are provided by the company.
      </p>
    </div>
  );
}
