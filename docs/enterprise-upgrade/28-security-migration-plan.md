# Security migration and rollback

MongoDB remains the database. There is no required collection creation, bulk backfill, index change or user re-registration. Keep the original session field and user identifiers. Each successful rotation or sign-in stores a digest in `users.refreshToken`. A previously valid raw token is accepted until replacement. Legacy access tokens without a version work only for accounts at version zero.

1. Confirm the access and refresh signing keys are distinct and valid on Auth. Keep the configured access key consistent on all access-token consumers.
2. Verify exact gateway and service allowed origins. With the current Compose topology, Auth trusts one gateway hop. Direct-access deployments should leave `AUTH_TRUST_PROXY_HOPS` at zero and protect ingress. Ensure user traffic cannot reach internal service ports in production.
3. Roll out updated Auth replicas together. Older Auth builds do not understand the digest stored by a newer replica. Deploy verifiers across domains and deploy the desktop build with cache revalidation for HTML and immutable caching for fingerprinted assets.
4. Smoke-test username login, bootstrap, refresh concurrency, logout, challenge deadline behavior, private clips and socket reconnection in staging. Compare 401, 403, 429 and refresh failure rates with baseline. Monitor for browser cookie rejection and unusual audit event rates.
5. If Auth must roll back to a pre-digest build, users who rotated on the new build will need to sign in again when their access cookie expires. Digests cannot restore the original refresh credential. Preserve account records and current versions.
6. Verify global administrator and delegated memberships with the updated Admin service. Records created by the old auto-bootstrap or `make-admin` script remain in MongoDB. Their copied `super_admin` grant requires the current global role. Explicit delegated grants continue to work. A real role change requires the affected user to sign in again.

An already-open desktop tab from before the recovery handler was shipped needs a reload. Updated tabs can recover once per build if a new deployment removes their referenced lazy chunks. [Vite load-error handling](https://vite.dev/guide/build#load-error-handling)
