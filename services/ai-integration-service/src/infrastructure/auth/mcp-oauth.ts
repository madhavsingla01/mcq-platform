import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { readBoundedJson } from '../http/read-json.js';

export const MCP_PATH = '/api/v1/ai/mcp';
export const READ_SCOPE = 'quizfocus:read';
export const WRITE_SCOPE = 'quizfocus:write';
export const DELEGATION_HEADER = 'x-internal-quizfocus-delegation';

const intake = z.object({
  active: z.literal(true),
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number().int().positive(),
  quizfocus_user_id: z.string().regex(/^[a-f\d]{24}$/i),
  scope: z.string().max(2048),
});

export type OAuthConfig = {
  publicOrigin: string;
  issuer: string;
  introspectionUrl: string;
  clientId: string;
  clientSecret: string;
  delegationSecret: string;
};

export class McpOAuth {
  readonly resource: string;
  readonly metadataUrl: string;

  constructor(private readonly config: OAuthConfig, private readonly requester: typeof fetch = fetch) {
    this.resource = config.publicOrigin + MCP_PATH;
    this.metadataUrl = config.publicOrigin + '/.well-known/oauth-protected-resource' + MCP_PATH;
  }

  metadata() {
    return { resource: this.resource, authorization_servers: [this.config.issuer],
      scopes_supported: [READ_SCOPE, WRITE_SCOPE], bearer_methods_supported: ['header'] };
  }

  challenge(scope?: string) {
    return `Bearer realm="quizfocus", resource_metadata="${this.metadataUrl}"` +
      (scope ? `, error="insufficient_scope", scope="${scope}"` : '');
  }

  async verify(token: string) {
    let result: unknown;
    try {
      const basic = Buffer.from(encodeURIComponent(this.config.clientId) + ':' + encodeURIComponent(this.config.clientSecret)).toString('base64');
      const response = await this.requester(this.config.introspectionUrl, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token, token_type_hint: 'access_token' }),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      result = await readBoundedJson(response, 32 * 1024);
    } catch {
      throw new AppError('OAuth verification is temporarily unavailable', 503, 'OAUTH_UNAVAILABLE');
    }
    const parsed = intake.safeParse(result);
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.success || parsed.data.iss !== this.config.issuer ||
      ![parsed.data.aud].flat().includes(this.resource) || parsed.data.exp <= now) {
      throw new AppError('Invalid or revoked OAuth access token', 401, 'UNAUTHENTICATED');
    }
    const scopes = new Set(parsed.data.scope.split(' '));
    const userId = parsed.data.quizfocus_user_id.toLowerCase();
    return { userId, scopes };
  }

  delegate(userId: string, method: string, target: string) {
    const payload = Buffer.from(JSON.stringify({
      userId, method, target, expires: Math.floor(Date.now() / 1000) + 20,
    })).toString('base64url');
    return payload + '.' + createHmac('sha256', this.config.delegationSecret).update(payload).digest('base64url');
  }
}
