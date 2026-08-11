## ADDED Requirements

### Requirement: Role-based access for group management
Only `admin` and `reparto_admin` SHALL be able to create groups, delete groups, remove members, or rotate a group's access token. `reparto_invitado` SHALL have read-only access to the list of all groups. `familia` and `invitado` SHALL have no access.

#### Scenario: Non-privileged Keycloak user denied
- **WHEN** a user without `admin`/`reparto_admin`/`reparto_invitado` calls any `/reparto/api/*` management route with a Keycloak JWT
- **THEN** the backend responds with HTTP 403

#### Scenario: reparto_invitado cannot mutate
- **WHEN** a user with only `reparto_invitado` calls `POST /reparto/api/groups` or any group-deleting/member-removing route
- **THEN** the backend responds with HTTP 403

#### Scenario: App hidden from unauthorized roles
- **WHEN** a `familia` or `invitado` user opens the AppLauncher
- **THEN** the `reparto` entry is not listed

### Requirement: Account-less group members
Group members SHALL be identifiable by a free-text name and SHALL NOT require a Keycloak account.

#### Scenario: Member added without account
- **WHEN** the group manager or a member with group-link access calls `POST /reparto/api/groups/:id/members` with only a `name`
- **THEN** a `group_member` row is created with `keycloak_user_id` null

### Requirement: Shareable group access link
Each group SHALL have an opaque `access_token`. Anyone possessing the token SHALL be able to view and manage that group's members and expenses without a Keycloak login, but SHALL NOT be able to delete the group or remove members.

#### Scenario: Valid token grants group session
- **WHEN** a client calls `POST /reparto/api/groups/by-token` with a valid `access_token`
- **THEN** the backend returns a short-lived group session token scoped to that `group_id`

#### Scenario: Group-token session cannot delete the group
- **WHEN** a request authenticated only via a valid group session token (no Keycloak JWT) calls `DELETE /reparto/api/groups/:id`
- **THEN** the backend responds with HTTP 401 (unauthenticated for this Keycloak-only route), consistent with `authMiddleware`'s behavior on every other manager-only route in this monorepo (e.g. `paraisos`) — a valid-but-wrong-role Keycloak JWT would instead get HTTP 403

#### Scenario: Invalid token rejected
- **WHEN** a client calls `POST /reparto/api/groups/by-token` with a token that does not match any active group
- **THEN** the backend responds with HTTP 404 and issues no session token

#### Scenario: Manager rotates the link
- **WHEN** the group manager calls `POST /reparto/api/groups/:id/rotate-token`
- **THEN** the previous `access_token` no longer resolves to the group, and a new token is returned

### Requirement: Combined authorization for group-scoped routes
Expense, member, balance, and settlement routes under `/reparto/api/groups/:id/*` SHALL accept either a valid Keycloak JWT with an authorized role, or a valid group session token matching that `:id`.

#### Scenario: Keycloak manager accesses expenses
- **WHEN** an `admin`/`reparto_admin` user with a valid JWT calls `GET /reparto/api/groups/:id/expenses`
- **THEN** the backend returns the group's expenses

#### Scenario: Group-link member accesses expenses
- **WHEN** a client holding a valid group session token for `:id` calls `GET /reparto/api/groups/:id/expenses`
- **THEN** the backend returns the group's expenses

#### Scenario: Token for a different group rejected
- **WHEN** a client holding a valid group session token for group A calls a route scoped to group B's `:id`
- **THEN** the backend responds with HTTP 403

### Requirement: Expense split — equal
An expense with `split_type='equal'` SHALL divide `amount` evenly across the selected participant members, with any rounding remainder assigned to a stable, deterministic subset of participants so the sum of `expense_split.share_amount` exactly equals `amount`.

#### Scenario: Even division with remainder
- **WHEN** an expense of `10.00` is split equally across 3 members
- **THEN** the resulting `expense_split` rows sum to exactly `10.00`

### Requirement: Expense split — exact amounts
An expense with `split_type='exact'` SHALL require the sum of provided `share_amount` values to equal `amount` exactly; otherwise the request SHALL be rejected.

#### Scenario: Mismatched exact split rejected
- **WHEN** a `POST /reparto/api/groups/:id/expenses` request has `split_type='exact'` and the provided `share_amount` values do not sum to `amount`
- **THEN** the backend responds with HTTP 400 and creates no expense

### Requirement: Expense split — percentage
An expense with `split_type='percentage'` SHALL require the sum of provided `share_percentage` values to equal 100 within a ±0.01 tolerance; `share_amount` SHALL be computed server-side from the percentages, with the same rounding-remainder handling as the equal split.

#### Scenario: Percentages not summing to 100 rejected
- **WHEN** a `POST /reparto/api/groups/:id/expenses` request has `split_type='percentage'` and the provided `share_percentage` values sum to something other than 100 (outside tolerance)
- **THEN** the backend responds with HTTP 400 and creates no expense

### Requirement: Member balance calculation
For a given group, a member's balance SHALL equal the sum of `amount` for expenses where they are `payer_member_id`, minus the sum of `share_amount` across their `expense_split` rows in that group.

#### Scenario: Balances sum to zero
- **WHEN** `GET /reparto/api/groups/:id/balances` is called for a group with any number of expenses
- **THEN** the sum of all returned member balances is zero (within rounding tolerance)

### Requirement: Settlement suggestion
`GET /reparto/api/groups/:id/settlement` SHALL return a list of suggested transfers (from member, to member, amount) computed by greedily matching the largest debtor with the largest creditor until all balances are settled.

#### Scenario: Settlement zeroes out balances
- **WHEN** the suggested transfers from `GET /reparto/api/groups/:id/settlement` are applied to the group's balances
- **THEN** every member's resulting balance is zero (within rounding tolerance)

### Requirement: Member removal blocked while referenced
A group member SHALL NOT be removable while they are referenced as `payer_member_id` on an active expense or as a participant in an active `expense_split`.

#### Scenario: Removal blocked
- **WHEN** the group manager calls `DELETE /reparto/api/groups/:id/members/:memberId` for a member who is the payer or a participant of an active expense
- **THEN** the backend responds with HTTP 400 and does not remove the member

### Requirement: Soft delete
Deleting a group, member, or expense SHALL set `activo=false` and `deleted_at=now()`; it SHALL NOT remove the row. Listings, balances, and settlement calculations SHALL always filter by `activo=true`.

#### Scenario: Deleted expense excluded from balances
- **WHEN** an expense is deleted via `DELETE /reparto/api/groups/:id/expenses/:expenseId`
- **THEN** it no longer appears in `GET /reparto/api/groups/:id/expenses`, `balances`, or `settlement`, but the row still exists in the database
