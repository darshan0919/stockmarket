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
