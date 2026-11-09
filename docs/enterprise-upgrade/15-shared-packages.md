# Shared packages and dependency direction

There is currently no legitimate shared backend runtime package. Root `package.json` orchestrates separate packages. Copied model/services folders are duplication, not shared libraries. The mobile manifest's `mcq-platform-root` file dependency does not establish an architectural domain package.

Step 02 adds a small protocol artifact, [HTTP error v1 JSON Schema](../../contracts/http-error.v1.schema.json), and keeps the gateway implementation in its own `src/contracts.js`. The desktop's existing Axios layer uses `api/errorContract.js` as a compatibility adapter. It does not import gateway implementation or backend models. Contract tests cross-check the executable envelopes with both legacy and structured client parsing.

| Candidate | Appropriate contents | Explicit exclusions | Adoption condition |
|---|---|---|---|
| HTTP contract package | Error schema/types, request-ID syntax, transport-only validation | Express app, DB connection, model classes, content/privacy rules | At least two runtime consumers need the same stable contract and packaging is validated |
| Observability interface | Safe structured metadata and correlation interface | User content, tokens, unbounded request dumps | Logging ownership and redaction tests in Step 16 |
| Auth verifier primitives | Signature/audience/issuer checks, key-provider interface | Service-specific roles/object rules, mutable User model | Step 03 threat model and key migration |
| Test helpers | Disposable fixture setup, gateway HTTP client, source evidence tooling | Production credentials, shared hard-coded account | Existing `tests/e2e/helpers` and isolated harness already used |

No workspace manager, DI container, generic repository, shared Mongo connection, broker or extra framework was added. Moving a file above the existing per-service Docker context would require a packaging change. Avoid that deployment cost solely to share a few lines. A future package needs versioned exports, compatibility tests, a lockfile/install strategy and container build verification before adoption.

Allowed dependency direction is frontend → public protocol → gateway → domain API. A domain may depend on transport contracts and its own domain/application/infrastructure modules. It must not import another service's controller, model or private repository. Quiz's new relay is a transport adapter; Attempt's identifier resolver and finalization worker remain within Attempt. Questions are still read through existing schema projections until the owner metadata contract has parity coverage.
