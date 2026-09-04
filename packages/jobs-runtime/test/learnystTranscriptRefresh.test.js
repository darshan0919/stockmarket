const fs = require('fs');
const path = require('path');
const os = require('os');
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
        '--skip-attachments',
        '--module-delay-ms',
        '5000',
        '--lesson-limit',
        '3',
      ]);
      expect(args.only.has('101')).toBe(true);
      expect(args.only.has('102')).toBe(true);
      expect(args.skip.has('201')).toBe(true);
      expect(args.force).toBe(true);
      expect(args.skipAttachments).toBe(true);
      expect(args.attachmentsOnly).toBe(false);
      expect(args.moduleDelayMsOverride).toBe('5000');
      expect(args.lessonLimit).toBe(3);
    });

    test('parses --attachments-only flag', () => {
      const args = ltr.parseArgs(['node', 'learnystTranscriptRefresh.js', '--attachments-only']);
      expect(args.attachmentsOnly).toBe(true);
      expect(args.skipAttachments).toBe(false);
    });

    test('parses --video and --quality flags', () => {
      const args = ltr.parseArgs([
        'node',
        'learnystTranscriptRefresh.js',
        '--video',
        '1223728',
        '--quality',
        'mq',
      ]);
      expect(args.videoLessonId).toBe('1223728');
      expect(args.quality).toBe('MQ');
    });

    test('defaults when flags not provided', () => {
      const args = ltr.parseArgs(['node', 'learnystTranscriptRefresh.js']);
      expect(args.only).toBeNull();
      expect(args.skip).toBeNull();
      expect(args.force).toBe(false);
      expect(args.skipAttachments).toBe(false);
      expect(args.attachmentsOnly).toBe(false);
      expect(args.videoLessonId).toBeNull();
      expect(args.quality).toBe('HQ');
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

    test('namespaces the id scope by siteKey for non-soic sites, and aliases chartist to chartitude', () => {
      const soicId = ltr.lessonRecordId(12345, 999, 'soic');
      const chartitudeId = ltr.lessonRecordId(12345, 999, 'chartitude');
      const chartistId = ltr.lessonRecordId(12345, 999, 'chartist');
      expect(soicId).toMatch(/^lyt_learnyst-transcript-refresh_12345__/);
      expect(chartitudeId).toMatch(/^lyt_learnyst-transcript-refresh_chartitude:12345__/);
      expect(chartistId).toBe(chartitudeId);
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

    test('loadSites defaults to soic only (chartitude/chartist disabled by default)', () => {
      process.env.LEARNYST_SOIC_AUTH_TOKEN = 'soic-token';
      const skipped = [];
      const sites = ltr.loadSites({ site: null }, (key, reason) => skipped.push({ key, reason }));
      expect(sites.map((s) => s.key)).toEqual(['soic']);
      expect(skipped).toHaveLength(0);
    });

    test('loadSites skips unconfigured sites when explicitly requested via LEARNYST_SITE_KEYS', () => {
      process.env.LEARNYST_SOIC_AUTH_TOKEN = 'soic-token';
      process.env.LEARNYST_SITE_KEYS = 'soic,chartitude';
      // chartitude has no auth token set in this test, so it's skipped.
      const skipped = [];
      const sites = ltr.loadSites({ site: null }, (key, reason) => skipped.push({ key, reason }));
      expect(sites.map((s) => s.key)).toEqual(['soic']);
      expect(skipped).toHaveLength(1);
      expect(skipped[0].key).toBe('chartitude');
      expect(skipped[0].reason).toMatch(/AUTH_TOKEN/);
    });

    test('--site restricts to exactly one site, and supports "chartist" as an alias for "chartitude"', () => {
      process.env.LEARNYST_CHARTITUDE_AUTH_TOKEN = 'chartitude-token';
      process.env.LEARNYST_CHARTITUDE_BUNDLE_ID = '999';
      const sites1 = ltr.loadSites({ site: 'chartitude' }, () => {});
      expect(sites1.map((s) => s.key)).toEqual(['chartitude']);

      const sites2 = ltr.loadSites({ site: 'chartist' }, () => {});
      expect(sites2.map((s) => s.key)).toEqual(['chartitude']);
      expect(sites2[0].bundleId).toBe('999');
    });
  });

  describe('withRetry', () => {
    test('does not retry when error message is "Transcript not found"', async () => {
      let calls = 0;
      const fn = jest.fn().mockImplementation(async () => {
        calls++;
        throw new Error('Transcript not found');
      });

      await expect(ltr.withRetry(fn, { maxRetries: 4, label: 'test' })).rejects.toThrow(
        'Transcript not found'
      );
      expect(calls).toBe(1);
    });

    test('does not retry when error message contains "HTTP 404: Transcript not found"', async () => {
      let calls = 0;
      const fn = jest.fn().mockImplementation(async () => {
        calls++;
        throw new Error('HTTP 404: Transcript not found');
      });

      await expect(ltr.withRetry(fn, { maxRetries: 4, label: 'test' })).rejects.toThrow(
        'HTTP 404: Transcript not found'
      );
      expect(calls).toBe(1);
    });

    test('does not retry on HTTP 401 / HTTP 403 auth errors', async () => {
      let calls = 0;
      const fn = jest.fn().mockImplementation(async () => {
        calls++;
        throw new Error('HTTP 401: Unauthorized');
      });

      await expect(ltr.withRetry(fn, { maxRetries: 4, label: 'test' })).rejects.toThrow(
        /authentication failed/
      );
      expect(calls).toBe(1);
    });
  });

  describe('extractAttachments', () => {
    test('correctly extracts attachment and generates exact URL for lesson 5234038', () => {
      const lesson = {
        id: 5234038,
        title: '30.08.26 Market Signals',
        pdf_file_name: JSON.stringify([
          {
            src: 'New_age_modern_monopolies_lyst1788246279479.pdf',
            src_type: 50,
            state: 4,
            src_id: 447486,
            url: 'gs://learnyst-content-upload/schools/110998/courses/259901/lessons/5234038/New_age_modern_monopolies_lyst1788246279479.pdf',
            size: 0,
            content_id: '0/0',
            content_path:
              '110998/059b2aea49016dec72cac0ed72e31bba/ffd424b48b90ec3b5b918ab4f344a633/922591e048cd54845c61620d0fe937c9',
            content_path_extn: '0/0',
          },
        ]),
      };

      const { attachments, externalLinks } = ltr.extractAttachments(lesson, {
        attachmentCdnBase: 'https://download-cdn-g.learnyst.com/v6/schools',
      });

      expect(attachments).toHaveLength(1);
      expect(externalLinks).toHaveLength(0);

      const att = attachments[0];
      expect(att.src).toBe('New_age_modern_monopolies_lyst1788246279479.pdf');
      expect(att.srcType).toBe(50);
      expect(att.downloadUrl).toBe(
        'https://download-cdn-g.learnyst.com/v6/schools/110998/059b2aea49016dec72cac0ed72e31bba/ffd424b48b90ec3b5b918ab4f344a633/922591e048cd54845c61620d0fe937c9/resources/New_age_modern_monopolies_lyst1788246279479.pdf'
      );
      expect(att.localPath).toBe(
        path.join(
          'assets',
          'learnyst-attachments',
          'New_age_modern_monopolies_lyst1788246279479.pdf'
        )
      );
    });

    test('extracts multiple attachments including PDFs and external web links', () => {
      const lesson = {
        id: 2569889,
        title: 'Class 3 | Finding Multibaggers',
        pdf_file_name: JSON.stringify([
          {
            src: 'How_to_Find_Multibaggers_lyst3315.pdf',
            src_type: 50,
            content_path: '110998/hash1/hash2/hash3',
          },
          {
            src: 'Match_The_Following_lyst9191.pdf',
            src_type: 50,
            content_path: '110998/hash4/hash5/hash6',
          },
          {
            src: '',
            src_type: 51,
            url: 'https://www.screener.in/user/145178/',
          },
        ]),
      };

      const { attachments, externalLinks } = ltr.extractAttachments(lesson);
      expect(attachments).toHaveLength(2);
      expect(attachments[0].src).toBe('How_to_Find_Multibaggers_lyst3315.pdf');
      expect(attachments[1].src).toBe('Match_The_Following_lyst9191.pdf');
      expect(externalLinks).toHaveLength(1);
      expect(externalLinks[0].url).toBe('https://www.screener.in/user/145178/');
    });

    test('handles non-PDF file attachments (e.g. .xlsx)', () => {
      const lesson = {
        id: 3551855,
        title: 'Resources',
        pdf_file_name: JSON.stringify([
          {
            src: 'SOIC_Screneer_Sheet_lyst1734596456228.xlsx',
            src_type: 50,
            content_path: '110998/hashA/hashB/hashC',
          },
        ]),
      };

      const { attachments } = ltr.extractAttachments(lesson);
      expect(attachments).toHaveLength(1);
      expect(attachments[0].src).toBe('SOIC_Screneer_Sheet_lyst1734596456228.xlsx');
      expect(attachments[0].downloadUrl).toContain('SOIC_Screneer_Sheet_lyst1734596456228.xlsx');
    });

    test('handles empty, null, or invalid pdf_file_name gracefully', () => {
      expect(ltr.extractAttachments({})).toEqual({ attachments: [], externalLinks: [] });
      expect(ltr.extractAttachments({ pdf_file_name: null })).toEqual({
        attachments: [],
        externalLinks: [],
      });
      expect(ltr.extractAttachments({ pdf_file_name: '[]' })).toEqual({
        attachments: [],
        externalLinks: [],
      });
      expect(ltr.extractAttachments({ pdf_file_name: 'not json' })).toHaveProperty('error');
    });
  });

  describe('downloadAttachmentFile', () => {
    let tmpDir;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltr-att-test-'));
    });
    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_ignore) {
        // ignore cleanup error
      }
    });

    test('downloads and saves file atomically', async () => {
      const targetFile = path.join(tmpDir, 'test.pdf');
      const fakeContent = 'Mock PDF binary content here';

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(fakeContent));
            controller.close();
          },
        }),
      }));

      try {
        const { sizeBytes } = await ltr.downloadAttachmentFile(
          'https://download-cdn-g.learnyst.com/sample.pdf',
          targetFile,
          { maxRetries: 1 }
        );
        expect(sizeBytes).toBe(Buffer.byteLength(fakeContent));
        expect(fs.existsSync(targetFile)).toBe(true);
        expect(fs.readFileSync(targetFile, 'utf8')).toBe(fakeContent);
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('fails and cleans up on HTTP error', async () => {
      const targetFile = path.join(tmpDir, 'fail.pdf');
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(async () => ({
        ok: false,
        status: 404,
      }));

      try {
        await expect(
          ltr.downloadAttachmentFile('https://download-cdn-g.learnyst.com/fail.pdf', targetFile, {
            maxRetries: 0,
          })
        ).rejects.toThrow(/HTTP 404/);
        expect(fs.existsSync(targetFile)).toBe(false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('sanitizeVideoFilename', () => {
    test('sanitizes titles with special characters, punctuation, and spaces', () => {
      expect(ltr.sanitizeVideoFilename('Class 1: Intro to Valuation & P/E!')).toBe(
        'Class_1__Intro_to_Valuation___P_E_'
      );
      expect(ltr.sanitizeVideoFilename('')).toBe('lesson');
      expect(ltr.sanitizeVideoFilename(null)).toBe('lesson');
    });
  });

  describe('resolveLearnystVideoUrls', () => {
    test('resolves full video track URLs and audio track URL from lesson_data', () => {
      const lesson = {
        id: 1223728,
        lesson_data: JSON.stringify([
          {
            src_type: 2,
            content_path: '110998/hashA/hashB/hashC',
            content_path_extn: '0/enb13daa4730367c',
          },
        ]),
      };

      const res = ltr.resolveLearnystVideoUrls(lesson, {
        streamingCdnBase: 'https://streaming-cdn-g.learnyst.com/v6/schools',
      });

      expect(res).not.toHaveProperty('error');
      expect(res.contentPath).toBe('110998/hashA/hashB/hashC');
      expect(res.videoUrl).toBe(
        'https://streaming-cdn-g.learnyst.com/v6/schools/110998/hashA/hashB/hashC/enb13daa4730367c/sdrm/cbcs/audio_video/vHQStream.mp4'
      );
      expect(res.audioUrl).toBe(
        'https://streaming-cdn-g.learnyst.com/v6/schools/110998/hashA/hashB/hashC/enb13daa4730367c/sdrm/cbcs/audio_video/aStream.mp4'
      );
      expect(res.tracks.HQ).toContain('vHQStream.mp4');
      expect(res.tracks.MQ).toContain('vMQStream.mp4');
      expect(res.tracks.AQ).toContain('vAQStream.mp4');
      expect(res.tracks.LQ).toContain('vLQStream.mp4');
      expect(res.tracks.audio).toContain('aStream.mp4');
    });

    test('handles content_path_extn without slash and strips schools/ prefix from content_path', () => {
      const lesson = {
        id: 1223728,
        lesson_data: JSON.stringify([
          {
            src_type: 2,
            content_path: 'schools/110998/hashA/hashB/hashC',
            content_path_extn: 'rawToken123',
          },
        ]),
      };

      const res = ltr.resolveLearnystVideoUrls(lesson);
      expect(res.videoUrl).toBe(
        'https://streaming-cdn-g.learnyst.com/v6/schools/110998/hashA/hashB/hashC/rawToken123/sdrm/cbcs/audio_video/vHQStream.mp4'
      );
    });

    test('returns error for missing or malformed lesson_data or missing content_path', () => {
      expect(ltr.resolveLearnystVideoUrls({})).toHaveProperty('error');
      expect(ltr.resolveLearnystVideoUrls({ lesson_data: 'invalid json' })).toHaveProperty('error');
      expect(ltr.resolveLearnystVideoUrls({ lesson_data: '[]' })).toHaveProperty('error');
      expect(
        ltr.resolveLearnystVideoUrls({ lesson_data: JSON.stringify([{ src_type: 2 }]) })
      ).toHaveProperty('error');
    });
  });

  describe('checkFfmpegAvailable', () => {
    test('returns true when ffmpeg is available', async () => {
      const available = await ltr.checkFfmpegAvailable();
      expect(available).toBe(true);
    });

    test('throws when non-existent binary path is passed', async () => {
      await expect(ltr.checkFfmpegAvailable('non_existent_ffmpeg_bin_12345')).rejects.toThrow(
        /ffmpeg is not available/
      );
    });
  });

  describe('downloadLessonVideo', () => {
    test('skips download if video already exists in db cache and force is false', async () => {
      const db = require('../lib/db');
      const spyHas = jest.spyOn(db, 'hasLearnystVideo').mockReturnValue(true);
      const spyPath = jest
        .spyOn(db, 'learnystVideoPath')
        .mockReturnValue('/tmp/fake-lesson-video.mp4');

      try {
        const lesson = {
          id: 99999,
          title: 'Sample Video Lesson',
          lesson_data: JSON.stringify([{ src_type: 2, content_path: 'path' }]),
        };

        const result = await ltr.downloadLessonVideo({}, lesson, { force: false });
        expect(result.skipped).toBe(true);
        expect(result.filename).toBe('99999_Sample_Video_Lesson.mp4');
      } finally {
        spyHas.mockRestore();
        spyPath.mockRestore();
      }
    });
  });
});
