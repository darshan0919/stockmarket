'use strict';

const {
  parseArgs,
  selectBatch,
  selectXMediaBatch,
  filterActionableMedia,
} = require('../mediaTranscriptBatchWorker');

describe('mediaTranscriptBatchWorker', () => {
  describe('parseArgs', () => {
    it('returns sensible defaults when no flags provided', () => {
      const args = parseArgs(['node', 'script.js']);
      expect(args.source).toBe('all');
      expect(args.limit).toBe(5);
      expect(args.xLimit).toBe(10);
      expect(args.channel).toBeNull();
      expect(args.dryRun).toBe(false);
      expect(args.delaySec).toBe(15);
    });

    it('parses --source, --limit, --x-limit, --channel, --handle, and --dry-run flags correctly', () => {
      const args = parseArgs([
        'node',
        'script.js',
        '--source',
        'x-posts',
        '--limit',
        '10',
        '--x-limit',
        '25',
        '--handle',
        'sureshkbn',
        '--dry-run',
        '--delay-sec',
        '20',
      ]);
      expect(args.source).toBe('x-posts');
      expect(args.limit).toBe(10);
      expect(args.xLimit).toBe(25);
      expect(args.channel).toBe('sureshkbn');
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

  describe('filterActionableMedia', () => {
    it('omits animated_gif and retains photo and video', () => {
      const input = [
        { type: 'animated_gif', url: 'https://example.com/cat.gif' },
        { type: 'photo', url: 'https://example.com/chart.jpg' },
        { type: 'video', url: 'https://example.com/lecture.mp4' },
      ];
      const result = filterActionableMedia(input);
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.type)).toEqual(['photo', 'video']);
    });

    it('returns empty array when no media or null passed', () => {
      expect(filterActionableMedia(null)).toEqual([]);
      expect(filterActionableMedia([])).toEqual([]);
      expect(
        filterActionableMedia([{ type: 'animated_gif', url: 'https://example.com/1.gif' }])
      ).toEqual([]);
    });
  });

  describe('selectXMediaBatch', () => {
    const mockXDocs = [
      {
        id: 'doc1',
        handle: 'SureshKBN',
        publishedAt: '2026-06-01T10:00:00Z',
        text: 'Breakout setup on ABC',
        metrics: { likes: 150 },
        media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/1.jpg' }],
      },
      {
        id: 'doc2_already_processed',
        handle: 'SureshKBN',
        publishedAt: '2026-07-01T10:00:00Z',
        text: 'Old setup already analyzed',
        mediaText: 'Analyzed chart: double bottom on ABC',
        metrics: { likes: 500 },
        media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/2.jpg' }],
      },
      {
        id: 'doc3_gif_only',
        handle: 'Shashank1171',
        publishedAt: '2026-05-01T10:00:00Z',
        text: 'Reaction gif',
        metrics: { likes: 50 },
        media: [{ type: 'animated_gif', url: 'https://pbs.twimg.com/tweet_video_thumb/3.jpg' }],
      },
      {
        id: 'doc4_video',
        handle: 'ishmohit1',
        publishedAt: '2026-04-01T10:00:00Z',
        text: 'SOIC video lesson on moats',
        metrics: { likes: 80 },
        media: [{ type: 'video', url: 'https://pbs.twimg.com/amplify_video_thumb/4.jpg' }],
      },
      {
        id: 'doc5_high_engagement_photo',
        handle: 'thechartist26',
        publishedAt: '2026-03-01T10:00:00Z',
        text: 'Nifty key levels chart',
        metrics: { likes: 300 },
        media: [{ type: 'photo', url: 'https://pbs.twimg.com/media/5.jpg' }],
      },
    ];

    it('selects uncaptioned photos and videos while omitting pure GIFs and already processed docs', () => {
      const { batch, totalPending } = selectXMediaBatch(mockXDocs, { limit: 10 });
      expect(totalPending).toBe(3); // doc4_video, doc5_high_engagement_photo, doc1
      expect(batch.map((b) => b.id)).toEqual(['doc4_video', 'doc5_high_engagement_photo', 'doc1']);
      // Videos are prioritized first
      expect(batch[0].id).toBe('doc4_video');
      expect(batch[0].hasVideo).toBe(true);
      // Next is highest likes among photos
      expect(batch[1].id).toBe('doc5_high_engagement_photo');
      expect(batch[2].id).toBe('doc1');
    });

    it('respects handle filter and limit', () => {
      const { batch, totalPending } = selectXMediaBatch(mockXDocs, {
        limit: 1,
        handle: 'thechartist26',
      });
      expect(totalPending).toBe(1);
      expect(batch).toHaveLength(1);
      expect(batch[0].id).toBe('doc5_high_engagement_photo');
    });
  });
});
