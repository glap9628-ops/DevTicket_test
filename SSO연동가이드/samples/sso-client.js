/**
 * 이노티움 SSO 중앙 집중형 인증 클라이언트 (Node.js 18+)
 *
 * const { SsoClient } = require('./sso-client');
 * const sso = new SsoClient({ baseUrl, clientId, clientSecret });
 * const user = await sso.login('kim', 'plain');
 * await sso.changePassword('kim', 'old', 'New1!');
 * const u = await sso.getUser(user.userId);
 */

class SsoApiError extends Error {
  constructor(statusCode, messageKey, raw) {
    super(`SSO API ${statusCode} ${messageKey}`);
    this.statusCode = statusCode; this.messageKey = messageKey; this.raw = raw;
  }
}

class SsoClient {
  constructor({ baseUrl, clientId, clientSecret, timeout = 10000 }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.clientId = clientId; this.clientSecret = clientSecret; this.timeout = timeout;
    this._token = null; this._expiresAt = 0;
  }

  async _fetchToken() {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const r = await this._req('POST', '/apie/sso/oauth/client-token', { Authorization: `Basic ${basic}` });
    this._token = r.access_token;
    this._expiresAt = Date.now() + (r.expires_in - 60) * 1000;
  }

  async _auth() {
    if (!this._token || Date.now() >= this._expiresAt) await this._fetchToken();
    return { Authorization: `Bearer ${this._token}` };
  }

  async login(loginId, password) {
    return this._req('POST', '/apie/sso/auth/login',
      { ...(await this._auth()), 'Content-Type': 'application/json' },
      JSON.stringify({ loginId, password }));
  }

  async changePassword(loginId, currentPassword, newPassword) {
    return this._req('POST', '/apie/sso/auth/password',
      { ...(await this._auth()), 'Content-Type': 'application/json' },
      JSON.stringify({ loginId, currentPassword, newPassword }));
  }

  async getUser(userId) {
    return this._req('GET', `/apie/sso/users/${userId}`, await this._auth());
  }

  async listUsers({ keyword, departmentId, status, startIndex = 0, pageSize = 50 } = {}) {
    const p = new URLSearchParams({ startIndex: String(startIndex), pageSize: String(pageSize) });
    if (keyword) p.set('keyword', keyword);
    if (departmentId) p.set('departmentId', String(departmentId));
    if (status) p.set('status', status);
    return this._req('GET', `/apie/sso/users?${p}`, await this._auth());
  }

  async getDepartment(departmentId) {
    return this._req('GET', `/apie/sso/departments/${departmentId}`, await this._auth());
  }

  async listDepartments({ keyword, status, startIndex = 0, pageSize = 500 } = {}) {
    const p = new URLSearchParams({ startIndex: String(startIndex), pageSize: String(pageSize) });
    if (keyword) p.set('keyword', keyword);
    if (status) p.set('status', status);
    return this._req('GET', `/apie/sso/departments?${p}`, await this._auth());
  }

  async _req(method, path, headers, body) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), this.timeout);
    try {
      const res = await fetch(this.baseUrl + path, { method, headers, body, signal: c.signal });
      const text = await res.text();
      let b; try { b = text ? JSON.parse(text) : {}; } catch { b = { raw: text }; }
      if (!res.ok) throw new SsoApiError(res.status, b.messageKey || 'UNKNOWN', b);
      return b;
    } finally { clearTimeout(t); }
  }
}

module.exports = { SsoClient, SsoApiError };

// ──────── 실행 예시 ────────
if (require.main === module) {
  (async () => {
    const sso = new SsoClient({
      baseUrl: process.env.SSO_BASE_URL || 'https://sso.innotium.com',
      clientId: process.env.SSO_CLIENT_ID,
      clientSecret: process.env.SSO_CLIENT_SECRET,
    });
    const [, , loginId, password] = process.argv;
    if (!loginId) { console.log('Usage: node sso-client.js <loginId> <password>'); return; }
    try {
      const u = await sso.login(loginId, password);
      console.log(`✅ ${u.name} (userId=${u.userId}, dept=${u.primaryDepartment?.departmentName})`);
    } catch (e) {
      console.error(`❌ ${e.messageKey || e.message}`);
    }
  })();
}
