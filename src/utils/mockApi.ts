/**
 * utils/mockApi.ts
 *
 * Pre-built mock API. Do NOT modify this file.
 *
 * mockFetch(key, options?)
 *   Simulates a network request. Resolves after `delay` ms (default 80ms)
 *   with { id: key, value: Math.random(), fetchedAt: timestamp }.
 *   Pass { shouldFail: true } to simulate a rejection.
 *
 * fetchCallLog
 *   Array recording every (key, timestamp) pair fetched.
 *   Inspect this in the test runner to assert call counts.
 *
 * resetFetchLog()
 *   Clears the log. Called automatically before each test.
 */

export interface MockData {
  id: string
  value: number
  fetchedAt: number
}

export interface FetchOptions {
  delay?: number
  shouldFail?: boolean
}

export interface CallLogEntry {
  key: string
  calledAt: number
}

export const fetchCallLog: CallLogEntry[] = []

export function resetFetchLog(): void {
  fetchCallLog.length = 0
}

export function mockFetch(key: string, options: FetchOptions = {}): Promise<MockData> {
  const { delay = 80, shouldFail = false } = options
  fetchCallLog.push({ key, calledAt: Date.now() })
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error(`Network error for key: ${key}`))
      } else {
        resolve({ id: key, value: Math.random(), fetchedAt: Date.now() })
      }
    }, delay)
  })
}
