import type { IncomingHttpHeaders } from 'node:http';
import type { IdentityProvider } from '../../application/ports/identity-provider.js';
import type { AuthenticatedUser } from '../../domain/entities/authenticated-user.js';
import { InternalApiError } from '../../shared/errors/app-error.js';
import { InternalApiClient } from '../http/internal-api-client.js';

function field<T extends string>(value: unknown, name: T): unknown {
  return typeof value === 'object' && value !== null && name in value
    ? Reflect.get(value, name)
    : undefined;
}

export class AuthServiceIdentityProvider implements IdentityProvider {
  constructor(
    private readonly client: InternalApiClient,
    private readonly authServiceUrl: string,
  ) {}

  async getCurrentUser(headers: IncomingHttpHeaders, requestId: string): Promise<AuthenticatedUser> {
    const response = await this.client.getJson(
      this.authServiceUrl,
      '/api/v1/auth/me',
      requestId,
      headers,
    );
    const data = field(response, 'data');
    const user = field(data, 'user');
    const id = field(user, '_id');
    const role = field(user, 'role');

    if (typeof id !== 'string' || typeof role !== 'string') {
      throw new InternalApiError(502, 'INVALID_DEPENDENCY_RESPONSE', 'Authentication service returned an invalid user');
    }

    return { id, role };
  }
}
