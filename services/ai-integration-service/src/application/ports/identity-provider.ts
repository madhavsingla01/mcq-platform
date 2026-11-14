import type { IncomingHttpHeaders } from 'node:http';
import type { AuthenticatedUser } from '../../domain/entities/authenticated-user.js';

export interface IdentityProvider {
  getCurrentUser(headers: IncomingHttpHeaders, requestId: string): Promise<AuthenticatedUser>;
}
