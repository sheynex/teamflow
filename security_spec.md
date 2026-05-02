# Security Specification for Firebase

## Data Invariants
1. A Task must have a valid `created_by` matching the authenticated user's ID.
2. A Profile's `role` can only be set to "Super Admin" if the user's email matches the hardcoded service email or if modified by another Admin (though bootstrapping is needed).
3. Users cannot modify their own `role` field.
4. Time records must have `clock_in` before `clock_out`.
5. Document locks can only be released by the user who locked them or an Admin.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Attempt to create a profile with a different ID than the authenticated user.
2. **Privilege Escalation**: Attempt to update own role to "Super Admin".
3. **Orphaned Task**: Attempt to create a task with a non-existent `assigned_to` ID (well, rules can check if it matches a pattern, but existence is harder without recursive lookup).
4. **Shadow Update**: Adding a `is_verified: true` field to a Task.
5. **Timestamp Fraud**: Setting a `created_at` in the past instead of using server timestamp.
6. **Cross-User Deletion**: Attempting to delete someone else's time log.
7. **Invalid Status**: Setting a task status to "Destroyed" (not in enum).
8. **Large Payload**: Attempting to set a `name` that is 2MB long.
9. **ID Injection**: Using a document ID with special characters like `/` or `..`.
10. **Hidden PII Access**: Attempting to read another user's private settings (if they existed, but here we cover roles).
11. **Action Shortcut**: Changing a task status from "Pending" to "Completed" without going through "In Progress" (if we enforced flow).
12. **Recursive Cost Attack**: A query that attempts to list all profiles without any filters.

## Test Runner (Draft)
```typescript
// firestore.rules.test.ts (Conceptual)
// We would use @firebase/rules-unit-testing here.
```
