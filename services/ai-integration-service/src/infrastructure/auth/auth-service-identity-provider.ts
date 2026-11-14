import type { IncomingHttpHeaders } from 'node:http';
import type { IdentityProvider } from '../../application/ports/identity-provider.js';
import type { AuthenticatedUser } from '../../domain/entities/authenticated-user.js';
import { InternalApiError } from '../../shared/errors/app-error.js';
import { InternalApiClient } from '../http/internal-api-client.js';

interface CurrentUserResponse {
  data?: {
    user?: {
      _id?: unknown;
      role?: unknown;
    };
  };
}

export class AuthServiceIdentityProvider implements IdentityProvider {
  constructor(
    private readonly client: InternalApiClient,
    private readonly authServiceUrl: string,
  ) {}

  async getCurrentUser(headers: IncomingHttpHeaders, requestId: string): Promise<AuthenticatedUser> {
    const response = await this.client.getJson<CurrentUserResponse>(
      this.authServiceUrl,
      '/api/v1/auth/me',
      requestId,
      headers,
    );
    const user = response?.data?.user;

    if (typeof user?._id !== 'string' || typeof user.role !== 'string') {
      throw new InternalApiError(502, 'INVALID_DEPENDENCY_RESPONSE', 'Authentication service returned an invalid user');
    }

    return { id: user._id, role: user.role };
  }
}
