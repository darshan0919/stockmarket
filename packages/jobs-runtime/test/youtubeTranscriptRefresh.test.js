'use strict';

const ytr = require('../youtubeTranscriptRefresh');

describe('youtubeTranscriptRefresh', () => {
  describe('parseArgs', () => {
    test('parses --recheck-no-captions alongside --force', () => {
      const args = ytr.parseArgs([
        'node',
        'youtubeTranscriptRefresh.js',
        '--force',
        '--recheck-no-captions',
      ]);
      expect(args.force).toBe(true);
      expect(args.recheckNoCaptions).toBe(true);
    });

    test('defaults recheckNoCaptions to false when not provided', () => {
      const args = ytr.parseArgs(['node', 'youtubeTranscriptRefresh.js']);
      expect(args.recheckNoCaptions).toBe(false);
      expect(args.channelHandles).toBeNull();
      expect(args.channelIds).toBeNull();
    });

    test('parses single channel handle and normalizes leading @', () => {
      const args = ytr.parseArgs([
        'node',
        'youtubeTranscriptRefresh.js',
        '--channel-handle',
        '@AnilLamba',
      ]);
      expect(args.channelHandle).toBe('AnilLamba');
      expect(args.channelHandles).toEqual(['AnilLamba']);
    });

    test('parses full YouTube channel URL into clean handle', () => {
      const args = ytr.parseArgs([
        'node',
        'youtubeTranscriptRefresh.js',
        '--channel-handle',
        'https://www.youtube.com/@AnilLamba',
      ]);
      expect(args.channelHandle).toBe('AnilLamba');
      expect(args.channelHandles).toEqual(['AnilLamba']);
    });

    test('parses multiple channels from comma-separated --channels flag', () => {
      const args = ytr.parseArgs([
        'node',
        'youtubeTranscriptRefresh.js',
        '--channels',
        '@SOICfinance,https://www.youtube.com/@AnilLamba',
      ]);
      expect(args.channelHandle).toBe('SOICfinance');
      expect(args.channelHandles).toEqual(['SOICfinance', 'AnilLamba']);
    });

    test('parses multiple repeated --channel-handle flags', () => {
      const args = ytr.parseArgs([
        'node',
        'youtubeTranscriptRefresh.js',
        '--channel-handle',
        '@SOICfinance',
        '--channel-handle',
        '@AnilLamba',
      ]);
      expect(args.channelHandles).toEqual(['SOICfinance', 'AnilLamba']);
    });

    test('parses multiple channel IDs via --channel-id and --channel-ids', () => {
      const args = ytr.parseArgs([
        'node',
        'youtubeTranscriptRefresh.js',
        '--channel-id',
        'UC_1111',
        '--channel-ids',
        'UC_2222,UC_3333',
      ]);
      expect(args.channelId).toBe('UC_1111');
      expect(args.channelIds).toEqual(['UC_1111', 'UC_2222', 'UC_3333']);
    });
  });

  describe('normalizeChannelHandle', () => {
    test('normalizes plain handle, handle with @, and full URLs', () => {
      expect(ytr.normalizeChannelHandle('SOICfinance')).toBe('SOICfinance');
      expect(ytr.normalizeChannelHandle('@SOICfinance')).toBe('SOICfinance');
      expect(ytr.normalizeChannelHandle('https://www.youtube.com/@AnilLamba')).toBe('AnilLamba');
      expect(ytr.normalizeChannelHandle('https://youtube.com/@AnilLamba/videos')).toBe('AnilLamba');
      expect(ytr.normalizeChannelHandle('https://www.youtube.com/c/AnilLamba')).toBe('AnilLamba');
      expect(ytr.normalizeChannelHandle('')).toBe('');
      expect(ytr.normalizeChannelHandle(null)).toBe('');
    });
  });

  describe('loadConfig', () => {
    const origEnv = process.env;
    beforeEach(() => {
      process.env = { ...origEnv };
      delete process.env.YOUTUBE_CHANNEL_HANDLES;
      delete process.env.YOUTUBE_CHANNELS;
      delete process.env.YOUTUBE_CHANNEL_HANDLE;
    });
    afterAll(() => {
      process.env = origEnv;
    });

    test('defaults channelHandles to SOICfinance and AnilLamba', () => {
      const cfg = ytr.loadConfig();
      expect(cfg.channelHandles).toEqual(['SOICfinance', 'AnilLamba']);
      expect(cfg.channelHandle).toBe('SOICfinance');
    });

    test('respects YOUTUBE_CHANNEL_HANDLES env var', () => {
      process.env.YOUTUBE_CHANNEL_HANDLES = '@AnilLamba,@SOICfinance';
      const cfg = ytr.loadConfig();
      expect(cfg.channelHandles).toEqual(['AnilLamba', 'SOICfinance']);
      expect(cfg.channelHandle).toBe('AnilLamba');
    });
  });

  describe('buildTranscriptDto', () => {
    const mkVideo = () => ({
      videoId: 'abc123XYZ',
      title: 'Some Video',
      publishedAt: '2026-08-01T10:00:00Z',
    });

    test('builds a normal DTO with transcript content', () => {
      const dto = ytr.buildTranscriptDto({
        channelId: 'UC_soicfinance',
        channelHandle: '@SOICfinance',
        channelTitle: 'SOIC Finance',
        video: mkVideo(),
        captionKind: 'asr',
        captionLang: 'en',
        transcript: {
          timestamped: '[00:00:00] Hi Investors',
          plain: 'Hi Investors',
          cues: [{ start: '00:00:00', text: 'Hi Investors' }],
        },
      });
      expect(dto.captionKind).toBe('asr');
      expect(dto.transcriptPlain).toBe('Hi Investors');
      expect(dto.rawCues).toHaveLength(1);
    });

    test('builds a "no captions" DTO with captionKind: none when given NO_CAPTIONS_TRANSCRIPT-shaped input', () => {
      const dto = ytr.buildTranscriptDto({
        channelId: 'UC_soicfinance',
        channelHandle: '@SOICfinance',
        channelTitle: 'SOIC Finance',
        video: mkVideo(),
        captionKind: 'none',
        captionLang: null,
        transcript: { timestamped: null, plain: null, cues: null },
      });
      expect(dto.captionKind).toBe('none');
      expect(dto.captionLang).toBeNull();
      expect(dto.transcriptPlain).toBeNull();
      expect(dto.transcriptTimestamped).toBeNull();
      expect(dto.rawCues).toBeNull();
    });
  });

  describe('parseVttCues', () => {
    test('dedups rolling auto-caption VTT into one line per phrase', () => {
      const vtt = [
        'WEBVTT',
        'Kind: captions',
        'Language: en',
        '',
        '00:00:02.800 --> 00:00:05.670 align:start position:0%',
        ' ',
        'Hi <00:00:03.165><c>Investors </c>Welcome',
        '',
        '00:00:05.670 --> 00:00:05.680 align:start position:0%',
        'Hi Investors Welcome',
        '',
        '00:00:05.680 --> 00:00:07.670 align:start position:0%',
        'Hi Investors Welcome',
        'Unique <00:00:05.875><c>Business </c>Series',
        '',
      ].join('\n');
      const cues = ytr.parseVttCues(vtt);
      expect(cues).toEqual([
        { start: '00:00:02', text: 'Hi Investors Welcome' },
        { start: '00:00:05', text: 'Unique Business Series' },
      ]);
    });

    test('returns an empty array for a VTT with no cues', () => {
      expect(ytr.parseVttCues('WEBVTT\n\n')).toEqual([]);
    });
  });

  describe('transcriptTexts', () => {
    test('formats cues into timestamped + plain text', () => {
      const cues = [
        { start: '00:00:00', text: 'Hello' },
        { start: '00:00:05', text: 'World' },
      ];
      expect(ytr.transcriptTexts(cues)).toEqual({
        timestamped: '[00:00:00] Hello\n[00:00:05] World',
        plain: 'Hello World',
      });
    });
  });
});
