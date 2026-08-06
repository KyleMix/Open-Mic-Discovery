/**
 * A fake for the one network boundary in this app.
 *
 * `getSupabase()` is a single named export that all 19 call sites import by
 * name, so mocking that module intercepts every request the app can make.
 * This fake stands in for the returned client.
 *
 * The point is to let a test say what the server replied, not to assert how
 * the query builder was chained. A handler receives the intent of a call
 * (which table, which verb) and returns a reply. Tests then assert on what
 * the hook did with that reply, which is the behavior we actually care about.
 * Deliberately not a mock PostgREST server: it does no filtering, holds no
 * rows, and understands none of the operators.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

export type FakeError = { message: string; code?: string };

/** What a faked call resolves to, mirroring a PostgREST response. */
export type FakeResult = { data: unknown; error: FakeError | null };

export type FakeVerb = 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';

/** The intent of a call: what was asked for, never how it was chained. */
export type FakeOp = {
  table?: string;
  rpc?: string;
  verb: FakeVerb;
  payload?: unknown;
  /** True when the caller ended the chain with single() or maybeSingle(). */
  single: boolean;
};

/**
 * Returning a promise lets a test hold a request open, which is the only way
 * to observe a screen's loading state: a handler that answers immediately has
 * already resolved by the time render returns.
 */
export type FakeHandler = (op: FakeOp) => FakeResult | Promise<FakeResult>;

/** A request that never answers, for asserting on loading states. */
export function neverResolves(): Promise<FakeResult> {
  return new Promise<FakeResult>(() => {});
}

/** Rows a successful write returns, for the common "it landed" case. */
export function affectedRows(count: number): { id: string }[] {
  return Array.from({ length: count }, (_v, i) => ({ id: `row-${i + 1}` }));
}

const VERB_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);
const SINGLE_METHODS = new Set(['single', 'maybeSingle']);

/**
 * PostgREST builders are thenable and every filter method returns the builder,
 * so one permissive chainable object covers the whole surface the app uses.
 */
function makeBuilder(op: FakeOp, handler: FakeHandler): unknown {
  const settle = async (): Promise<FakeResult> => {
    const result = await handler(op);
    if (!op.single) {
      return result;
    }
    // single()/maybeSingle() collapse the row set to one row or null.
    const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
    return { data, error: result.error };
  };

  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const settled = settle();
          return settled.then.bind(settled);
        }
        // Anything else asked of a builder by symbol is internal plumbing.
        if (typeof prop === 'symbol') {
          return undefined;
        }
        if (prop === 'select') {
          return () => {
            // A select after a write is the returning clause, not a new verb.
            op.verb = op.verb ?? 'select';
            return proxy;
          };
        }
        if (SINGLE_METHODS.has(prop)) {
          return () => {
            op.single = true;
            return proxy;
          };
        }
        if (VERB_METHODS.has(prop)) {
          return (payload: unknown) => {
            op.verb = prop as FakeVerb;
            op.payload = payload;
            return proxy;
          };
        }
        // Every remaining builder method is a filter or modifier: chain on.
        return () => proxy;
      },
    },
  );
  return proxy;
}

type RealtimeCallback = () => void;

export type FakeSupabase = {
  client: SupabaseClient<Database>;
  /** Fire the postgres_changes handler on every subscribed channel. */
  emitRealtime: () => void;
  /** How many channels are currently subscribed and not removed. */
  openChannels: () => number;
};

export function createFakeSupabase(handler: FakeHandler): FakeSupabase {
  const callbacks = new Map<object, RealtimeCallback>();
  const subscribed = new Set<object>();

  function makeChannel(): object {
    const channel = {
      on(_event: string, _filter: unknown, callback: RealtimeCallback) {
        callbacks.set(channel, callback);
        return channel;
      },
      subscribe() {
        subscribed.add(channel);
        return channel;
      },
    };
    return channel;
  }

  const client = {
    from(table: string) {
      return makeBuilder({ table, verb: undefined as unknown as FakeVerb, single: false }, handler);
    },
    rpc(name: string, args?: unknown) {
      return makeBuilder({ rpc: name, verb: 'rpc', payload: args, single: false }, handler);
    },
    channel() {
      return makeChannel();
    },
    removeChannel(channel: object) {
      subscribed.delete(channel);
      callbacks.delete(channel);
    },
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    emitRealtime: () => {
      for (const channel of subscribed) {
        callbacks.get(channel)?.();
      }
    },
    openChannels: () => subscribed.size,
  };
}
