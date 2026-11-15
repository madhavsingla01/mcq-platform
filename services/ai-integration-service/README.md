# AI Integration Service

The AI Integration Service exposes QuizFocus authoring to API and MCP clients. An optional generation adapter calls an operator-configured service using a provider-independent JSON contract.

## Architecture

The source is divided by Clean Architecture responsibility:

- `domain/` — authenticated-user domain type
- `application/ports/` and `application/use-cases/` — identity boundary and application operation
- `infrastructure/` — bounded HTTP client and Auth Service adapter
- `presentation/http/`, `presentation/mcp/` — Express routes, Streamable HTTP transport, and MCP tools
- `config/`, `shared/` — validated runtime config, structured logging, and shared errors

## Authentication and routes

- `GET /api/v1/health` and `GET /api/v1/livez` are public probes.
- `GET /api/v1/ai/status` is authenticated and reports that connectors are not configured.
- The service sends the caller's access cookie or bearer token directly to `AUTH_SERVICE_URL/api/v1/auth/me`. This reuses Auth Service checks for token validity, account state, and revoked sessions rather than trusting identity headers or duplicating JWT/session policy.
- The internal HTTP client forwards only authentication/session headers and the validated request ID; it enforces a timeout and returns controlled dependency errors.
- The API Gateway exposes `/api/v1/ai/*`, forwards the authorization headers through its normal sanitization path, and includes the service in readiness monitoring.

## Implementation status

| Phase | Status | Scope |
| --- | --- | --- |
| Service foundation | Implemented | TypeScript service and Gateway routing, public liveness, Auth Service integration, bounded credential forwarding, configuration, logging and errors. |
| Versioned draft REST API | Implemented | Private drafts, ownership checks, Zod validation, rate limits, MongoDB idempotency, OpenAPI and Gateway integration tests. |
| MCP over Streamable HTTP | Implemented | Official SDK, user-scoped authoring tools, structured responses, and live Gateway integration tests. |
| TypeScript SDK | Implemented | [SDK](../../packages/sdk/README.md) with typed draft clients, bearer authentication, pagination, cancellation, timeouts, structured errors and retries. |
| Remote MCP OAuth | Available with an external authorization server | Protected resource metadata, token introspection, narrow scopes, and revocation checks on every request. |
| Webhooks | Available with approved receiver origins | Signed events from integration writes, durable retries and owner-scoped delivery history. |
| Import and generation | Available | Canonical JSON and mapped file imports. Structured MCQ generation requires a configured provider. |

## Draft REST API

Use the API Gateway and send Authorization: Bearer YOUR_ACCESS_TOKEN. Draft operations use explicit bearer authentication. The authenticated status endpoint also supports the session cookie.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | /api/v1/ai/drafts | Lists your drafts with page, limit, kind and search filters. |
| GET | /api/v1/ai/drafts/{id} | Returns your draft, questions, choices and the authored answer key. |
| POST | /api/v1/ai/drafts | Creates a private quiz or challenge draft. |
| PATCH | /api/v1/ai/drafts/{id} | Updates supplied fields. A supplied questions array replaces the question set. |

Create requests require a kind of quiz or challenge and a title. Questions and challenge scheduling can be added later. Quiz Core owns quiz persistence and media validation, and Challenge Service owns contest draft authoring. Only the owner can retrieve or modify the draft, and publication uses the existing authoring workflow. The [OpenAPI specification](openapi.json) describes the schemas and errors. Run npm run openapi to regenerate it from the Zod contracts.

POST and PATCH require an Idempotency-Key of 8 to 128 characters using letters, digits, period, hyphen or underscore. MongoDB retains successful response summaries for 24 hours and scopes keys to an account. Retrying an identical request returns its recorded success. A different request with the same key returns 409. If an upstream response is lost, 409 IDEMPOTENCY_PENDING prevents a second write with that key. Query your draft list or details to reconcile an unknown outcome. The app applies separate read and write limits per account, per running service instance. The default budgets are 120 reads and 30 writes per minute.

The health probes report process liveness. The authenticated status route separately reports Auth Service failures.

## MCP clients

Set your client's Streamable HTTP endpoint to `http://127.0.0.1:5000/api/v1/ai/mcp` locally, or use your deployed Gateway's HTTPS URL. With OAuth disabled, use `Authorization: Bearer <QuizFocus access token>` through your client's secret settings. Auth Service checks each request. With OAuth enabled, the MCP route expects an access token from the configured authorization server. Session cookies cannot authenticate MCP requests in either mode. [Remote deployment and client setup](remote-integrations.md)

The endpoint uses the [official TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server) in stateless [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) JSON mode. POST requests must accept both `application/json` and `text/event-stream`, with one JSON-RPC message per request and a 64 KB body limit. GET and DELETE return 405 for authenticated callers. Browser requests with an Origin must match `CLIENT_URL`.

| Tool | What it can access |
| --- | --- |
| `create_quiz_draft`, `create_challenge_draft` | Create private, unpublished drafts as the signed-in user. |
| `list_quizzes`, `get_quiz` | List or retrieve metadata for published standard quizzes owned by the caller. These tools do not return questions or answers. |
| `list_drafts`, `get_draft` | List or retrieve the caller's drafts. Draft detail includes authoring data such as expected answers. |
| `add_questions` | Append 1–10 questions to an owned draft while preserving existing questions. Existing quiz and challenge limits still apply. |
| `validate_draft` | Run the owning service's publication checks and report readiness or the next blocking issue without publishing. |

Discover exact input and output schemas with `tools/list`. Write tools require an `idempotencyKey` with the same rules and retention as REST. MCP and REST share the per-account budgets and replay store, including for draft creation. Successful tool results return `structuredContent.result` containing `ok: true` and `data`; application failures set `isError` and return `ok: false`, an error code and message, and a request ID. Protocol and argument validation failures use the SDK's MCP errors. No tool publishes a draft.

## Local development

Copy `.env.example` to `.env`, then configure `AUTH_SERVICE_URL`, `QUIZ_SERVICE_URL`, `CHALLENGE_SERVICE_URL`, `AI_INTEGRATION_MONGO_URI`, and `CLIENT_URL`. Start the service with:

```powershell
npm install
npm run dev
```

Port `5014` is used by default. The `dev` script compiles TypeScript to `dist/` before starting Node.js, which keeps the service compatible with the project's Node 20 runtime.

## Checks

```powershell
npm test
npm run build
npm run openapi
```

`npm test` builds with strict TypeScript settings and runs HTTP, auth-boundary, error, and internal-client tests. CI installs this package and runs it with the other service suites. The Gateway proxy test checks the authorization and request ID headers. The isolated identity integration suite checks guest denial and authenticated status through the real Gateway and Auth Service.

From the repository root, run `npm run test:integration:drafts` for REST or `npm run test:integration:mcp` for protocol negotiation, official SDK discovery, and authenticated tool calls through the live Gateway. Both start an isolated local MongoDB. Set `MONGOD_BINARY` if MongoDB is outside PATH.
