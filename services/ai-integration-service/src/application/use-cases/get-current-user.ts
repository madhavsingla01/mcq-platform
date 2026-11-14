import type { IncomingHttpHeaders } from 'node:http';
import type { IdentityProvider } from '../ports/identity-provider.js';
import type { AuthenticatedUser } from '../../domain/entities/authenticated-user.js';

export class GetCurrentUser {
  constructor(private readonly identityProvider: IdentityProvider) {}

  execute(headers: IncomingHttpHeaders, requestId: string): Promise<AuthenticatedUser> {
    return this.identityProvider.getCurrentUser(headers, requestId);
  }
}
