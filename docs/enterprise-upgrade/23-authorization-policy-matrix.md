# Authorization policy matrix

Authentication establishes the account. The owning service then checks the requested object. A valid session or knowledge of an ID alone does not establish access.

| Resource or action | Guest | Authenticated user | Owner or member | Admin |
|---|---|---|---|---|
| Quiz detail, questions and public discovery | Public and eligible direct-link quiz reads, subject to field redaction | Same for other creators' quizzes | Own private quiz and draft, including authoring data on permitted routes | Current moderation exceptions |
| Quiz and draft edit/delete | Denied | Denied for another creator's quiz | Creator within lifecycle rules | Existing Quiz management exceptions |
| Import | Existing guest import uses its session and smaller limit | Own uploads | Import owner can consume eligible upload | No general cross-owner import entitlement verified |
| Attempt and result | Own eligible guest session | Own account attempt | Uploader review as supported after challenge deadline, subject to review restrictions | No general override on participant attempt routes |
| Challenge definition and participation | Eligible public definitions | Public challenge entry within state, deadline and one-attempt rules | Creator practice remains separate from ranked attempts | Existing moderation and private read exceptions |
| Challenge results before deadline | Participant count where supported | Own progress and receipt | Authored content for editing. Other participants' attempts and scores stay sealed | User-facing result routes observe the same seal |
| Challenge results after deadline | Public standings for eligible public challenges | Same public standings plus permitted own review | Quiz analytics and authorized uploader review resume | Existing moderation permissions |
| Profile, follows and interactions | Public profile projections only | Account settings and interactions allowed by visibility policy | Own private account data and settings | Account moderation with role permission |
| Conversations, messages and receipts | Denied | Must join as a participant and satisfy recipient policy to send | Conversation membership, message ownership and receipt preferences govern actions | No admin bypass in chat routes |
| Notifications | Denied | Own notifications only | Private quiz details require current creator access. Inaccessible quiz and comment details are redacted | No cross-recipient feed override |
| Clips, captions and alternative tracks | Eligible quiz or guest attempt context | Authorized quiz, attempt or review context | Owner manages clips and generated assets | Current media policy applies |
| Image management | Denied | Active authenticated session | Owner lists, uploads and deletes own assets | Public image reads remain a separate legacy contract |
| Admin users, content, reports and audit | Health and existing report policy only | Denied for privileged operations | No implied role from resource ownership | Current account role, active membership and relevant route permission |
| Change global administrator role | Denied | Denied | Delegated memberships do not grant platform role changes | Current global administrator only. Role changes revoke the target account's earlier sessions |
| Restore a suspended global administrator | Denied | Denied | Delegated suspension permission applies to regular accounts | Current global administrator only |
| Audit and report data embedded in Admin responses | Denied | Denied | Delegated access requires the same audit or report permission as the corresponding dedicated API | Included with the applicable permission |

Invite-only challenges retain their current restrictive behavior. A delegated invitation and entitlement model requires explicit product and data design. [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
