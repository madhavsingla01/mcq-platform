# AI Integration Service

The AI Integration Service is a TypeScript/Node.js boundary for future AI-backed features. It deliberately contains no provider SDKs, model calls, prompts, or AI connectors.

## Architecture

The source is divided by Clean Architecture responsibility:

- `domain/` — authenticated-user domain type
- `application/ports/` and `application/use-cases/` — identity boundary and application operation
- `infrastructure/` — bounded HTTP client and Auth Service adapter
- `presentation/http/` — Express routes, controllers, request context, authentication, and error handling
- `config/`, `shared/` — validated runtime config, structured logging, and shared errors

## Authentication and routes

- `GET /api/v1/health` and `GET /api/v1/livez` are public probes.
- `GET /api/v1/ai/status` is authenticated and reports that connectors are not configured.
- The service sends the caller's access cookie or bearer token directly to `AUTH_SERVICE_URL/api/v1/auth/me`. This reuses Auth Service checks for token validity, account state, and revoked sessions rather than trusting identity headers or duplicating JWT/session policy.
- The internal HTTP client forwards only authentication/session headers and the validated request ID; it enforces a timeout and returns controlled dependency errors.
- The API Gateway exposes `/api/v1/ai/*`, forwards the authorization headers through its normal sanitization path, and includes the service in readiness monitoring.

## Local development

Copy `.env.example` to `.env`, then configure `AUTH_SERVICE_URL` and `CLIENT_URL`. Start the service with:

```powershell
npm install
npm run dev
```

Port `5014` is used by default. The `dev` script compiles TypeScript to `dist/` before starting Node.js, which keeps the service compatible with the project's Node 20 runtime.

## Checks

```powershell
npm test
npm run build
```

`npm test` builds with strict TypeScript settings and runs HTTP, auth-boundary, error, and internal-client tests. CI installs this package and runs it with the other service suites.
