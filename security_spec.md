# security_spec.md - TraderSense AI

## 1. Data Invariants
- A user profile must exist and be 'activated' to use the AI analysis feature.
- Users can only access their own data (profiles, analyses, payment requests).
- Payment requests are immutable once approved/rejected (terminal state).
- The global settings (bKash number) can only be modified by admins.
- 'isActivated' field in the user profile can ONLY be modified by an admin.

## 2. The "Dirty Dozen" Payloads (Attacker Strategy)
1. **Identity Spoofing**: Attempt to create a user profile with someone else's UID.
2. **Privilege Escalation**: Attempt to set `isActivated: true` when creating/updating own profile.
3. **Ghost Field Injection**: Attempt to add `isAdmin: true` to a profile.
4. **Data Leakage**: Attempt to read all payment requests as a regular user.
5. **Resource Poisoning**: Injection of a 1MB string into the `trxId` field.
6. **State Shortcut**: Attempt to update a payment request status from `pending` to `approved` as a regular user.
7. **Cross-User Access**: Attempt to read another user's analysis result by ID.
8. **Setting Hijack**: Attempt to update the global `bkashNumber` as a regular user.
9. **Orphaned Write**: Attempt to create an analysis without a valid user ID.
10. **Terminal State Break**: Attempt to change the `amount` of an already `approved` payment request.
11. **Email Spoofing**: Attempt to use a non-verified email to gain admin access.
12. **Query Scraping**: Attempting a list query on `paymentRequests` without filters.

## 3. Test Runner Checklist
- FAIL: `setDoc(doc(db, 'users', 'victim_id'), { ... })` by 'attacker_id'.
- FAIL: `updateDoc(doc(db, 'users', 'my_id'), { isActivated: true })` by 'my_id'.
- FAIL: `getDocs(collection(db, 'paymentRequests'))` by non-admin.
- FAIL: `setDoc(doc(db, 'analyses', 'id'), { ..., reason: 'x' * 1024 * 1024 })`.
- FAIL: `updateDoc(doc(db, 'paymentRequests', 'id'), { status: 'approved' })` by non-admin.
- FAIL: `updateDoc(doc(db, 'settings', 'global'), { bkashNumber: 'evil' })` by non-admin.
