# QuizFocus remote integrations

## Remote MCP

Expose the Gateway over HTTPS. Set `MCP_PUBLIC_ORIGIN` to that canonical origin. The MCP resource is that origin followed by `/api/v1/ai/mcp`. Its metadata is published at `/.well-known/oauth-protected-resource/api/v1/ai/mcp` and advertised in the authentication challenge. [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

Configure an external authorization server that supports OAuth authorization code flow with PKCE S256, resource indicators, revocation, and authorization server discovery. Deployments should require user consent for `quizfocus:read` and `quizfocus:write`. Read covers listing, retrieval and validation. Write covers creating private drafts and appending questions. Configure the account binding through an administrator-controlled `quizfocus_user_id` claim. Its value must be the QuizFocus account ObjectId. A user-editable profile field is unsuitable for this mapping.

Set `MCP_OAUTH_ISSUER`, `MCP_OAUTH_INTROSPECTION_URL`, `MCP_OAUTH_INTROSPECTION_CLIENT_ID` and `MCP_OAUTH_INTROSPECTION_CLIENT_SECRET`. The introspection response must include `active`, `iss`, `aud`, `exp`, `scope` and `quizfocus_user_id`. The audience must include the exact MCP resource URI. Revoking a credential at the authorization server affects the next request. Share a separate random `INTEGRATION_DELEGATION_SECRET` of at least 32 bytes only among AI Integration, Quiz Core and Challenge Service. The original OAuth access token goes only to the configured introspection endpoint. Core receives an expiring request-bound credential for an allowlist of private authoring operations and still checks the local account and ownership.

- In ChatGPT, create an MCP connection using the public URL. Configure the authorization server for the registration method and exact redirect URI shown for that connection. If using the stable callback, enable issuer identification and return the matching issuer in callbacks. [ChatGPT OAuth requirements](https://developers.openai.com/plugins/build/auth)
- In Claude, add a custom remote connector with the same URL. Configure published client identity, automatic registration, or a preregistered client according to the authorization server. Claude documents the callback for preregistered clients. [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
- In Cursor, use the public URL as a remote MCP entry in `mcp.json`. Add its static OAuth configuration if using a preregistered client. Register the specific desktop or web callback for the intended surface. [Cursor MCP configuration](https://cursor.com/docs/mcp)

These clients require a deployed HTTPS Gateway and a configured authorization server. Automated tests exercise discovery, tool execution, scope enforcement, audience validation and revocation with a fixture. Real hosted-client sign-in and issuer-specific setup require deployment verification. Existing media attachments still require first-party draft authorization for media validation.

## Webhooks

Set `INTEGRATION_WEBHOOK_ORIGINS` to approved HTTPS receiver origins and `INTEGRATION_WEBHOOK_SECRET` to a separate random secret of at least 32 bytes. The service encrypts destination URLs at rest. Rotate by provisioning a new secret and recreating the subscriptions so receivers receive new signing credentials.

Use the QuizFocus bearer token to POST `{"url":"https://example.com/inbound","events":["draft.created","draft.updated","import.completed"]}` to `/api/v1/ai/webhooks`. Save the returned signing secret. List subscriptions with GET, disable with DELETE `/api/v1/ai/webhooks/{id}`, and inspect retries with GET `/api/v1/ai/webhooks/{id}/deliveries`. Use the inbound webhook URL from n8n, Zapier or Make as the destination after adding its origin to the allowlist. A receiver that cannot verify the raw body and headers needs an intermediary verifier.

Each request contains `Webhook-Id`, `Webhook-Timestamp`, and `Webhook-Signature`. Verify the timestamp is within five minutes, compute HMAC-SHA256 over `id.timestamp.rawBody` using the subscription secret, and compare to the hex value following `v1=` in constant time. Deduplicate by delivery ID before applying side effects. Respond with a 2xx only after accepting responsibility for processing. The worker retries network errors, 408, 429 and 5xx up to six total attempts. The same delivery ID survives retries. Audit records omit destination secrets and expire after 30 days. Delivery is at least once. Events are scoped to writes through the integration API and its MCP tools.

The replay result and its webhook event are stored atomically in AI Integration. If the service stops after Quiz Core commits but before the replay result is stored, the same key returns an unknown outcome for the replay retention period. Check the draft in Manual Builder before retrying an unknown write with a new key.

## Imports and generation

Use `POST /api/v1/ai/imports` with a QuizFocus bearer token and an `Idempotency-Key`. For canonical JSON, send `{"format":"quizfocus.quiz.v1","draft":{...}}` with the existing draft fields and at least one question. Media references must already belong to the caller and pass existing Quiz Core validation. For CSV and Excel, use QuizFocus upload, parse and map first, then send `{"format":"mapped-upload","uploadId":"...","title":"..."}`. The integration reuses the mapped question reader in Quiz Core. PDF content extracted by the existing PDF workflow can be supplied as canonical JSON. The integration accepts mapped PDF data where the parser provides question columns.

Use `POST /api/v1/ai/generation` with `{"title":"Practice quiz","topic":"Prime numbers","count":5}`. Configure `INTEGRATION_GENERATION_URL` and `INTEGRATION_GENERATION_TOKEN` for a trusted HTTPS provider. It receives the request plus `schema: "quizfocus.mcq-generation.v1"` and returns `{"questions":[{"prompt":"...","choices":["...","..."],"correctIndex":0,"explanation":"..."}]}`. The authoring service checks count, format, answer indexes and duplicates before saving the draft. `INTEGRATION_GENERATION_DAILY_LIMIT` defaults to 10 requests per account. Retries of a completed request reuse the saved response. Open the resulting draft in Manual Builder to review its content before publishing.

## Verification

Run `npm --prefix services/ai-integration-service test`, `npm run test:integration:drafts`, `npm run test:integration:mcp` and `npm run test:integration:desktop-updates`. The integration suites use disposable MongoDB and the local Gateway. The receiver failure test injects delivery outcomes and verifies durable retry state.

Before deployment, test sign-in and revocation against the selected authorization server, send a signed event through the actual receiver, and verify provider configuration with non-sensitive quiz material. The Gateway and service budgets apply per process. Production multi-instance load and recovery verification remain separate from the local checks.
