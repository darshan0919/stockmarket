/**
 * Left-column scan picker — shows the user's saved StockScans scans.
 * Selecting a scan triggers onSelect with the full scan definition object.
 */
export default function ScanList({ scans, selectedScanId, onSelect, loading }) {
  if (loading) {
    return (
      <div className="finance-card sticky top-20 p-4">
        <h2 className="section-title mb-4">Saved Scans</h2>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-base-300/40 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!scans || scans.length === 0) {
    return (
      <div className="finance-card sticky top-20 p-4">
        <h2 className="section-title mb-4">Saved Scans</h2>
        <p className="text-xs text-base-content/50">No saved scans found. Create scans on stockscans.in.</p>
      </div>
    );
  }

  return (
    <div className="finance-card sticky top-20">
      <div className="p-4">
        <h2 className="section-title mb-3">Saved Scans</h2>
        <div className="space-y-1">
          {scans.map((s) => {
            const isSelected = s.scanId === selectedScanId;
            return (
              <button
                key={s.scanId}
                onClick={() => onSelect(s)}
                className={[
                  'w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isSelected
                    ? 'bg-secondary text-white font-medium'
                    : 'hover:bg-base-200 text-base-content/80',
                ].join(' ')}
              >
                <div className="font-medium leading-tight">{s.scanName}</div>
                {s.scanDescription && (
                  <div
                    className={[
                      'text-xs mt-0.5 line-clamp-1',
                      isSelected ? 'text-white/70' : 'text-base-content/40',
                    ].join(' ')}
                  >
                    {s.scanDescription}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
