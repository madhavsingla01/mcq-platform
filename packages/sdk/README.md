# QuizFocus TypeScript SDK

`@quizfocus/sdk` is an ESM client for the QuizFocus v1 draft REST API. It runs in Node.js 20.3 or newer and browser environments with Fetch and AbortSignal.any. Use a QuizFocus access token supplied by your application.

```ts
import { randomUUID } from 'node:crypto';
import { QuizFocusClient } from '@quizfocus/sdk';

const client = new QuizFocusClient({
  baseUrl: 'https://quizfocus.example',
  accessToken: () => {
    const token = process.env.QUIZFOCUS_ACCESS_TOKEN;
    if (!token) throw new Error('Set QUIZFOCUS_ACCESS_TOKEN');
    return token;
  },
});

const idempotencyKey = randomUUID();
const draft = await client.quizzes.createDraft({ title: 'Practice questions' }, { idempotencyKey });
const details = await client.drafts.get(draft.id);

for await (const page of client.drafts.pages({ kind: 'quiz', limit: 20 })) {
  console.log(page.drafts.map(item => item.title));
}
```

`quizzes` and `challenges` provide typed draft creation and listing. Use `drafts.get`, `drafts.update`, `drafts.list` and `drafts.pages` to manage either kind. A supplied questions array replaces the existing set. The integration API keeps created drafts private.

Pass `signal` to cancel a call or paginated iteration. The default timeout is 15 seconds per call, including token retrieval, response parsing and retries. The SDK retries transient network errors and HTTP 429, 502, 503 and 504 once by default. It honors Retry-After within the timeout and keeps a write's idempotency key and request body fixed. When the server returns IDEMPOTENCY_PENDING, check the draft before starting a new write. QuizFocusError exposes the error code, HTTP status, request ID and response details when available.

The SDK requires an HTTPS Gateway origin for deployed services. For local development, HTTP is accepted on localhost and the supported loopback addresses. Requests omit credentials such as cookies and use the configured bearer token only.

Run `npm run test:sdk` from the repository root. Run `npm pack --dry-run` inside this package to inspect the package contents. [npm pack documentation](https://docs.npmjs.com/cli/pack/)
