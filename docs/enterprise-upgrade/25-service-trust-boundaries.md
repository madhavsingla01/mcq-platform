# Service trust boundaries

The gateway is the browser entry point. Its forwarded identity headers are discarded and account identity comes from verified tokens downstream. The gateway replaces forwarded client IP with the result of its configured trusted-hop policy. Auth defaults to the direct peer for abuse controls. Set `AUTH_TRUST_PROXY_HOPS=1` only when all traffic must pass through the trusted gateway. Set `TRUST_PROXY_HOPS` on the gateway to match the actual ingress chain.

| Flow | Current control | Deployment condition or gap |
|---|---|---|
| Browser to gateway | Origin allowlist, cookie attributes, CSRF pair on protected writes and bounded route proxying | Use HTTPS in production and verify exact deployed origins, including any desktop hosting aliases |
| Gateway to service | Each service verifies user tokens and enforces domain policy | Private networking remains necessary. Some domain health routes or service adapters are reachable directly in development |
| Identity to domains | Shared signing key and current account record or read projection | Credential or key access can span services. Scoped MongoDB roles and a narrower issuer boundary are follow-up work |
| Service to service | Existing bounded relays forward user credentials as needed | No new service mesh or identity provider. See [service communication](13-service-communication.md) for ownership and relay details |
| Socket.IO | Origin and token checks at handshake, participant joins, per-event checks and periodic idle revalidation | Passive delivery can continue until the next check. State and checks are local to a Message instance |
| Media storage | Clip grant and range authorization, asset owner checks for writes | Public legacy images and parser file paths need a storage and privacy review |

Authentication audit events use the event name, outcome, time, an optional actor ID and a validated request ID. Existing Admin audit logs cover privileged changes. Central audit retention, alerting and comprehensive production log review remain open. [OWASP CSRF Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
