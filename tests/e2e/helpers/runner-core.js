/**
 * QuizFocus E2E Test Runner Core Engine
 * Provides lightweight describe/test/expect harness with colored CLI reporting.
 */

class Expectation {
  constructor(actual, isNot = false) {
    this.actual = actual;
    this.isNot = isNot;
  }

  get not() {
    return new Expectation(this.actual, !this.isNot);
  }

  _evaluate(condition, message) {
    const passed = this.isNot ? !condition : Boolean(condition);
    if (!passed) {
      throw new Error(message);
    }
  }

  toBe(expected) {
    const pass = Object.is(this.actual, expected);
    this._evaluate(
      pass,
      `Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'NOT to be' : 'to be'} ${JSON.stringify(expected)}`
    );
  }

  toEqual(expected) {
    const pass = JSON.stringify(this.actual) === JSON.stringify(expected);
    this._evaluate(
      pass,
      `Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'NOT to equal' : 'to equal'} ${JSON.stringify(expected)}`
    );
  }

  toBeTruthy() {
    this._evaluate(
      Boolean(this.actual),
      `Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'NOT to be truthy' : 'to be truthy'}`
    );
  }

  toBeFalsy() {
    this._evaluate(
      !this.actual,
      `Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'NOT to be falsy' : 'to be falsy'}`
    );
  }

  toBeDefined() {
    this._evaluate(
      this.actual !== undefined,
      `Expected value ${this.isNot ? 'NOT to be defined' : 'to be defined'}, but got undefined`
    );
  }

  toBeUndefined() {
    this._evaluate(
      this.actual === undefined,
      `Expected value ${this.isNot ? 'NOT to be undefined' : 'to be undefined'}, but got ${JSON.stringify(this.actual)}`
    );
  }

  toBeNull() {
    this._evaluate(
      this.actual === null,
      `Expected value ${this.isNot ? 'NOT to be null' : 'to be null'}, but got ${JSON.stringify(this.actual)}`
    );
  }

  toBeGreaterThan(expected) {
    this._evaluate(
      this.actual > expected,
      `Expected ${this.actual} ${this.isNot ? 'NOT to be >' : 'to be >'} ${expected}`
    );
  }

  toBeGreaterThanOrEqual(expected) {
    this._evaluate(
      this.actual >= expected,
      `Expected ${this.actual} ${this.isNot ? 'NOT to be >=' : 'to be >='} ${expected}`
    );
  }

  toBeLessThan(expected) {
    this._evaluate(
      this.actual < expected,
      `Expected ${this.actual} ${this.isNot ? 'NOT to be <' : 'to be <'} ${expected}`
    );
  }

  toBeLessThanOrEqual(expected) {
    this._evaluate(
      this.actual <= expected,
      `Expected ${this.actual} ${this.isNot ? 'NOT to be <=' : 'to be <='} ${expected}`
    );
  }

  toContain(item) {
    let pass = false;
    if (typeof this.actual === 'string') {
      pass = this.actual.includes(item);
    } else if (Array.isArray(this.actual)) {
      pass = this.actual.some(x => JSON.stringify(x) === JSON.stringify(item) || x === item);
    } else if (this.actual && typeof this.actual === 'object') {
      pass = item in this.actual;
    }
    this._evaluate(
      pass,
      `Expected ${JSON.stringify(this.actual)} ${this.isNot ? 'NOT to contain' : 'to contain'} ${JSON.stringify(item)}`
    );
  }

  toMatch(regex) {
    const r = typeof regex === 'string' ? new RegExp(regex) : regex;
    const pass = r.test(String(this.actual));
    this._evaluate(
      pass,
      `Expected "${this.actual}" ${this.isNot ? 'NOT to match' : 'to match'} pattern ${regex}`
    );
  }

  toThrow(expectedError) {
    let threw = false;
    let thrownError = null;
    if (typeof this.actual !== 'function') {
      throw new Error(`Expected a function to test toThrow, got ${typeof this.actual}`);
    }
    try {
      this.actual();
    } catch (err) {
      threw = true;
      thrownError = err;
    }

    if (!threw) {
      this._evaluate(false, `Expected function to throw an error, but it did not throw`);
      return;
    }

    if (expectedError) {
      if (typeof expectedError === 'string') {
        this._evaluate(
          thrownError.message.includes(expectedError),
          `Expected thrown error message to contain "${expectedError}", got "${thrownError.message}"`
        );
      } else if (expectedError instanceof RegExp) {
        this._evaluate(
          expectedError.test(thrownError.message),
          `Expected thrown error message to match ${expectedError}, got "${thrownError.message}"`
        );
      }
    } else {
      this._evaluate(threw, `Expected function to throw`);
    }
  }
}

export function expect(actual) {
  return new Expectation(actual);
}

class TestContext {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.activeFilter = null;
  }

  describe(name, fn) {
    const parentSuite = this.currentSuite;
    const suite = {
      name,
      parent: parentSuite,
      tests: [],
      beforeHooks: [],
      afterHooks: [],
      suites: [],
    };

    if (parentSuite) {
      parentSuite.suites.push(suite);
    } else {
      this.suites.push(suite);
    }

    this.currentSuite = suite;
    try {
      fn();
    } finally {
      this.currentSuite = parentSuite;
    }
  }

  test(name, fn) {
    if (!this.currentSuite) {
      throw new Error(`test("${name}") must be placed inside a describe() block`);
    }
    this.currentSuite.tests.push({ name, fn, suite: this.currentSuite });
  }

  before(fn) {
    if (this.currentSuite) {
      this.currentSuite.beforeHooks.push(fn);
    }
  }

  after(fn) {
    if (this.currentSuite) {
      this.currentSuite.afterHooks.push(fn);
    }
  }
}

export const globalTestContext = new TestContext();
export const describe = (name, fn) => globalTestContext.describe(name, fn);
export const it = (name, fn) => globalTestContext.test(name, fn);
export const test = it;
export const before = (fn) => globalTestContext.before(fn);
export const after = (fn) => globalTestContext.after(fn);

export async function runSuite(suite, options = {}) {
  const { grep, verbose = false } = options;
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: [],
  };

  // Run suite before hooks
  for (const hook of suite.beforeHooks) {
    try {
      await hook();
    } catch (err) {
      console.error(`  [Before Hook Error in ${suite.name}]:`, err.message);
    }
  }

  // Run tests
  for (const t of suite.tests) {
    const fullName = `${suite.name} > ${t.name}`;
    if (grep && !fullName.toLowerCase().includes(grep.toLowerCase())) {
      results.skipped++;
      continue;
    }

    results.total++;
    const start = performance.now();
    try {
      await t.fn();
      results.passed++;
      const duration = (performance.now() - start).toFixed(1);
      if (verbose) {
        console.log(`    \x1b[32m✔\x1b[0m ${t.name} \x1b[90m(${duration}ms)\x1b[0m`);
      }
    } catch (err) {
      results.failed++;
      const duration = (performance.now() - start).toFixed(1);
      console.log(`    \x1b[31m✖\x1b[0m ${t.name} \x1b[90m(${duration}ms)\x1b[0m`);
      console.log(`      \x1b[31mError: ${err.message}\x1b[0m`);
      results.failures.push({
        suite: suite.name,
        test: t.name,
        error: err.message,
        stack: err.stack,
      });
    }
  }

  // Run nested suites
  for (const sub of suite.suites) {
    console.log(`  \x1b[1m\x1b[36m${sub.name}\x1b[0m`);
    const subResults = await runSuite(sub, options);
    results.total += subResults.total;
    results.passed += subResults.passed;
    results.failed += subResults.failed;
    results.skipped += subResults.skipped;
    results.failures.push(...subResults.failures);
  }

  // Run suite after hooks
  for (const hook of suite.afterHooks) {
    try {
      await hook();
    } catch (err) {
      console.error(`  [After Hook Error in ${suite.name}]:`, err.message);
    }
  }

  return results;
}
