/**
 * Key shared by every join button for a night. The signup card and the
 * sticky footer are two views of one action; the key lets each observe the
 * other's in-flight mutation so a fast double tap cannot fire two inserts.
 * Lives apart from queries.ts so component tests that mock the queries
 * module still get the real key.
 */
export const JOIN_LIST_MUTATION_KEY = ['signup', 'join'] as const;
