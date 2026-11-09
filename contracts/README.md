# Public transport contracts

`http-error.v1.schema.json` describes additive gateway-generated errors. Existing `success`, `message`, `data` and request correlation remain. Domain service errors currently keep their original envelopes. Consumers must accept both during incremental adoption.

The gateway's implementation lives in its service. The desktop's Axios compatibility adapter keeps existing error objects intact and adds normalized metadata. No service imports another service's private implementation. See [gateway](../docs/enterprise-upgrade/12-api-gateway-architecture.md), [communication](../docs/enterprise-upgrade/13-service-communication.md) and [contract tests](../tests/architecture-contracts.test.mjs).

This directory is a protocol-artifact collection, not an installed shared runtime package. Publish/version a runtime package only after deployment packaging and real multi-consumer requirements are established.
