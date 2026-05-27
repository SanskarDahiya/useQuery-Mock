/**
 * hooks/useQuery.ts
 *
 * ─────────────────────────────────────────────────────────────────
 *  YOUR TASK — implement useQuery(key, fetchFn)
 *  This is the ONLY file you should edit.
 * ─────────────────────────────────────────────────────────────────
 *
 *  Step 1 — Basic state lifecycle
 *    Return { data, loading, error }.
 *    • loading starts true, becomes false once the fetch settles.
 *    • data holds the resolved value on success (undefined until then).
 *    • error holds the rejection reason on failure; null otherwise.
 *
 *  Step 2 — Cache by key
 *    Results are stored in the shared `cache` Map.
 *    A second mount with the same key must return cached data
 *    instantly (loading=false) without firing a new network request.
 *
 *  Step 3 — Stale-while-revalidate
 *    If a cached value exists when the hook mounts:
 *    • Return it immediately (loading=false, data=<stale>).
 *    • Simultaneously fire a background refetch to freshen the cache.
 *    • Update state once fresh data arrives.
 *
 *  Step 4 — Request deduplication
 *    If two components call useQuery with the same key at the same
 *    time (before either fetch resolves), only ONE network request
 *    should fire. Both components receive the result.
 *
 * ─────────────────────────────────────────────────────────────────
 *  Shared module-level state (do not redeclare)
 * ─────────────────────────────────────────────────────────────────
 *  cache     — Map<string, unknown>   persists resolved values
 *  inFlight  — Map<string, Promise>   deduplicates concurrent fetches
 * ─────────────────────────────────────────────────────────────────
 *
 *  Hints
 *    • Use [key] as the only useEffect dependency — not fetchFn.
 *    • Initialise data state from cache: useState(() => cache.get(key)).
 *    • Guard setState calls after unmount with a useRef boolean.
 *    • Check inFlight before calling fetchFn. Attach .then() to
 *      the existing promise if one is already running for this key.
 *    • Delete inFlight[key] in BOTH .then() and .catch().
 *    • Do NOT write to cache on a failed fetch.
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react'

export interface QueryResult<T> {
  data: T | undefined
  loading: boolean
  error: Error | null
}

// Shared across all hook instances — intentionally module-level.
export const cache = new Map<string, unknown>()
export const inFlight = new Map<string, Promise<unknown>>()

// ─── START: implement your hook below ────────────────────────────

export function useQuery<T = unknown>(
  key: string,
  fetchFn: () => Promise<T>
): QueryResult<T> {

  // Replace this stub with your implementation.
  // Remove the throw once you start coding.
  throw new Error('useQuery is not implemented yet.')

}

// ─── END ─────────────────────────────────────────────────────────
