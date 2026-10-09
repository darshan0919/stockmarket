'use strict';

const { NseMcpSession } = require('../src/http/nseMcpSession');

describe('NseMcpSession', () => {
  const dummyUrl = 'https://mcp.nseindia.in/bhavcopy/cm/mcp';

  test('initialize requests handshake and stores Mcp-Session-Id', async () => {
    const postMock = jest.fn().mockResolvedValue({
      headers: { 'mcp-session-id': 'test-session-123' },
      data: { jsonrpc: '2.0', id: 1, result: {} },
    });
    const session = new NseMcpSession({ axiosInstance: { post: postMock } });

    const sid = await session.initialize(dummyUrl);
    expect(sid).toBe('test-session-123');
    expect(session.sessions.get(dummyUrl)).toBe('test-session-123');
    expect(postMock).toHaveBeenCalledWith(
      dummyUrl,
      expect.objectContaining({ method: 'initialize' }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Origin: 'https://www.nseindia.com',
          Referer: 'https://www.nseindia.com/',
        }),
      })
    );
  });

  test('callTool initializes if no session exists and parses SSE data response', async () => {
    const sseResponseText =
      'event:message\ndata:{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"status\\":\\"ok\\",\\"value\\":42}"}],"isError":false}}\n\n';

    const postMock = jest
      .fn()
      .mockResolvedValueOnce({
        headers: { 'mcp-session-id': 'sess-abc' },
        data: {},
      })
      .mockResolvedValueOnce({
        headers: {},
        data: sseResponseText,
      });

    const session = new NseMcpSession({ axiosInstance: { post: postMock } });
    const res = await session.callTool(dummyUrl, 'test_tool', { foo: 'bar' });

    expect(res).toEqual({ status: 'ok', value: 42 });
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  test('callTool re-initializes and retries once on 400 session error', async () => {
    const sseSuccess =
      'data:{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\\"recovered\\":true}"}]}}\n';

    const postMock = jest
      .fn()
      // Initial handshake
      .mockResolvedValueOnce({
        headers: { 'mcp-session-id': 'sess-expired' },
        data: {},
      })
      // Tool call fails with 400 (session expired)
      .mockRejectedValueOnce({
        response: { status: 400, data: 'Invalid session' },
      })
      // Re-handshake
      .mockResolvedValueOnce({
        headers: { 'mcp-session-id': 'sess-fresh' },
        data: {},
      })
      // Retry tool call succeeds
      .mockResolvedValueOnce({
        headers: {},
        data: sseSuccess,
      });

    const session = new NseMcpSession({ axiosInstance: { post: postMock } });
    const res = await session.callTool(dummyUrl, 'some_tool');

    expect(res).toEqual({ recovered: true });
    expect(session.sessions.get(dummyUrl)).toBe('sess-fresh');
    expect(postMock).toHaveBeenCalledTimes(4);
  });

  test('callTool throws on rpc error or tool isError', async () => {
    const session = new NseMcpSession({
      axiosInstance: {
        post: jest
          .fn()
          .mockResolvedValueOnce({
            headers: { 'mcp-session-id': 's1' },
            data: {},
          })
          .mockResolvedValueOnce({
            headers: {},
            data: 'data:{"jsonrpc":"2.0","id":1,"error":{"message":"Internal server error"}}\n',
          }),
      },
    });

    await expect(session.callTool(dummyUrl, 'bad_tool')).rejects.toThrow(
      'NSE MCP RPC error (bad_tool): Internal server error'
    );
  });
});
