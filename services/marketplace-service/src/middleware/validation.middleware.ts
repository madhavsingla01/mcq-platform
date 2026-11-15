/**
 * Request validation middleware.
 * Lightweight schema-based validation for request bodies and params.
 */

import type { RequestHandler } from 'express';
import { AppError } from './error.middleware.js';

/**
 * Validate request body against a schema.
 * Schema format: { fieldName: { required: bool, type: string, min: number, max: number, pattern: RegExp, email: bool } }
 * @param {Object} schema - Validation schema
 */
interface FieldRules {
  required?: boolean;
  type?: string;
  min?: number;
  max?: number;
  pattern?: RegExp;
  email?: boolean;
}

export const validateBody = (schema: Readonly<Record<string, FieldRules>>):
  RequestHandler<Record<string, string>, unknown, unknown> => {
  return (req, res, next) => {
    const errors = [];

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return next(new AppError('Validation failed', 400, ['Request body must be a JSON object']));
    }

    for (const [field, rules] of Object.entries(schema)) {
      const value: unknown = Object.hasOwn(body, field) ? Reflect.get(body, field) : undefined;

      // Required check
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      // Type check
      if (rules.type && typeof value !== rules.type) {
        errors.push(`${field} must be of type ${rules.type}`);
        continue;
      }

      // String validations
      if (typeof value === 'string') {
        if (rules.min !== undefined && value.length < rules.min) {
          errors.push(`${field} must be at least ${rules.min} characters`);
        }
        if (rules.max !== undefined && value.length > rules.max) {
          errors.push(`${field} must be at most ${rules.max} characters`);
        }
        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`${field} format is invalid`);
        }
      }

      // Email validation
      if (rules.email && (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
        errors.push(`${field} must be a valid email address`);
      }
    }

    if (errors.length > 0) {
      return next(new AppError('Validation failed', 400, errors));
    }

    next();
  };
};

/**
 * Validate that a parameter is a valid 24-character hexadecimal MongoDB ObjectId.
 * @param {string} paramName - Name of parameter in req.params
 */
export const validateObjectId = (paramName = 'id'): RequestHandler => {
  return (req, res, next) => {
    const id = req.params?.[paramName];
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return next(new AppError(`Invalid ${paramName}`, 400));
    }
    next();
  };
};

export default { validateBody, validateObjectId };
