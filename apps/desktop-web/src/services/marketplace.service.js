/**
 * Marketplace Service — Typed client adapter for QuizFocus Marketplace endpoints
 * Conforms to contracts/marketplace-api.v1.json
 */

export class MarketplaceService {
  constructor(apiClient = null) {
    this.client = apiClient;
  }

  async getClient() {
    if (this.client) return this.client;
    try {
      const mod = await import('../api/axios');
      this.client = mod.default || mod;
      return this.client;
    } catch {
      return null;
    }
  }

  async fetchCatalog(query = {}, options = {}) {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.category && query.category !== 'All') params.set('category', query.category);
    if (query.tags) params.set('tags', query.tags);
    if (query.priceMin !== undefined) params.set('priceMin', String(query.priceMin));
    if (query.priceMax !== undefined) params.set('priceMax', String(query.priceMax));
    if (query.currency) params.set('currency', query.currency);
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortOrder) params.set('sortOrder', query.sortOrder);

    if (options.signal && options.signal.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }

    try {
      const client = await this.getClient();
      if (!client) {
        return {
          success: true,
          data: {
            items: [],
            pagination: { page: Number(query.page) || 1, limit: Number(query.limit) || 20, total: 0, totalPages: 1 },
          },
          queryString: params.toString(),
        };
      }
      const response = await client.get('/marketplace/catalog', {
        params,
        signal: options.signal,
      });
      return {
        ...response.data,
        queryString: params.toString(),
      };
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (error.response?.status === 404 || error.status === 404) {
        return {
          success: true,
          data: {
            items: [],
            pagination: { page: Number(query.page) || 1, limit: Number(query.limit) || 20, total: 0, totalPages: 1 },
          },
          isTransitional: true,
          message: error.response?.data?.message || 'Marketplace Catalog is preparing for launch.',
          queryString: params.toString(),
        };
      }
      throw this.normalizeError(error);
    }
  }

  async getListingDetails(listingId, options = {}) {
    if (options.signal && options.signal.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }
    const client = await this.getClient();
    if (!client) throw new Error('Client not configured');
    try {
      const response = await client.get(`/marketplace/listings/${listingId}`, {
        signal: options.signal,
      });
      return response.data;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async createOrder(orderPayload, options = {}) {
    if (options.signal && options.signal.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }
    const client = await this.getClient();
    if (!client) throw new Error('Client not configured');
    try {
      const response = await client.post('/marketplace/orders', orderPayload, {
        signal: options.signal,
        headers: options.headers,
      });
      return response.data;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async checkout(checkoutPayload, options = {}) {
    if (options.signal && options.signal.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }
    const client = await this.getClient();
    if (!client) throw new Error('Client not configured');
    try {
      const response = await client.post('/marketplace/checkout', checkoutPayload, {
        signal: options.signal,
        headers: options.headers,
      });
      return response.data;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getUserEntitlements(query = {}, options = {}) {
    if (options.signal && options.signal.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }
    const params = new URLSearchParams();
    if (query.status) params.set('status', query.status);
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));

    try {
      const client = await this.getClient();
      if (!client) {
        return {
          success: true,
          data: {
            entitlements: [],
            pagination: { page: Number(query.page) || 1, limit: Number(query.limit) || 20, total: 0, totalPages: 1 },
          },
        };
      }
      const response = await client.get('/marketplace/entitlements', {
        params,
        signal: options.signal,
      });
      return response.data;
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (error.response?.status === 404 || error.status === 404) {
        return {
          success: true,
          data: {
            entitlements: [],
            pagination: { page: Number(query.page) || 1, limit: Number(query.limit) || 20, total: 0, totalPages: 1 },
          },
          isTransitional: true,
        };
      }
      throw this.normalizeError(error);
    }
  }

  normalizeError(error) {
    if (error.name === 'AbortError') return error;
    if (error.status === 0 || error.code === 'ECONNREFUSED' || error.message?.includes('timeout')) {
      const netErr = new Error('Network timeout connecting to marketplace service');
      netErr.code = 'NETWORK_ERROR';
      netErr.status = 0;
      return netErr;
    }
    if (error.response?.status === 429 || error.status === 429) {
      const rlErr = new Error('Too Many Requests');
      rlErr.code = 'RATE_LIMITED';
      rlErr.status = 429;
      rlErr.retryAfter = Number(error.response?.headers?.['retry-after'] || error.retryAfter || 60);
      return rlErr;
    }
    if (error.response?.status === 500 || error.status === 500) {
      const srvErr = new Error('Internal Server Error');
      srvErr.code = 'SERVER_ERROR';
      srvErr.status = 500;
      return srvErr;
    }
    if (error.response?.status === 404 || error.status === 404) {
      const notFoundErr = new Error(error.response?.data?.message || 'Listing not found');
      notFoundErr.code = 'NOT_FOUND';
      notFoundErr.status = 404;
      return notFoundErr;
    }
    return error;
  }
}

export const marketplaceService = new MarketplaceService();
export default marketplaceService;
