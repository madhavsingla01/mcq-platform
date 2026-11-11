import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Helper validator matching architecture-contracts.test.mjs
function resolveContractRef(rootSchema, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported schema ref: ${ref}`);
  const parts = ref.slice(2).split('/');
  let curr = rootSchema;
  for (const part of parts) {
    if (!curr || typeof curr !== 'object' || !(part in curr)) {
      throw new Error(`Cannot resolve schema ref "${ref}" at part "${part}"`);
    }
    curr = curr[part];
  }
  return curr;
}

function validateContractSchema(schema, data, rootSchema = schema, path = '$') {
  if (schema.$ref) {
    return validateContractSchema(resolveContractRef(rootSchema, schema.$ref), data, rootSchema, path);
  }
  if (schema.allOf) {
    for (let i = 0; i < schema.allOf.length; i++) {
      const err = validateContractSchema(schema.allOf[i], data, rootSchema, `${path}.allOf[${i}]`);
      if (err) return err;
    }
  }
  if (schema.const !== undefined && data !== schema.const) {
    return `${path}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}`;
  }
  if (schema.enum && !schema.enum.includes(data)) {
    return `${path}: value ${JSON.stringify(data)} not in enum ${JSON.stringify(schema.enum)}`;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    const matches = types.some(t => {
      if (t === 'integer') return Number.isInteger(data);
      if (t === 'number') return typeof data === 'number' && !Number.isNaN(data);
      return actualType === t;
    });
    if (!matches) {
      return `${path}: expected type ${JSON.stringify(schema.type)}, got ${actualType}`;
    }
  }
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      return `${path}: value ${data} < minimum ${schema.minimum}`;
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      return `${path}: value ${data} > maximum ${schema.maximum}`;
    }
  }
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      return `${path}: length ${data.length} < minLength ${schema.minLength}`;
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      return `${path}: length ${data.length} > maxLength ${schema.maxLength}`;
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      return `${path}: string "${data}" does not match pattern ${schema.pattern}`;
    }
    if (schema.format === 'date-time' && isNaN(Date.parse(data))) {
      return `${path}: string "${data}" is not a valid date-time`;
    }
  }
  if (Array.isArray(data) && schema.items) {
    for (let i = 0; i < data.length; i++) {
      const err = validateContractSchema(schema.items, data[i], rootSchema, `${path}[${i}]`);
      if (err) return err;
    }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (schema.required) {
      for (const reqKey of schema.required) {
        if (!(reqKey in data) || data[reqKey] === undefined) {
          return `${path}: missing required property "${reqKey}"`;
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data && data[key] !== undefined) {
          const err = validateContractSchema(propSchema, data[key], rootSchema, `${path}.${key}`);
          if (err) return err;
        }
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(data)) {
        if (!allowed.has(key)) {
          return `${path}: unrecognized property "${key}" when additionalProperties is false`;
        }
      }
    }
  }
  return null;
}

const contract = JSON.parse(readFileSync(new URL('../contracts/marketplace-api.v1.json', import.meta.url), 'utf8'));
const eventsContract = JSON.parse(readFileSync(new URL('../contracts/marketplace-events.v1.json', import.meta.url), 'utf8'));

const baseValidCatalogItem = {
  listingId: '507f1f77bcf86cd799439011',
  quizId: '507f191e810c19729de860ea',
  title: 'Valid Quiz Listing',
  description: 'Detailed description of the quiz',
  sellerId: '507f1f77bcf86cd799439012',
  price: 29.99,
  currency: 'USD',
  licenseType: 'single_user',
  status: 'active',
  previewQuestionsCount: 3,
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z'
};

// --- Test Group 1: Price Schema Boundary Rejection ---
test('Empirical Challenge: Price validation boundaries (negative vs non-integer vs zero)', () => {
  // Negative prices MUST be rejected
  const negativeCases = [-0.01, -1, -49.99, -1000];
  for (const p of negativeCases) {
    const item = { ...baseValidCatalogItem, price: p };
    const err = validateContractSchema(contract.$defs.CatalogItem, item, contract);
    assert.ok(err, `Expected rejection for negative price ${p}, but passed`);
    assert.match(err, /minimum/, `Error message should reference minimum bound: ${err}`);
  }

  // Non-negative prices: zero and positive integers MUST pass
  const validIntegerCases = [0, 1, 10, 50, 999];
  for (const p of validIntegerCases) {
    const item = { ...baseValidCatalogItem, price: p };
    const err = validateContractSchema(contract.$defs.CatalogItem, item, contract);
    assert.equal(err, null, `Integer price ${p} should be valid: ${err}`);
  }

  // Non-integer prices (decimals): Does the schema reject them?
  // Schema has "type": "number", "minimum": 0
  const decimalCases = [0.01, 0.99, 19.95, 49.99, 199.99];
  for (const p of decimalCases) {
    const item = { ...baseValidCatalogItem, price: p };
    const err = validateContractSchema(contract.$defs.CatalogItem, item, contract);
    // Non-integer prices are ALLOWED by design because price is major-unit decimal (e.g. $49.99)
    assert.equal(err, null, `Decimal price ${p} should be accepted under type "number": ${err}`);
  }

  // Non-numeric prices MUST be rejected
  const nonNumericCases = ['49.99', 'free', true, null, undefined, {}, []];
  for (const p of nonNumericCases) {
    const item = { ...baseValidCatalogItem, price: p };
    const err = validateContractSchema(contract.$defs.CatalogItem, item, contract);
    assert.ok(err, `Expected rejection for non-numeric price ${JSON.stringify(p)}, but passed`);
  }
});

// --- Test Group 2: Idempotency-Key Boundary Rejection ---
test('Empirical Challenge: Idempotency-Key validation boundaries (missing, malformed, valid UUID)', () => {
  const schema = contract.$defs.IdempotentRequestHeaders;

  // 1. Missing header entirely
  assert.ok(validateContractSchema(schema, {}, contract), 'Missing header must be rejected');

  // 2. Empty string
  assert.ok(validateContractSchema(schema, { 'Idempotency-Key': '' }, contract), 'Empty key must be rejected');

  // 3. Short string (< 16 chars)
  assert.ok(validateContractSchema(schema, { 'Idempotency-Key': '123e4567' }, contract), 'Short key (<16) must be rejected');
  assert.ok(validateContractSchema(schema, { 'Idempotency-Key': '12345678-1234-1' }, contract), '15-char key must be rejected');

  // 4. Boundary exact: 16 chars
  assert.equal(validateContractSchema(schema, { 'Idempotency-Key': '12345678-1234-12' }, contract), null, '16-char hex key must pass');

  // 5. Boundary exact: 64 chars
  const key64 = 'a'.repeat(64);
  assert.equal(validateContractSchema(schema, { 'Idempotency-Key': key64 }, contract), null, '64-char key must pass');

  // 6. Over maximum (> 64 chars)
  const key65 = 'a'.repeat(65);
  assert.ok(validateContractSchema(schema, { 'Idempotency-Key': key65 }, contract), '65-char key must be rejected');

  // 7. Malformed characters (non-hex, non-hyphen)
  const malformedCases = [
    'not-a-valid-uuid-with-g-z',
    '123e4567-e89b-12d3-a456-42661417400g', // 'g' is non-hex
    '123e4567-e89b-12d3-a456-42661417400!', // '!' is non-hex
    '123e4567_e89b_12d3_a456_426614174000', // underscore instead of hyphen
    '123e4567 e89b 12d3 a456 426614174000'  // spaces
  ];
  for (const k of malformedCases) {
    const err = validateContractSchema(schema, { 'Idempotency-Key': k }, contract);
    assert.ok(err, `Key "${k}" contains invalid chars and must be rejected`);
  }

  // 8. Canonical UUIDv4
  const validUUIDv4 = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(validateContractSchema(schema, { 'Idempotency-Key': validUUIDv4 }, contract), null);

  // 9. Uppercase UUID
  const validUppercaseUUID = '123E4567-E89B-12D3-A456-426614174000';
  assert.equal(validateContractSchema(schema, { 'Idempotency-Key': validUppercaseUUID }, contract), null);
});

// --- Test Group 3: Zero Duplication Invariant & additionalProperties: false in CatalogItem ---
test('Empirical Challenge: CatalogItem rejects questions/choices/explanations and unauthorized properties', () => {
  const schema = contract.$defs.CatalogItem;

  // Assert schema explicitly configures additionalProperties: false
  assert.equal(schema.additionalProperties, false, 'CatalogItem MUST have additionalProperties: false');

  // 1. Inject questions array
  const withQuestions = {
    ...baseValidCatalogItem,
    questions: [
      { id: 'q1', text: 'Sample question?', options: ['A', 'B'], answer: 'A' }
    ]
  };
  const qErr = validateContractSchema(schema, withQuestions, contract);
  assert.ok(qErr, 'Must reject item containing duplicated questions');
  assert.match(qErr, /unrecognized property "questions"/);

  // 2. Inject choices / options
  const withChoices = { ...baseValidCatalogItem, choices: ['Choice 1', 'Choice 2'] };
  assert.ok(validateContractSchema(schema, withChoices, contract));

  const withOptions = { ...baseValidCatalogItem, options: [{ label: 'A', text: 'Option A' }] };
  assert.ok(validateContractSchema(schema, withOptions, contract));

  // 3. Inject explanations
  const withExplanations = { ...baseValidCatalogItem, explanations: { q1: 'Detailed rationale' } };
  assert.ok(validateContractSchema(schema, withExplanations, contract));

  // 4. Inject mediaAssets
  const withMedia = { ...baseValidCatalogItem, mediaAssets: ['https://cdn.example.com/audio.mp3'] };
  assert.ok(validateContractSchema(schema, withMedia, contract));

  // 5. Inject arbitrary unknown properties
  const withArbitrary = { ...baseValidCatalogItem, rogueField: 12345 };
  assert.ok(validateContractSchema(schema, withArbitrary, contract));
});

// --- Test Group 4: License Type Enumeration Rejection ---
test('Empirical Challenge: License type authorization boundary', () => {
  const schema = contract.$defs.CatalogItem;
  const authorizedLicenses = ['single_user', 'team', 'institutional', 'subscription'];

  // All authorized licenses must pass
  for (const lic of authorizedLicenses) {
    const item = { ...baseValidCatalogItem, licenseType: lic };
    assert.equal(validateContractSchema(schema, item, contract), null, `License "${lic}" should be authorized`);
  }

  // Unauthorized license types must be rejected
  const unauthorizedLicenses = [
    'commercial',
    'enterprise',
    'free',
    'unlimited',
    'single-user', // hyphen instead of underscore
    'perpetual',
    'open_source',
    'pirated',
    '',
    null,
    123
  ];
  for (const lic of unauthorizedLicenses) {
    const item = { ...baseValidCatalogItem, licenseType: lic };
    const err = validateContractSchema(schema, item, contract);
    assert.ok(err, `License type "${lic}" is unauthorized and must be rejected`);
  }
});

// --- Test Group 5: Asynchronous Events Contract Boundary Rejection ---
test('Empirical Challenge: Events contract envelope and data payload boundaries', () => {
  const validOrderEvent = {
    eventId: '123e4567-e89b-12d3-a456-426614174003',
    eventType: 'marketplace.order.completed.v1',
    version: '1.0.0',
    timestamp: '2026-11-10T11:10:00.000Z',
    producer: 'marketplace-service',
    data: {
      orderId: '507f1f77bcf86cd799439033',
      listingId: '507f1f77bcf86cd799439011',
      quizId: '507f191e810c19729de860ea',
      buyerId: '507f1f77bcf86cd799439044',
      sellerId: '507f1f77bcf86cd799439012',
      amount: 44.99,
      currency: 'USD',
      licenseType: 'single_user',
      idempotencyKey: 'idemp-key-order-12345678',
      transactionId: 'tx_stripe_999888',
      completedAt: '2026-11-10T11:10:00.000Z'
    }
  };

  const schema = eventsContract.events['marketplace.order.completed.v1'];
  assert.equal(validateContractSchema(schema, validOrderEvent, eventsContract), null);

  // 1. Rogue producer
  const badProducer = { ...validOrderEvent, producer: 'malicious-service' };
  assert.ok(validateContractSchema(schema, badProducer, eventsContract));

  // 2. Mismatched version
  const badVersion = { ...validOrderEvent, version: '2.0.0' };
  assert.ok(validateContractSchema(schema, badVersion, eventsContract));

  // 3. Malformed eventId (not 36-char UUID)
  const badEventId = { ...validOrderEvent, eventId: 'short-id' };
  assert.ok(validateContractSchema(schema, badEventId, eventsContract));

  // 4. Rogue fields in event data (additionalProperties: false)
  const rogueData = {
    ...validOrderEvent,
    data: {
      ...validOrderEvent.data,
      unauthorizedDataField: 'hack'
    }
  };
  assert.ok(validateContractSchema(schema, rogueData, eventsContract));
});

// --- Test Group 6: ADR-006 Section Structure & Security Controls ---
test('Empirical Challenge: ADR-006 completeness in standalone and digest records', () => {
  const standaloneRaw = readFileSync(new URL('../docs/adr/ADR-006-marketplace-architecture.md', import.meta.url), 'utf8');
  const digestRaw = readFileSync(new URL('../docs/enterprise-upgrade/19-architecture-decisions.md', import.meta.url), 'utf8');

  const requiredSections = [
    'Status',
    'Context and problem',
    'Alternatives',
    'Decision and reasons',
    'Consequences',
    'Migration',
    'Rollback'
  ];

  // Verify all 7 sections in standalone ADR
  for (const sec of requiredSections) {
    const heading = `## ${sec}`;
    assert.ok(standaloneRaw.includes(heading), `Standalone ADR missing section "${heading}"`);
  }

  // Verify all 7 sections in digest ADR
  for (const sec of requiredSections) {
    const boldSec = `**${sec}**`;
    assert.ok(digestRaw.includes(boldSec), `Digest ADR missing section "${boldSec}"`);
  }

  // Assert domain ownership boundaries
  assert.ok(standaloneRaw.includes('marketplace-service'), 'Must define marketplace-service');
  assert.ok(standaloneRaw.includes('5013'), 'Must designate port 5013');
  assert.ok(standaloneRaw.includes('quiz-service'), 'Must define quiz-service boundary');
  assert.ok(standaloneRaw.includes('attempt-service'), 'Must define attempt-service boundary');
  assert.ok(standaloneRaw.includes('Zero Duplication Invariant'), 'Must explicitly define Zero Duplication Invariant');

  // Assert security controls
  assert.ok(standaloneRaw.includes('Server-Side Authorization & JWT Claims Verification'), 'Must assert server-side JWT auth');
  assert.ok(standaloneRaw.includes('Creator Ownership Verification'), 'Must assert creator ownership verification');
  assert.ok(standaloneRaw.includes('Safe File & Media Access'), 'Must assert safe file & media access');
  assert.ok(standaloneRaw.includes('Immutable Audit Logging'), 'Must assert immutable audit logging');
  assert.ok(standaloneRaw.includes('Replay Protection via Client-Supplied `Idempotency-Key`'), 'Must assert replay protection with Idempotency-Key');
  assert.ok(standaloneRaw.includes('ENTITLEMENT_REQUIRED'), 'Must assert attempt entitlement gate code ENTITLEMENT_REQUIRED');
});
