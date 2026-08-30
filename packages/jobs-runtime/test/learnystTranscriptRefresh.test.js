'use strict';

const ltr = require('../learnystTranscriptRefresh');

describe('learnystTranscriptRefresh', () => {
  describe('parseArgs', () => {
    test('parses --only, --skip, --force, --module-delay-ms, --lesson-limit', () => {
      const args = ltr.parseArgs([
        'node',
        'learnystTranscriptRefresh.js',
        '--only',
        '101,102',
        '--skip',
        '201',
        '--force',
        '--module-delay-ms',
        '5000',
        '--lesson-limit',
        '3',
      ]);
      expect(args.only.has('101')).toBe(true);
      expect(args.only.has('102')).toBe(true);
      expect(args.skip.has('201')).toBe(true);
      expect(args.force).toBe(true);
      expect(args.moduleDelayMsOverride).toBe('5000');
      expect(args.lessonLimit).toBe(3);
    });

    test('defaults when flags not provided', () => {
      const args = ltr.parseArgs(['node', 'learnystTranscriptRefresh.js']);
      expect(args.only).toBeNull();
      expect(args.skip).toBeNull();
      expect(args.force).toBe(false);
      expect(args.moduleDelayMsOverride).toBeNull();
      expect(args.lessonLimit).toBeNull();
    });
  });

  describe('isVideoLesson', () => {
    test('true for a Learnyst-hosted video entry (src_type 2), regardless of lesson_type', () => {
      // Chartitude uses lesson_type 7 for video (SOIC uses 1) — detection
      // must key off the content shape, not the numeric lesson_type.
      const lesson = {
        lesson_type: 7,
        lesson_data: JSON.stringify([{ src_type: 2, content_path: 'path/to/video.mp4' }]),
      };
      expect(ltr.isVideoLesson(lesson)).toBe(true);
    });

    test('true for an externally-hosted YouTube entry (src_type 5)', () => {
      const lesson = {
        lesson_type: 1,
        lesson_data: JSON.stringify([{ src: 'https://youtu.be/abc', src_type: 5 }]),
      };
      expect(ltr.isVideoLesson(lesson)).toBe(true);
    });

    test('false for a PDF lesson even though it has its own content_path', () => {
      // Chartitude's PDF lessons (lesson_type 6) carry a content_path too —
      // must not be misclassified as video just because content_path exists.
      const lesson = {
        lesson_type: 6,
        lesson_data: JSON.stringify([{ src_type: 3, content_path: 'schools/x/doc.pdf' }]),
      };
      expect(ltr.isVideoLesson(lesson)).toBe(false);
    });

    test('false for missing/malformed lesson_data', () => {
      expect(ltr.isVideoLesson({})).toBe(false);
      expect(ltr.isVideoLesson({ lesson_data: 'invalid json' })).toBe(false);
      expect(ltr.isVideoLesson({ lesson_data: '[]' })).toBe(false);
    });
  });

  describe('extractContentPath', () => {
    test('extracts content path from lesson_data json array', () => {
      const lesson = {
        id: 123,
        lesson_data: JSON.stringify([{ src_type: 2, content_path: 'path/to/video.mp4' }]),
      };
      expect(ltr.extractContentPath(lesson)).toEqual({ contentPath: 'path/to/video.mp4' });
    });

    test('handles missing or malformed lesson_data', () => {
      expect(ltr.extractContentPath({})).toHaveProperty('error');
      expect(ltr.extractContentPath({ lesson_data: 'invalid json' })).toHaveProperty('error');
      expect(ltr.extractContentPath({ lesson_data: '[]' })).toHaveProperty('error');
      expect(ltr.extractContentPath({ lesson_data: '[{}]' })).toHaveProperty('error');
    });
  });

  describe('extractYoutubeVideoId / parseYoutubeVideoId', () => {
    test('parses watch?v=, youtu.be, embed, and shorts URL forms', () => {
      expect(ltr.parseYoutubeVideoId('https://www.youtube.com/watch?v=PHe0bXAIuk0')).toBe(
        'PHe0bXAIuk0'
      );
      expect(ltr.parseYoutubeVideoId('https://youtu.be/pvQ9BwfVHbE')).toBe('pvQ9BwfVHbE');
      expect(ltr.parseYoutubeVideoId('https://www.youtube.com/embed/HHZBnmnFdjQ')).toBe(
        'HHZBnmnFdjQ'
      );
      expect(ltr.parseYoutubeVideoId('https://www.youtube.com/shorts/abc123XYZ90')).toBe(
        'abc123XYZ90'
      );
    });

    test('returns null for a non-YouTube or malformed URL', () => {
      expect(ltr.parseYoutubeVideoId('https://vimeo.com/12345')).toBeNull();
      expect(ltr.parseYoutubeVideoId(null)).toBeNull();
    });

    test('extracts the video id from a src_type:5 lesson_data entry (no content_path)', () => {
      const lesson = {
        id: 456,
        lesson_data: JSON.stringify([
          { src: 'https://www.youtube.com/watch?v=PHe0bXAIuk0', src_type: 5, state: 4 },
        ]),
      };
      expect(ltr.extractYoutubeVideoId(lesson)).toBe('PHe0bXAIuk0');
    });

    test('returns null when lesson_data has no YouTube entry', () => {
      const lesson = {
        lesson_data: JSON.stringify([{ src_type: 2, content_path: 'path/to/video.mp4' }]),
      };
      expect(ltr.extractYoutubeVideoId(lesson)).toBeNull();
      expect(ltr.extractYoutubeVideoId({})).toBeNull();
      expect(ltr.extractYoutubeVideoId({ lesson_data: 'invalid json' })).toBeNull();
    });
  });

  describe('transcriptTexts', () => {
    test('formats timestamped and plain transcripts from timestamp keys', () => {
      const apiResponse = {
        data: {
          '00:00:00': 'Welcome to this lesson',
          '00:00:05': 'Today we discuss margins',
        },
      };
      const { timestamped, plain } = ltr.transcriptTexts(apiResponse);
      expect(timestamped).toContain('[00:00:00] Welcome to this lesson');
      expect(timestamped).toContain('[00:00:05] Today we discuss margins');
      expect(plain).toBe('Welcome to this lesson Today we discuss margins');
    });

    test('handles missing or empty transcript data', () => {
      expect(ltr.transcriptTexts(null)).toEqual({ timestamped: null, plain: null });
      expect(ltr.transcriptTexts({})).toEqual({ timestamped: null, plain: null });
      expect(ltr.transcriptTexts({ data: [] })).toEqual({ timestamped: null, plain: null });
    });
  });

  describe('lessonRecordId & buildTranscriptDto', () => {
    test('generates expected id format', () => {
      const id = ltr.lessonRecordId(97666, 12345);
      expect(id).toMatch(/^lyt_learnyst-transcript-refresh_97666__/);
    });

    test('namespaces the id scope by siteKey for non-soic sites', () => {
      const soicId = ltr.lessonRecordId(12345, 999, 'soic');
      const chartitudeId = ltr.lessonRecordId(12345, 999, 'chartitude');
      expect(soicId).toMatch(/^lyt_learnyst-transcript-refresh_12345__/);
      expect(chartitudeId).toMatch(/^lyt_learnyst-transcript-refresh_chartitude:12345__/);
      expect(soicId).not.toBe(chartitudeId);
    });

    test('builds DTO correctly', () => {
      const dto = ltr.buildTranscriptDto({
        courseId: '97666',
        courseTitle: 'SOIC Course',
        sectionId: 'sec1',
        lesson: { id: 12345, title: 'Lesson 1', lesson_type: 1, duration: 600 },
        contentPath: 'path/to/v.mp4',
        apiResponse: { data: { '00:00:00': 'Hello' } },
      });
      expect(dto.id).toMatch(/^lyt_learnyst-transcript-refresh_97666__/);
      expect(dto.type).toBe('learnyst-transcript');
      expect(dto.courseId).toBe('97666');
      expect(dto.lessonId).toBe(12345);
      expect(dto.transcriptPlain).toBe('Hello');
      expect(dto.transcriptTimestamped).toBe('[00:00:00] Hello');
      expect(dto.transcriptSource).toBe('learnyst');
      expect(dto.youtubeVideoId).toBeNull();
    });

    test('builds a YouTube-sourced DTO when youtubeVideoId is given (no content_path)', () => {
      const dto = ltr.buildTranscriptDto({
        courseId: '97666',
        courseTitle: 'SOIC Course (Hindi)',
        sectionId: 'sec1',
        lesson: { id: 77, title: 'Why Bull & Bear Markets happen?', lesson_type: 1, duration: 900 },
        youtubeVideoId: 'PHe0bXAIuk0',
        captionKind: 'asr',
        captionLang: 'en',
        youtubeTranscript: {
          timestamped: '[00:00:00] Hi Investors',
          plain: 'Hi Investors',
          cues: [{ start: '00:00:00', text: 'Hi Investors' }],
        },
      });
      expect(dto.transcriptSource).toBe('youtube');
      expect(dto.youtubeVideoId).toBe('PHe0bXAIuk0');
      expect(dto.captionKind).toBe('asr');
      expect(dto.captionLang).toBe('en');
      expect(dto.contentPath).toBeNull();
      expect(dto.rawResponse).toBeNull();
      expect(dto.transcriptPlain).toBe('Hi Investors');
      expect(dto.transcriptTimestamped).toBe('[00:00:00] Hi Investors');
      expect(dto.rawCues).toHaveLength(1);
    });

    test('builds a "no captions" YouTube DTO with captionKind: none when youtubeTranscript is omitted', () => {
      const dto = ltr.buildTranscriptDto({
        courseId: '97666',
        courseTitle: 'SOIC Course (Hindi)',
        sectionId: 'sec1',
        lesson: { id: 78, title: 'Some Shorts Clip', lesson_type: 1, duration: 45 },
        youtubeVideoId: 'zzz999QQQ',
        captionKind: 'none',
        captionLang: null,
        youtubeTranscript: null,
      });
      expect(dto.transcriptSource).toBe('youtube');
      expect(dto.captionKind).toBe('none');
      expect(dto.captionLang).toBeNull();
      expect(dto.transcriptPlain).toBeNull();
      expect(dto.transcriptTimestamped).toBeNull();
      expect(dto.rawCues).toBeNull();
    });
  });

  describe('loadSiteConfig / loadSites', () => {
    const ENV_KEYS = [
      'LEARNYST_SOIC_AUTH_TOKEN',
      'LEARNYST_SOIC_ORIGIN',
      'LEARNYST_CHARTITUDE_AUTH_TOKEN',
      'LEARNYST_CHARTITUDE_SCHOOL_ID',
      'LEARNYST_CHARTITUDE_BUNDLE_ID',
      'LEARNYST_CHARTITUDE_ORIGIN',
      'LEARNYST_SITE_KEYS',
    ];
    const savedEnv = {};
    beforeEach(() => {
      for (const k of ENV_KEYS) {
        savedEnv[k] = process.env[k];
        delete process.env[k];
      }
    });
    afterEach(() => {
      for (const k of ENV_KEYS) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
      }
    });

    test('soic defaults schoolId/bundleId/origin, needs only its own auth token', () => {
      process.env.LEARNYST_SOIC_AUTH_TOKEN = 'soic-token';
      const { config, error } = ltr.loadSiteConfig('soic');
      expect(error).toBeUndefined();
      expect(config.authToken).toBe('soic-token');
      expect(config.schoolId).toBe('110998');
      expect(config.bundleId).toBe('97666');
      expect(config.origin).toBe('https://learn.soic.in');
    });

    test('chartitude defaults schoolId/bundleId/origin too, needs only its own auth token', () => {
      process.env.LEARNYST_CHARTITUDE_AUTH_TOKEN = 'chartitude-token';
      const { config, error } = ltr.loadSiteConfig('chartitude');
      expect(error).toBeUndefined();
      expect(config.authToken).toBe('chartitude-token');
      expect(config.schoolId).toBe('166281');
      expect(config.bundleId).toBe('189631');
      expect(config.origin).toBe('https://learn.chartitude.com');
    });

    test('a site not in SITE_DEFAULTS is built entirely from its own prefixed env vars', () => {
      process.env.LEARNYST_UNKNOWNSITE_AUTH_TOKEN = 'unknown-token';
      process.env.LEARNYST_UNKNOWNSITE_SCHOOL_ID = '555';
      process.env.LEARNYST_UNKNOWNSITE_BUNDLE_ID = '999';
      process.env.LEARNYST_UNKNOWNSITE_ORIGIN = 'https://example.com';
      const { config, error } = ltr.loadSiteConfig('unknownsite');
      expect(error).toBeUndefined();
      expect(config.authToken).toBe('unknown-token');
      expect(config.schoolId).toBe('555');
      expect(config.bundleId).toBe('999');
      expect(config.origin).toBe('https://example.com');
      expect(config.referer).toBe('https://example.com/');
      delete process.env.LEARNYST_UNKNOWNSITE_AUTH_TOKEN;
      delete process.env.LEARNYST_UNKNOWNSITE_SCHOOL_ID;
      delete process.env.LEARNYST_UNKNOWNSITE_BUNDLE_ID;
      delete process.env.LEARNYST_UNKNOWNSITE_ORIGIN;
    });

    test('a site not in SITE_DEFAULTS with only an auth token errors on missing schoolId/bundleId', () => {
      process.env.LEARNYST_UNKNOWNSITE_AUTH_TOKEN = 'unknown-token';
      const { config, error } = ltr.loadSiteConfig('unknownsite');
      expect(config).toBeUndefined();
      expect(error).toMatch(/schoolId/);
      delete process.env.LEARNYST_UNKNOWNSITE_AUTH_TOKEN;
    });

    test('errors for a site with no auth token configured', () => {
      const { config, error } = ltr.loadSiteConfig('chartitude');
      expect(config).toBeUndefined();
      expect(error).toMatch(/AUTH_TOKEN/);
    });

    test('loadSites skips unconfigured sites and reports the reason', () => {
      process.env.LEARNYST_SOIC_AUTH_TOKEN = 'soic-token';
      // chartitude has no auth token set in this test, so it's skipped.
      const skipped = [];
      const sites = ltr.loadSites({ site: null }, (key, reason) => skipped.push({ key, reason }));
      expect(sites.map((s) => s.key)).toEqual(['soic']);
      expect(skipped).toHaveLength(1);
      expect(skipped[0].key).toBe('chartitude');
      expect(skipped[0].reason).toMatch(/AUTH_TOKEN/);
    });

    test('--site restricts to exactly one site', () => {
      process.env.LEARNYST_CHARTITUDE_AUTH_TOKEN = 'chartitude-token';
      process.env.LEARNYST_CHARTITUDE_BUNDLE_ID = '999';
      const sites = ltr.loadSites({ site: 'chartitude' }, () => {});
      expect(sites.map((s) => s.key)).toEqual(['chartitude']);
    });
  });
});
