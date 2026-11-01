'use strict';

const { parseArgs, selectBatch } = require('../mediaTranscriptBatchWorker');

describe('mediaTranscriptBatchWorker', () => {
  describe('parseArgs', () => {
    it('returns sensible defaults when no flags provided', () => {
      const args = parseArgs(['node', 'script.js']);
      expect(args.limit).toBe(5);
      expect(args.channel).toBeNull();
      expect(args.dryRun).toBe(false);
      expect(args.delaySec).toBe(15);
    });

    it('parses --limit, --channel, and --dry-run flags correctly', () => {
      const args = parseArgs([
        'node',
        'script.js',
        '--limit',
        '10',
        '--channel',
        '@soicfinance',
        '--dry-run',
        '--delay-sec',
        '20',
      ]);
      expect(args.limit).toBe(10);
      expect(args.channel).toBe('@soicfinance');
      expect(args.dryRun).toBe(true);
      expect(args.delaySec).toBe(20);
    });
  });

  describe('selectBatch', () => {
    const mockEntries = [
      {
        id: '1',
        videoId: 'vid1',
        videoTitle: 'SOIC Old Captioned',
        channelHandle: 'soicfinance',
        publishedAt: '2026-01-01T00:00:00Z',
        captionKind: 'asr',
      },
      {
        id: '2',
        videoId: 'vid2',
        videoTitle: 'SOIC New Uncaptioned',
        channelHandle: 'soicfinance',
        publishedAt: '2026-06-01T00:00:00Z',
        captionKind: 'none',
      },
      {
        id: '3',
        videoId: 'vid3',
        videoTitle: 'SOIC Older Uncaptioned',
        channelHandle: 'soicfinance',
        publishedAt: '2026-03-01T00:00:00Z',
        captionKind: 'none',
      },
      {
        id: '4',
        videoId: 'vid4',
        videoTitle: 'Anil Lamba Uncaptioned',
        channelHandle: 'anillamba',
        publishedAt: '2026-07-01T00:00:00Z',
        captionKind: 'none',
      },
      {
        id: '5',
        videoId: 'vid5',
        videoTitle: 'Anil Lamba Captioned',
        channelHandle: 'anillamba',
        publishedAt: '2026-05-01T00:00:00Z',
        captionKind: 'manual',
      },
      {
        id: '6',
        videoId: 'vid6',
        videoTitle: 'Chartitude Masterclass Uncaptioned',
        channelHandle: 'thechartist',
        publishedAt: '2026-02-01T00:00:00Z',
        captionKind: 'none',
      },
    ];

    it('filters out already captioned items and prioritizes Chartitude, then SOIC, then Anil Lamba', () => {
      const { batch, uncaptioned } = selectBatch(mockEntries, { limit: 3 });
      expect(uncaptioned.length).toBe(4); // vid6 (Chartitude), vid2 (SOIC), vid3 (SOIC), vid4 (Anil Lamba)
      expect(batch.length).toBe(3);

      // vid6 is Chartitude (prio 1)
      expect(batch[0].videoId).toBe('vid6');
      // vid2 is SOIC latest (prio 2, 2026-06-01)
      expect(batch[1].videoId).toBe('vid2');
      // vid3 is SOIC older (prio 2, 2026-03-01)
      expect(batch[2].videoId).toBe('vid3');
    });

    it('respects channel filter when specified', () => {
      const { batch, uncaptioned } = selectBatch(mockEntries, {
        limit: 5,
        channel: 'anillamba',
      });
      expect(uncaptioned.length).toBe(1);
      expect(batch.length).toBe(1);
      expect(batch[0].videoId).toBe('vid4');
    });

    it('handles empty input gracefully', () => {
      const { batch, uncaptioned } = selectBatch([], { limit: 5 });
      expect(uncaptioned.length).toBe(0);
      expect(batch.length).toBe(0);
    });

    it('handles all captioned entries gracefully', () => {
      const allCaptioned = mockEntries.filter((m) => m.captionKind !== 'none');
      const { batch, uncaptioned } = selectBatch(allCaptioned, { limit: 5 });
      expect(uncaptioned.length).toBe(0);
      expect(batch.length).toBe(0);
    });
  });
});
