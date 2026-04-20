/**
 * Integration tests: research pipeline prompts + research dashboard upload/serve.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const researchPipelineRouter = require('../researchPipeline');
const stocksRouter = require('../stocks');
const { UPLOAD_ROOT } = require('../../controllers/researchDashboardController');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/research-pipeline', researchPipelineRouter);
  app.use('/api/stocks', stocksRouter);
  return app;
}

describe('research pipeline API', () => {
  const app = makeApp();
  const testSym = 'ZZTESTPIPE';
  const uploadDir = path.join(UPLOAD_ROOT, testSym);
  const uploadFile = path.join(uploadDir, 'dashboard.html');

  beforeAll(() => {
    try {
      if (fs.existsSync(uploadFile)) fs.unlinkSync(uploadFile);
      if (fs.existsSync(uploadDir)) fs.rmdirSync(uploadDir);
    } catch {
      /* ignore */
    }
  });

  afterAll(() => {
    try {
      if (fs.existsSync(uploadFile)) fs.unlinkSync(uploadFile);
      if (fs.existsSync(uploadDir)) fs.rmdirSync(uploadDir);
    } catch {
      /* ignore */
    }
  });

  it('GET /api/research-pipeline/prompts returns manifest', async () => {
    const res = await request(app).get('/api/research-pipeline/prompts');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const ids = res.body.data.map((x) => x.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'unified_master',
        'dashboard_master_v4',
        'annual_reports',
        'events_announcements',
      ])
    );
  });

  it('GET /api/research-pipeline/prompts/:id substitutes company and ticker', async () => {
    const res = await request(app)
      .get('/api/research-pipeline/prompts/unified_master')
      .query({ company: 'Acme Ltd', ticker: 'ACME' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Acme Ltd');
    expect(res.text).toContain('Ticker: ACME');
    expect(res.text).not.toContain('[Company name]');
  });

  it('HEAD research-dashboard returns 404 when missing', async () => {
    const res = await request(app).head(`/api/stocks/${testSym}/research-dashboard`);
    expect(res.status).toBe(404);
  });

  it('POST research-dashboard rejects non-HTML', async () => {
    const res = await request(app)
      .post(`/api/stocks/${testSym}/research-dashboard`)
      .attach('file', Buffer.from('not html'), 'note.txt');
    expect(res.status).toBe(400);
  });

  it('POST research-dashboard accepts HTML and GET returns body', async () => {
    const html = '<!DOCTYPE html><html><body><p>hi</p></body></html>';
    const postRes = await request(app)
      .post(`/api/stocks/${testSym}/research-dashboard`)
      .attach('file', Buffer.from(html), 'dash.html');
    expect(postRes.status).toBe(200);
    expect(postRes.body.success).toBe(true);

    const headRes = await request(app).head(`/api/stocks/${testSym}/research-dashboard`);
    expect(headRes.status).toBe(200);

    const getRes = await request(app).get(`/api/stocks/${testSym}/research-dashboard`);
    expect(getRes.status).toBe(200);
    expect(getRes.text).toContain('<p>hi</p>');

    const delRes = await request(app).delete(`/api/stocks/${testSym}/research-dashboard`);
    expect(delRes.status).toBe(200);

    const gone = await request(app).head(`/api/stocks/${testSym}/research-dashboard`);
    expect(gone.status).toBe(404);
  });
});
