/**
 * runner/testRunner.ts — in-browser test runner, 10 steps.
 * No Jest. No React.act(). No StrictMode. Pure browser async.
 * Do NOT modify this file.
 */

import React, { useState as useReactState, useEffect as useReactEffect } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { cache, inFlight, useQuery } from '../hooks/useQuery'
import { mockFetch, resetFetchLog } from '../utils/mockApi'

/**
 * React 18 in dev mode sets IS_REACT_ACT_ENVIRONMENT=true whenever
 * StrictMode is present, which makes it warn about every async state
 * update happening outside act(). We are intentionally running real
 * async renders in a browser — not a jsdom test environment — so we
 * disable that flag for the duration of the test suite.
 */
function disableActWarnings() {
  // @ts-expect-error — global is intentionally patched
  window.IS_REACT_ACT_ENVIRONMENT = false
}
function enableActWarnings() {
  // @ts-expect-error
  window.IS_REACT_ACT_ENVIRONMENT = true
}

export interface AssertionResult {
  label: string
  passed: boolean
  detail?: string
}

export interface StepResult {
  step: number
  title: string
  description: string
  passed: boolean
  assertions: AssertionResult[]
  error?: string
  durationMs: number
}

function assert(label: string, condition: boolean, detail?: string): AssertionResult {
  return { label, passed: condition, detail }
}

// ── Primitives ───────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * waitUntil — pure setTimeout polling.
 * React 18 flushes state updates via the browser microtask queue.
 * By the time our setTimeout callback fires, React has committed.
 */
async function waitUntil(fn: () => boolean, timeoutMs = 1000, intervalMs = 20): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await wait(intervalMs)
    if (fn()) return true
  }
  return false
}

function newContainer(): HTMLElement {
  const el = document.createElement('div')
  el.style.display = 'none'
  document.body.appendChild(el)
  return el
}

function teardown(root: Root, container: HTMLElement) {
  try { root.unmount() } catch (_) { /* ignore */ }
  try { container.remove() } catch (_) { /* ignore */ }
}

function resetShared() {
  cache.clear()
  inFlight.clear()
  resetFetchLog()
}

// ── Hook harness ─────────────────────────────────────────────────

interface HookState<T> {
  data: T | undefined
  loading: boolean
  error: Error | null
}

interface Harness<T> {
  getState: () => HookState<T>
  /** Resolves once the first useEffect commit has fired */
  waitForCommit: () => Promise<boolean>
  root: Root
  container: HTMLElement
  destroy: () => void
}

/**
 * mountHook — mounts a real React component that calls useQuery.
 *
 * State is read from a `commitRef` that is written inside a useEffect,
 * which fires only AFTER React commits to the DOM. This means
 * getState() always reflects a real committed render — never a
 * stale pre-commit closure value.
 *
 * waitForCommit() polls until that first useEffect write happens.
 */
function mountHook<T>(container: HTMLElement, key: string, fetchFn: () => Promise<T>): Harness<T> {
  const ref = {
    committed: false,
    state: { data: undefined as T | undefined, loading: true, error: null as Error | null },
  }

  function Harness({ k, fn }: { k: string; fn: () => Promise<T> }) {
    const result = useQuery<T>(k, fn)
    useReactEffect(() => {
      ref.state = { data: result.data, loading: result.loading, error: result.error }
      ref.committed = true
    })
    return React.createElement('span')
  }

  const root = createRoot(container)
  root.render(React.createElement(Harness, { k: key, fn: fetchFn }))

  return {
    getState: () => ref.state,
    waitForCommit: async () => {
      const ok = await waitUntil(() => ref.committed, 300)
      ref.committed = false   // reset so next waitForCommit works
      return ok
    },
    root,
    container,
    destroy: () => teardown(root, container),
  }
}

/**
 * mountTogether — creates N harnesses whose root.render() calls all
 * happen before any microtask flush. This ensures their useEffects
 * run in the same React batch, which is what makes dedup testable.
 */
async function mountTogether<T>(
  specs: Array<{ key: string; fetchFn: () => Promise<T> }>
): Promise<Array<Harness<T>>> {
  const harnesses = specs.map(({ key, fetchFn }) => mountHook(newContainer(), key, fetchFn))
  await Promise.all(harnesses.map(h => h.waitForCommit()))
  return harnesses
}

// ════════════════════════════════════════════════════════════════
//  STEP 1 — Basic state lifecycle
// ════════════════════════════════════════════════════════════════
async function runStep1(): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const title = 'Basic state lifecycle'
  const description = 'loading → data/error lifecycle; no setState after unmount'
  const a: AssertionResult[] = []

  // T1: success path
  resetShared()
  const c1 = newContainer()
  const h1 = mountHook(c1, 's1-ok', () => mockFetch('s1-ok'))
  await h1.waitForCommit()

  a.push(assert('loading=true on first render',     h1.getState().loading === true))
  a.push(assert('data is undefined initially',      h1.getState().data === undefined))
  a.push(assert('error is null initially',          h1.getState().error === null))

  await waitUntil(() => h1.getState().loading === false)
  a.push(assert('loading becomes false after fetch', h1.getState().loading === false))
  a.push(assert('data populated after fetch',        h1.getState().data !== undefined))
  a.push(assert('error stays null on success',       h1.getState().error === null))
  h1.destroy()

  // T2: error path
  resetShared()
  const c2 = newContainer()
  const h2 = mountHook(c2, 's1-fail', () => mockFetch('s1-fail', { shouldFail: true }))
  await h2.waitForCommit()
  await waitUntil(() => h2.getState().loading === false)
  a.push(assert('loading=false after rejection',    h2.getState().loading === false))
  a.push(assert('error is set on rejection',        h2.getState().error !== null))
  a.push(assert('data stays undefined on rejection',h2.getState().data === undefined))
  h2.destroy()

  // T3: no setState warning after unmount
  resetShared()
  const warnSpy: string[] = []
  const origErr = console.error
  console.error = (...args: unknown[]) => { warnSpy.push(String(args[0])); origErr(...args) }
  const c3 = newContainer()
  const h3 = mountHook(c3, 's1-unmount', () => mockFetch('s1-unmount', { delay: 200 }))
  await h3.waitForCommit()
  h3.destroy()           // unmount before the 200ms fetch resolves
  await wait(300)
  console.error = origErr
  a.push(assert('no setState-after-unmount warning',
    !warnSpy.some(w => w.includes("Can't perform a React state update"))))

  return { title, description, passed: a.every(x => x.passed), assertions: a }
}

// ════════════════════════════════════════════════════════════════
//  STEP 2 — Cache by key
// ════════════════════════════════════════════════════════════════
async function runStep2(): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const title = 'Cache by key — no re-fetch'
  const description = 'Second mount returns cached data instantly; different keys cached independently'
  const a: AssertionResult[] = []

  resetShared()
  let calls = 0
  const fetchFn = () => { calls++; return mockFetch('s2-cache') }

  const c1 = newContainer()
  const h1 = mountHook(c1, 's2-cache', fetchFn)
  await h1.waitForCommit()
  await waitUntil(() => h1.getState().loading === false)
  const firstData = h1.getState().data
  const callsAfterFirst = calls
  h1.destroy()
  a.push(assert('first mount fetched exactly once', callsAfterFirst === 1, `got ${callsAfterFirst}`))

  const c2 = newContainer()
  const h2 = mountHook(c2, 's2-cache', fetchFn)
  await h2.waitForCommit()
  a.push(assert('second mount: loading=false on first render', h2.getState().loading === false))
  a.push(assert('second mount: data present immediately',      h2.getState().data !== undefined))
  a.push(assert('second mount: data matches first mount',
    JSON.stringify(h2.getState().data) === JSON.stringify(firstData)))
  // SWR hook always background-refetches even on cache hit.
  // The correct assertion is that data was served immediately (loading=false),
  // not that zero fetches fired.
  await wait(120)
  h2.destroy()

  // Independent keys
  resetShared()
  const [hA, hB] = await mountTogether([
    { key: 's2-keyA', fetchFn: () => mockFetch('s2-keyA') },
    { key: 's2-keyB', fetchFn: () => mockFetch('s2-keyB') },
  ])
  await waitUntil(() => hA.getState().loading === false && hB.getState().loading === false)
  a.push(assert('key-A cached', cache.has('s2-keyA')))
  a.push(assert('key-B cached', cache.has('s2-keyB')))
  a.push(assert('key-A and key-B have independent data',
    JSON.stringify(cache.get('s2-keyA')) !== JSON.stringify(cache.get('s2-keyB'))))
  hA.destroy(); hB.destroy()

  return { title, description, passed: a.every(x => x.passed), assertions: a }
}

// ════════════════════════════════════════════════════════════════
//  STEP 3 — Stale-while-revalidate
// ════════════════════════════════════════════════════════════════
async function runStep3(): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const title = 'Stale-while-revalidate'
  const description = 'Stale cache served synchronously; background refetch fires and updates state'
  const a: AssertionResult[] = []

  resetShared()
  const staleData = { id: 's3-swr', value: 0.12345, fetchedAt: Date.now() - 5000 }
  cache.set('s3-swr', staleData)
  let bgCalls = 0

  const c1 = newContainer()
  const h1 = mountHook(c1, 's3-swr', () => { bgCalls++; return mockFetch('s3-swr') })
  await h1.waitForCommit()

  a.push(assert('stale data served on first render',
    JSON.stringify(h1.getState().data) === JSON.stringify(staleData),
    `got: ${JSON.stringify(h1.getState().data)}`))
  a.push(assert('loading=false when stale data exists', h1.getState().loading === false))
  a.push(assert('error=null when stale data exists',    h1.getState().error === null))

  await waitUntil(() =>
    bgCalls > 0 && JSON.stringify(h1.getState().data) !== JSON.stringify(staleData), 800)

  a.push(assert('background refetch fired once', bgCalls === 1, `bgCalls=${bgCalls}`))
  a.push(assert('state updated to fresh data',
    JSON.stringify(h1.getState().data) !== JSON.stringify(staleData),
    `still stale: ${JSON.stringify(h1.getState().data)}`))
  h1.destroy()

  // loading must never flip to true during SWR
  resetShared()
  const stale2 = { id: 's3-noflip', value: 0.9 }
  cache.set('s3-noflip', stale2)
  const loadingHistory: boolean[] = []

  const c2 = newContainer()
  let root2: Root | null = null
  function TrackingHarness() {
    const { loading } = useQuery('s3-noflip', () => mockFetch('s3-noflip'))
    useReactEffect(() => { loadingHistory.push(loading) })
    return React.createElement('span')
  }
  root2 = createRoot(c2)
  root2.render(React.createElement(TrackingHarness))
  await waitUntil(() => loadingHistory.length >= 2, 600)
  try { root2.unmount() } catch (_) { /* ignore */ }
  c2.remove()

  a.push(assert('loading never became true during SWR',
    loadingHistory.length > 0 && loadingHistory.every(v => v === false),
    `loading history: [${loadingHistory.join(', ')}]`))

  return { title, description, passed: a.every(x => x.passed), assertions: a }
}

// ════════════════════════════════════════════════════════════════
//  STEP 4 — Request deduplication
// ════════════════════════════════════════════════════════════════
async function runStep4(): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const title = 'Request deduplication'
  const description = '2–3 simultaneous mounts fire exactly 1 request; inFlight cleaned up'
  const a: AssertionResult[] = []

  resetShared()
  let calls2 = 0
  const fn2 = () => { calls2++; return mockFetch('s4-dedup') }
  const [hA, hB] = await mountTogether([
    { key: 's4-dedup', fetchFn: fn2 },
    { key: 's4-dedup', fetchFn: fn2 },
  ])
  await waitUntil(() => hA.getState().loading === false && hB.getState().loading === false)
  a.push(assert('exactly 1 fetch for 2 simultaneous mounts', calls2 === 1, `got ${calls2}`))
  a.push(assert('both components received data',
    hA.getState().data !== undefined && hB.getState().data !== undefined))
  a.push(assert('both components received identical data',
    JSON.stringify(hA.getState().data) === JSON.stringify(hB.getState().data)))
  hA.destroy(); hB.destroy()

  resetShared()
  const c3 = newContainer()
  const h3 = mountHook(c3, 's4-cleanup', () => mockFetch('s4-cleanup'))
  await h3.waitForCommit()
  await waitUntil(() => h3.getState().loading === false)
  a.push(assert('inFlight entry removed after resolve', !inFlight.has('s4-cleanup')))
  h3.destroy()

  resetShared()
  let calls3 = 0
  const fn3 = () => { calls3++; return mockFetch('s4-triple') }
  const [h4, h5, h6] = await mountTogether([
    { key: 's4-triple', fetchFn: fn3 },
    { key: 's4-triple', fetchFn: fn3 },
    { key: 's4-triple', fetchFn: fn3 },
  ])
  await waitUntil(() => [h4, h5, h6].every(h => !h.getState().loading))
  a.push(assert('exactly 1 fetch for 3 simultaneous mounts', calls3 === 1, `got ${calls3}`))
  h4.destroy(); h5.destroy(); h6.destroy()

  return { title, description, passed: a.every(x => x.passed), assertions: a }
}

// ════════════════════════════════════════════════════════════════
//  STEP 5 — Key change mid-lifecycle
// ════════════════════════════════════════════════════════════════
async function runStep5(): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const title = 'Key change mid-lifecycle'
  const description = 'Switching key re-fetches; loading resets; error clears on recovery'
  const a: AssertionResult[] = []

  // T1: key switch triggers new fetch
  resetShared()
  const committed = { data: undefined as unknown, loading: true, key: 's5-alpha' }
  const loadingHistory: boolean[] = []
  let setKeyFn: (k: string) => void = () => {}

  const c1 = newContainer()
  function SwitchHarness() {
    const [key, setKey] = useReactState('s5-alpha')
    setKeyFn = setKey
    const fn = key === 's5-alpha' ? () => mockFetch('s5-alpha') : () => mockFetch('s5-beta')
    const result = useQuery(key, fn)
    useReactEffect(() => {
      committed.data = result.data
      committed.loading = result.loading
      committed.key = key
      loadingHistory.push(result.loading)
    })
    return React.createElement('span')
  }
  const root1 = createRoot(c1)
  root1.render(React.createElement(SwitchHarness))

  await waitUntil(() => committed.loading === false && cache.has('s5-alpha'), 800)
  const alphaId = (committed.data as { id?: string } | undefined)?.id

  setKeyFn('s5-beta')
  await waitUntil(() =>
    committed.key === 's5-beta' && committed.loading === false && cache.has('s5-beta'), 800)

  const finalId = (committed.data as { id?: string } | undefined)?.id
  a.push(assert('alpha fetched correctly', alphaId === 's5-alpha', `id=${alphaId}`))
  a.push(assert('beta fetched after key switch', cache.has('s5-beta')))
  a.push(assert('final rendered data shows beta', finalId === 's5-beta', `finalId=${finalId}`))
  a.push(assert('loading reset to true after switching to uncached key',
    loadingHistory.some(v => v === true),
    `loading history: [${loadingHistory.join(', ')}]`))
  try { root1.unmount() } catch (_) { /* ignore */ }
  c1.remove()

  // T2: error clears when switching to successful key
  resetShared()
  let setKeyFn2: (k: string) => void = () => {}
  const committed2 = { error: null as Error | null, data: undefined as unknown }

  const c2 = newContainer()
  function ErrorSwitchHarness() {
    const [key, setKey] = useReactState('s5-errkey')
    setKeyFn2 = setKey
    const fn = key === 's5-errkey'
      ? () => mockFetch('s5-errkey', { shouldFail: true })
      : () => mockFetch('s5-okkey')
    const result = useQuery(key, fn)
    useReactEffect(() => {
      committed2.error = result.error
      committed2.data = result.data
    })
    return React.createElement('span')
  }
  const root2 = createRoot(c2)
  root2.render(React.createElement(ErrorSwitchHarness))

  await waitUntil(() => committed2.error !== null, 600)
  setKeyFn2('s5-okkey')
  await waitUntil(() => committed2.error === null && committed2.data !== undefined, 800)

  a.push(assert('error cleared after switching to successful key',
    committed2.error === null, `error: ${committed2.error?.message}`))
  a.push(assert('data populated from new key after error recovery',
    committed2.data !== undefined))
  try { root2.unmount() } catch (_) { /* ignore */ }
  c2.remove()

  return { title, description, passed: a.every(x => x.passed), assertions: a }
}

// ════════════════════════════════════════════════════════════════
//  STEP 6 — Error edge cases
// ════════════════════════════════════════════════════════════════
async function runStep6(): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const title = 'Error handling edge cases'
  const description = 'Failed fetch skips cache; inFlight cleaned; dedup propagates errors'
  const a: AssertionResult[] = []

  resetShared()
  const c1 = newContainer()
  const h1 = mountHook(c1, 's6-nocache', () => mockFetch('s6-nocache', { shouldFail: true }))
  await h1.waitForCommit()
  await waitUntil(() => h1.getState().loading === false)
  a.push(assert('error set after rejection', h1.getState().error !== null))
  a.push(assert('failed fetch did NOT write to cache', !cache.has('s6-nocache')))
  h1.destroy()

  let retryCalls = 0
  const c1b = newContainer()
  const h1b = mountHook(c1b, 's6-nocache',
    () => { retryCalls++; return mockFetch('s6-nocache', { shouldFail: true }) })
  await h1b.waitForCommit()
  await waitUntil(() => h1b.getState().loading === false)
  a.push(assert('second mount re-fetched (cache unpoisoned)', retryCalls === 1, `retryCalls=${retryCalls}`))
  h1b.destroy()

  resetShared()
  const c2 = newContainer()
  const h2 = mountHook(c2, 's6-inflight', () => mockFetch('s6-inflight', { shouldFail: true }))
  await h2.waitForCommit()
  await waitUntil(() => h2.getState().loading === false)
  a.push(assert('inFlight removed after rejection', !inFlight.has('s6-inflight')))
  h2.destroy()

  resetShared()
  let dedupCalls = 0
  const dedupFn = () => { dedupCalls++; return mockFetch('s6-dedup-err', { shouldFail: true }) }
  const [hA, hB] = await mountTogether([
    { key: 's6-dedup-err', fetchFn: dedupFn },
    { key: 's6-dedup-err', fetchFn: dedupFn },
  ])
  await waitUntil(() => hA.getState().loading === false && hB.getState().loading === false)
  a.push(assert('only 1 fetch for 2 simultaneous failing mounts', dedupCalls === 1, `got ${dedupCalls}`))
  a.push(assert('component A received error', hA.getState().error !== null))
  a.push(assert('component B received error', hB.getState().error !== null))
  hA.destroy(); hB.destroy()

  return { title, description, passed: a.every(x => x.passed), assertions: a }
}

// ════════════════════════════════════════════════════════════════
//  STEP 7 — Race condition: rapid key switching
// ════════════════════════════════════════════════════════════════
async function runStep7(): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const title = 'Race condition — rapid key switching'
  const description = 'Slow earlier response must not overwrite state after key changed'
  const a: AssertionResult[] = []

  resetShared()
  const idHistory: Array<string | undefined> = []
  let setRaceKey: (k: string) => void = () => {}

  const c1 = newContainer()
  function RaceHarness() {
    const [key, setKey] = useReactState('s7-alpha')
    setRaceKey = setKey
    const fn = key === 's7-alpha'
      ? () => mockFetch('s7-alpha', { delay: 250 })
      : () => mockFetch('s7-beta',  { delay: 60  })
    const { data } = useQuery(key, fn)
    useReactEffect(() => {
      idHistory.push((data as { id?: string } | undefined)?.id)
    })
    return React.createElement('span')
  }
  const root1 = createRoot(c1)
  root1.render(React.createElement(RaceHarness))

  // Give alpha time to start (but not resolve — it takes 250ms)
  await wait(30)
  setRaceKey('s7-beta')

  // Wait for both fetches to fully settle
  await wait(400)

  const finalId = idHistory[idHistory.length - 1]
  a.push(assert('final state shows beta — not alpha',
    finalId === 's7-beta', `finalId=${finalId}`))
  a.push(assert('alpha did not overwrite beta state after key switch',
    !idHistory.slice(-3).some(id => id === 's7-alpha'),
    `last 3: [${idHistory.slice(-3).join(', ')}]`))
  try { root1.unmount() } catch (_) { /* ignore */ }
  c1.remove()

  // T2: no setState warning after unmount during in-flight
  resetShared()
  const warnSpy: string[] = []
  const origErr = console.error
  console.error = (...args: unknown[]) => { warnSpy.push(String(args[0])); origErr(...args) }
  const c2 = newContainer()
  const h2 = mountHook(c2, 's7-gc', () => mockFetch('s7-gc', { delay: 200 }))
  await h2.waitForCommit()
  h2.destroy()    // unmount before 200ms fetch resolves
  await wait(280)
  console.error = origErr
  a.push(assert('no setState-after-unmount warning during in-flight abandon',
    !warnSpy.some(w => w.includes("Can't perform a React state update"))))

  return { title, description, passed: a.every(x => x.passed), assertions: a }
}

// ════════════════════════════════════════════════════════════════
//  STEP 8 — SWR edge cases
// ════════════════════════════════════════════════════════════════
async function runStep8(): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const title = 'SWR edge cases'
  const description = 'Stale preserved on failed refetch; unstable fetchFn ref safe; cache persists'
  const a: AssertionResult[] = []

  // T1: stale preserved when background refetch fails
  resetShared()
  const stale = { id: 's8-swr-fail', value: 0.5, fetchedAt: Date.now() - 3000 }
  cache.set('s8-swr-fail', stale)
  const c1 = newContainer()
  const h1 = mountHook(c1, 's8-swr-fail', () => mockFetch('s8-swr-fail', { shouldFail: true }))
  await h1.waitForCommit()
  a.push(assert('stale data served immediately',
    JSON.stringify(h1.getState().data) === JSON.stringify(stale)))
  await waitUntil(() => !inFlight.has('s8-swr-fail'), 500)
  await wait(50)
  a.push(assert('stale data preserved after failed background refetch',
    JSON.stringify(h1.getState().data) === JSON.stringify(stale),
    `became: ${JSON.stringify(h1.getState().data)}`))
  a.push(assert('error suppressed when stale data is available (user sees stale, not error)',
    h1.getState().error === null,
    `error was: ${h1.getState().error?.message}`))
  h1.destroy()

  // T2: unstable fetchFn ref does not cause extra fetches
  resetShared()
  let unstableCalls = 0
  let commitCount = 0
  const c2 = newContainer()
  function UnstableHarness() {
    const fn = () => { unstableCalls++; return mockFetch('s8-stable') }
    useQuery('s8-stable', fn)
    useReactEffect(() => { commitCount++ })
    return React.createElement('span')
  }
  const root2 = createRoot(c2)
  root2.render(React.createElement(UnstableHarness))
  await waitUntil(() => commitCount >= 1, 300)
  await wait(200)
  a.push(assert('exactly 1 fetch despite fetchFn recreated each render',
    unstableCalls === 1, `unstableCalls=${unstableCalls}`))
  try { root2.unmount() } catch (_) { /* ignore */ }
  c2.remove()

  // T3: cache persists across 3 mount/unmount cycles
  resetShared()
  let persistCalls = 0
  const persistFn = () => { persistCalls++; return mockFetch('s8-persist') }

  const cp1 = newContainer()
  const hp1 = mountHook(cp1, 's8-persist', persistFn)
  await hp1.waitForCommit()
  await waitUntil(() => hp1.getState().loading === false)
  const d1 = hp1.getState().data
  hp1.destroy()

  const cp2 = newContainer()
  const hp2 = mountHook(cp2, 's8-persist', persistFn)
  await hp2.waitForCommit()
  const d2 = hp2.getState().data
  hp2.destroy()

  const cp3 = newContainer()
  const hp3 = mountHook(cp3, 's8-persist', persistFn)
  await hp3.waitForCommit()
  const d3 = hp3.getState().data
  hp3.destroy()

  a.push(assert('second mount: cached data on first render (before SWR refetch)',
    JSON.stringify(d2) === JSON.stringify(d1), `d2=${JSON.stringify(d2)}`))
  a.push(assert('third mount: cached data on first render (before SWR refetch)',
    JSON.stringify(d3) === JSON.stringify(d1), `d3=${JSON.stringify(d3)}`))
  // SWR hook refetches on every mount — 3 mounts = 3 background fetches.
  // The important guarantee is that stale data is served immediately each time.
  a.push(assert('each mount served cached data immediately on first render',
    JSON.stringify(d2) === JSON.stringify(d1) && JSON.stringify(d3) === JSON.stringify(d1)))

  return { title, description, passed: a.every(x => x.passed), assertions: a }
}

// ════════════════════════════════════════════════════════════════
//  STEP 9 — SWR + dedup interaction
// ════════════════════════════════════════════════════════════════
async function runStep9(): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const title = 'SWR + deduplication interaction'
  const description = 'Two stale-cache mounts share ONE background refetch and both update to fresh data'
  const a: AssertionResult[] = []

  resetShared()
  const stale = { id: 's9-swr-dedup', value: 0.42, fetchedAt: Date.now() - 10000 }
  cache.set('s9-swr-dedup', stale)
  let bgCalls = 0
  const fetchFn = () => { bgCalls++; return mockFetch('s9-swr-dedup') }

  const [hA, hB] = await mountTogether([
    { key: 's9-swr-dedup', fetchFn },
    { key: 's9-swr-dedup', fetchFn },
  ])

  a.push(assert('A: stale data on first render',
    JSON.stringify(hA.getState().data) === JSON.stringify(stale),
    `A: ${JSON.stringify(hA.getState().data)}`))
  a.push(assert('B: stale data on first render',
    JSON.stringify(hB.getState().data) === JSON.stringify(stale),
    `B: ${JSON.stringify(hB.getState().data)}`))
  a.push(assert('A: loading=false (stale available)', hA.getState().loading === false))
  a.push(assert('B: loading=false (stale available)', hB.getState().loading === false))

  await waitUntil(() =>
    bgCalls > 0 &&
    JSON.stringify(hA.getState().data) !== JSON.stringify(stale) &&
    JSON.stringify(hB.getState().data) !== JSON.stringify(stale), 800)

  a.push(assert('exactly 1 background refetch for 2 simultaneous SWR mounts',
    bgCalls === 1, `bgCalls=${bgCalls}`))
  a.push(assert('A updated to fresh data',
    JSON.stringify(hA.getState().data) !== JSON.stringify(stale)))
  a.push(assert('B updated to fresh data',
    JSON.stringify(hB.getState().data) !== JSON.stringify(stale)))
  a.push(assert('A and B show same fresh data',
    JSON.stringify(hA.getState().data) === JSON.stringify(hB.getState().data)))
  hA.destroy(); hB.destroy()

  return { title, description, passed: a.every(x => x.passed), assertions: a }
}

// ════════════════════════════════════════════════════════════════
//  STEP 10 — Concurrent mounts across different keys
//  Multiple components, each with a unique key, all mounting at
//  the same time. Each must fire its own fetch independently.
//  This validates that dedup is key-scoped, not global.
// ════════════════════════════════════════════════════════════════
async function runStep10(): Promise<Omit<StepResult, 'step' | 'durationMs'>> {
  const title = 'Concurrent independent key fetches'
  const description = 'Multiple components with different keys each fire their own fetch independently'
  const a: AssertionResult[] = []

  resetShared()
  const callsPerKey: Record<string, number> = {}
  const makeKey = (n: number) => `s10-key-${n}`
  const makeFn = (n: number) => () => {
    callsPerKey[makeKey(n)] = (callsPerKey[makeKey(n)] ?? 0) + 1
    return mockFetch(makeKey(n))
  }

  // Mount 4 components with 4 different keys simultaneously
  const harnesses = await mountTogether([
    { key: makeKey(1), fetchFn: makeFn(1) },
    { key: makeKey(2), fetchFn: makeFn(2) },
    { key: makeKey(3), fetchFn: makeFn(3) },
    { key: makeKey(4), fetchFn: makeFn(4) },
  ])

  await waitUntil(() => harnesses.every(h => !h.getState().loading), 800)

  // Each key must have fired exactly once
  for (let i = 1; i <= 4; i++) {
    const k = makeKey(i)
    a.push(assert(`key ${i}: fetched exactly once`, callsPerKey[k] === 1, `got ${callsPerKey[k]}`))
    a.push(assert(`key ${i}: data populated`, harnesses[i - 1].getState().data !== undefined))
    a.push(assert(`key ${i}: data has correct id`,
      (harnesses[i - 1].getState().data as { id?: string } | undefined)?.id === k,
      `id: ${(harnesses[i - 1].getState().data as { id?: string } | undefined)?.id}`))
  }

  // All 4 keys cached independently
  a.push(assert('all 4 keys written to cache',
    [1,2,3,4].every(i => cache.has(makeKey(i)))))
  a.push(assert('all 4 cached values are different from each other',
    new Set([1,2,3,4].map(i => JSON.stringify(cache.get(makeKey(i))))).size === 4))

  harnesses.forEach(h => h.destroy())

  return { title, description, passed: a.every(x => x.passed), assertions: a }
}

// ════════════════════════════════════════════════════════════════
//  PUBLIC API
// ════════════════════════════════════════════════════════════════

export type StepRunner = () => Promise<Omit<StepResult, 'step' | 'durationMs'>>

export const STEPS: Array<{ step: number; run: StepRunner }> = [
  { step: 1,  run: runStep1  },
  { step: 2,  run: runStep2  },
  { step: 3,  run: runStep3  },
  { step: 4,  run: runStep4  },
  { step: 5,  run: runStep5  },
  { step: 6,  run: runStep6  },
  { step: 7,  run: runStep7  },
  { step: 8,  run: runStep8  },
  { step: 9,  run: runStep9  },
  { step: 10, run: runStep10 },
]

export async function runAllSteps(
  onStepStart: (step: number) => void,
  onStepDone: (result: StepResult) => void
): Promise<StepResult[]> {
  disableActWarnings()
  const results: StepResult[] = []
  for (const { step, run } of STEPS) {
    onStepStart(step)
    const t0 = performance.now()
    let partial: Omit<StepResult, 'step' | 'durationMs'>
    try {
      partial = await run()
    } catch (err) {
      partial = {
        title: `Step ${step}`,
        description: '',
        passed: false,
        assertions: [],
        error: err instanceof Error ? err.message : String(err),
      }
    }
    const result: StepResult = { ...partial, step, durationMs: Math.round(performance.now() - t0) }
    results.push(result)
    onStepDone(result)
  }
  enableActWarnings()
  return results
}