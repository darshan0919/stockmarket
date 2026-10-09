'use strict';

const axios = require('axios');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 20000;

const BHAVCOPY_MCP_URL = 'https://mcp.nseindia.in/bhavcopy/cm/mcp';
const CMMKT_MCP_URL = 'https://mcp.nseindia.in/cmmkt/mcp';

/**
 * Manages HTTP JSON-RPC 2.0 communication with NSE's official Model Context Protocol (MCP) servers.
 * Handles protocol handshake (`initialize`), session caching (`Mcp-Session-Id`), Server-Sent Events
 * (SSE) stream unwrapping, and automatic session recovery on expiration.
 */
class NseMcpSession {
  /**
   * @param {Object} [opts]
   * @param {import('axios').AxiosInstance} [opts.axiosInstance]
   * @param {number} [opts.timeout]
   */
  constructor({ axiosInstance, timeout = DEFAULT_TIMEOUT_MS } = {}) {
    this.axios = axiosInstance || axios.create({ timeout });
    /** @type {Map<string, string>} */
    this.sessions = new Map();
  }

  static get BHAVCOPY_URL() {
    return BHAVCOPY_MCP_URL;
  }

  static get CMMKT_URL() {
    return CMMKT_MCP_URL;
  }

  /**
   * Standard browser headers required by NSE Akamai edge proxy.
   * @private
   */
  _baseHeaders() {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Origin: 'https://www.nseindia.com',
      Referer: 'https://www.nseindia.com/',
      'User-Agent': DEFAULT_USER_AGENT,
    };
  }

  /**
   * Initialize a new MCP session with the target server.
   * @param {string} serverUrl
   * @returns {Promise<string>} The Mcp-Session-Id.
   */
  async initialize(serverUrl) {
    const res = await this.axios.post(
      serverUrl,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'stock-api', version: '0.1.0' },
        },
      },
      {
        headers: this._baseHeaders(),
      }
    );

    const headers = res.headers || {};
    const sid =
      headers['mcp-session-id'] ||
      headers['Mcp-Session-Id'] ||
      (typeof headers.get === 'function' ? headers.get('mcp-session-id') : null);

    if (!sid) {
      throw new Error(`NSE MCP initialize failed: no Mcp-Session-Id returned from ${serverUrl}`);
    }

    this.sessions.set(serverUrl, sid);
    return sid;
  }

  /**
   * Clear cached session id for a server URL (or all servers).
   * @param {string} [serverUrl]
   */
  clearSession(serverUrl) {
    if (serverUrl) {
      this.sessions.delete(serverUrl);
    } else {
      this.sessions.clear();
    }
  }

  /**
   * Execute an MCP tool call against the target server URL.
   * @param {string} serverUrl - Server endpoint URL (e.g. BHAVCOPY_URL).
   * @param {string} toolName  - Name of the registered MCP tool.
   * @param {Object} [toolArgs] - Arguments object for the tool.
   * @returns {Promise<any>} Parsed result content.
   */
  async callTool(serverUrl, toolName, toolArgs = {}) {
    let sid = this.sessions.get(serverUrl);
    if (!sid) {
      sid = await this.initialize(serverUrl);
    }

    const postCall = async (currentSid) => {
      return this.axios.post(
        serverUrl,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: toolName, arguments: toolArgs },
        },
        {
          headers: {
            ...this._baseHeaders(),
            'Mcp-Session-Id': currentSid,
          },
          responseType: 'text',
        }
      );
    };

    let res;
    try {
      res = await postCall(sid);
    } catch (err) {
      // Re-initialize and retry once on 400 or 401 session expiry/invalid errors
      if (err.response && (err.response.status === 400 || err.response.status === 401)) {
        this.clearSession(serverUrl);
        sid = await this.initialize(serverUrl);
        res = await postCall(sid);
      } else {
        throw err;
      }
    }

    const rawText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    let rpcObj;

    // Handle SSE event stream format ('event:message\ndata:{"jsonrpc"...}')
    if (rawText.includes('data:')) {
      const dataLine = rawText.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) {
        throw new Error(
          `NSE MCP (${toolName}): received SSE response without data line: ${rawText.slice(0, 200)}`
        );
      }
      rpcObj = JSON.parse(dataLine.replace(/^data:/, '').trim());
    } else {
      rpcObj = JSON.parse(rawText);
    }

    if (rpcObj.error) {
      throw new Error(
        `NSE MCP RPC error (${toolName}): ${rpcObj.error.message || JSON.stringify(rpcObj.error)}`
      );
    }

    const result = rpcObj.result;
    if (result && result.isError) {
      const msg = result.content?.[0]?.text || 'Tool execution marked isError: true';
      throw new Error(`NSE MCP tool error (${toolName}): ${msg}`);
    }

    const textContent = result?.content?.[0]?.text;
    if (typeof textContent === 'string') {
      try {
        return JSON.parse(textContent);
      } catch {
        return textContent;
      }
    }

    return result;
  }
}

module.exports = {
  NseMcpSession,
  BHAVCOPY_MCP_URL,
  CMMKT_MCP_URL,
};
