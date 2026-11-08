# Neon migration

- [x] Connect the user's Neon database and inspect destination tables.
- [x] Inventory the current application data: profiles, draw history, catalog and catalog page queue.
- [x] Copy and verify the application data from the uploaded database export; exclude managed authentication tables and credentials.
- [ ] Fix genre loading in profile and onboarding.
- [ ] Switch application data access and catalog synchronization to the Neon connector after the copy is verified. Keep the current sign-in service and validate user ownership server-side.
- [ ] Add AI Gateway recommendations from a viewer's description, restricted to available catalog movies, with an explanation.
- [ ] Test genre loading, signed-in profile/history persistence, AI recommendation, catalog filtering and catalog synchronization against Neon before reporting migration complete.

The uploaded export is available. Preserve the source database and Neon Auth tables throughout the migration.