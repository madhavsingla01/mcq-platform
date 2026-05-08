/**
 * Redis configuration stub.
 * Future-ready — will be connected when Redis is integrated.
 */

import { logger } from '../utils/logger.js';

let redisClient = null;

export const connectRedis = async () => {
  logger.info('Redis: stub — not connected (future integration)');
  return null;
};

export const getRedisClient = () => redisClient;

export default { connectRedis, getRedisClient };
