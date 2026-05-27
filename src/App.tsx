import React, { useState, useEffect, useCallback } from 'react'
import { runAllSteps, StepResult } from './runner/testRunner'

const TOTAL_SECONDS = 45 * 60

type StepStatus = 'idle' | 'running' | 'pass' | 'fail'

interface StepState {
  status: StepStatus
  result?: StepResult
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export default function App() {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS)
  const [locked, setLocked] = useState(false)
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<Record<number, StepState>>({})
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  // Timer
  useEffect(() => {
    if (locked) return
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { clearInterval(id); setLocked(true); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [locked])

  const mins = pad(Math.floor(secondsLeft / 60))
  const secs = pad(secondsLeft % 60)
  const timerWarn = secondsLeft <= 300

  const totalPassed = Object.values(steps).filter(s => s.status === 'pass').length
  const totalDone = Object.values(steps).filter(s => s.status === 'pass' || s.status === 'fail').length
  const allDone = totalDone === 10

  const handleVerify = useCallback(async () => {
    if (running || locked) return
    setRunning(true)
    setSteps({})
    setExpandedStep(null)

    await runAllSteps(
      (step) => {
        setSteps(prev => ({ ...prev, [step]: { status: 'running' } }))
      },
      (result) => {
        setSteps(prev => ({
          ...prev,
          [result.step]: { status: result.passed ? 'pass' : 'fail', result },
        }))
        if (!result.passed) setExpandedStep(s => s ?? result.step)
      }
    )

    setRunning(false)
  }, [running, locked])

  return (
    <div style={s.shell}>
      {/* ── Top bar ── */}
      <header style={s.topbar}>
        <div style={s.topLeft}>
          <span style={s.titleText}>useQuery</span>
          <span style={s.badgePurple}>SDE-2 · React · TypeScript</span>
          <span style={s.badgeAmber}>45 min</span>
        </div>
        <div style={s.topRight}>
          {allDone && (
            <span style={s.scoreChip}>
              {totalPassed} / 10 steps passed
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16 }}>
            <span style={s.timerLabel}>time remaining</span>
            <span style={{ ...s.timer, color: timerWarn ? '#a32d2d' : '#1c1c1a' }}>
              {mins}:{secs}
            </span>
          </div>
          <button
            style={{
              ...s.verifyBtn,
              opacity: running || locked ? 0.5 : 1,
              cursor: running || locked ? 'not-allowed' : 'pointer',
            }}
            onClick={handleVerify}
            disabled={running || locked}
          >
            {running ? '⟳ Verifying…' : '▶ Verify'}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={s.body}>
        {/* Left: instructions */}
        <aside style={s.sidebar}>
          <Section title="Your task">
            <p style={s.prose}>
              Implement <Code>useQuery(key, fetchFn)</Code> inside{' '}
              <Code>src/hooks/useQuery.ts</Code>. That is the{' '}
              <strong>only file you should edit</strong>.
            </p>
          </Section>

          <Section title="Requirements">
            {STEP_META.map(m => (
              <div key={m.step} style={s.reqRow}>
                <span style={s.stepNum}>{m.step}</span>
                <div>
                  <div style={s.reqTitle}>{m.title}</div>
                  <div style={s.reqDesc}>{m.desc}</div>
                </div>
              </div>
            ))}
          </Section>

          <Section title="Hints">
            <ul style={s.hintList}>
              {HINTS.map((h, i) => <li key={i} style={s.hint}>{h}</li>)}
            </ul>
          </Section>

          <Section title="How to run">
            <div style={s.termBox}>
              <pre style={s.termPre}>{`npm run dev\n# edit src/hooks/useQuery.ts\n# click Verify in the top bar`}</pre>
            </div>
          </Section>
        </aside>

        {/* Right: test results */}
        <main style={s.main}>
          <div style={s.resultsHeader}>
            <span style={s.resultsTitle}>Test results</span>
            {allDone && (
              <span style={{
                ...s.scorePill,
                background: totalPassed === 10 ? '#eaf3de' : totalPassed >= 6 ? '#faeeda' : '#fcebeb',
                color: totalPassed === 10 ? '#27500a' : totalPassed >= 6 ? '#633806' : '#791f1f',
              }}>
                {totalPassed} / 10
              </span>
            )}
          </div>

          {Object.keys(steps).length === 0 && !running && (
            <div style={s.emptyState}>
              <span style={s.emptyIcon}>◎</span>
              <p style={s.emptyText}>Click <strong>Verify</strong> to run all 10 test steps</p>
              <p style={{ ...s.emptyText, fontSize: 12, marginTop: 4 }}>Results appear here as each step completes</p>
            </div>
          )}

          <div style={s.stepList}>
            {STEP_META.map(meta => {
              const state = steps[meta.step]
              const status: StepStatus = state?.status ?? 'idle'
              const result = state?.result
              const isExpanded = expandedStep === meta.step
              const hasFail = result && !result.passed

              return (
                <div key={meta.step} style={{
                  ...s.stepCard,
                  borderColor: status === 'pass'
                    ? '#9FE1CB'
                    : status === 'fail' ? '#F09595'
                    : status === 'running' ? '#85B7EB'
                    : '#e0ddd8',
                }}>
                  {/* Step header row */}
                  <div
                    style={{ ...s.stepHeader, cursor: result ? 'pointer' : 'default' }}
                    onClick={() => result && setExpandedStep(isExpanded ? null : meta.step)}
                  >
                    <div style={s.stepLeft}>
                      <StatusIcon status={status} />
                      <div>
                        <div style={s.stepCardTitle}>
                          <span style={s.stepLabel}>Step {meta.step}</span>
                          {meta.title}
                        </div>
                        <div style={s.stepCardDesc}>{meta.desc}</div>
                      </div>
                    </div>
                    <div style={s.stepRight}>
                      {result && (
                        <span style={s.durationText}>{result.durationMs}ms</span>
                      )}
                      {status === 'pass' && <span style={s.passChip}>pass</span>}
                      {status === 'fail' && <span style={s.failChip}>fail</span>}
                      {status === 'running' && <span style={s.runChip}>running</span>}
                      {result && (
                        <span style={s.chevron}>{isExpanded ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </div>

                  {/* Assertion drill-down */}
                  {isExpanded && result && (
                    <div style={s.assertionList}>
                      {result.error && (
                        <div style={s.errorBanner}>
                          <span style={{ fontWeight: 500 }}>Uncaught error: </span>
                          {result.error}
                        </div>
                      )}
                      {result.assertions.map((a, i) => (
                        <div key={i} style={s.assertionRow}>
                          <span style={{ color: a.passed ? '#3b6d11' : '#a32d2d', fontSize: 13, flexShrink: 0 }}>
                            {a.passed ? '✓' : '✗'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ ...s.assertLabel, color: a.passed ? '#1c1c1a' : '#a32d2d' }}>
                              {a.label}
                            </span>
                            {a.detail && !a.passed && (
                              <div style={s.assertDetail}>{a.detail}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </main>
      </div>

      {/* Time's up overlay */}
      {locked && (
        <div style={s.overlay}>
          <div style={s.overlayBox}>
            <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 8 }}>Time's up</h2>
            <p style={{ color: '#6b6b68', fontSize: 13, lineHeight: 1.7 }}>
              45 minutes have elapsed. Your implementation is now locked.
              <br />Final score: <strong>{totalPassed} / 10 steps</strong>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={s.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code style={s.inlineCode}>{children}</code>
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'pass') return <span style={{ color: '#3b6d11', fontSize: 16, flexShrink: 0 }}>✓</span>
  if (status === 'fail') return <span style={{ color: '#a32d2d', fontSize: 16, flexShrink: 0 }}>✗</span>
  if (status === 'running') return <span style={{ color: '#185fa5', fontSize: 14, flexShrink: 0 }}>⟳</span>
  return <span style={{ color: '#b4b2a9', fontSize: 14, flexShrink: 0 }}>○</span>
}

// ── Static data ──────────────────────────────────────────────────

const STEP_META = [
  { step: 1, title: 'Basic state lifecycle',        desc: 'loading → data/error, no setState after unmount' },
  { step: 2, title: 'Cache by key',                 desc: 'Same key returns cached data instantly, zero re-fetch' },
  { step: 3, title: 'Stale-while-revalidate',       desc: 'Stale data shown immediately, background refetch updates' },
  { step: 4, title: 'Request deduplication',        desc: '2-3 simultaneous mounts fire exactly one request' },
  { step: 5, title: 'Key change mid-lifecycle',     desc: 'Switching key triggers new fetch, old data not leaked' },
  { step: 6, title: 'Error handling edge cases',    desc: 'Failed fetch skips cache, inFlight cleaned, errors propagate' },
  { step: 7, title: 'Race condition',               desc: 'Rapid key switching — last key wins, no stale overwrite' },
  { step: 8,  title: 'SWR robustness',                    desc: 'Stale survives failed refetch, unstable fetchFn ref safe' },
  { step: 9,  title: 'SWR + dedup interaction',            desc: 'Two stale-cache mounts share exactly one background refetch' },
  { step: 10, title: 'StrictMode compatibility',           desc: 'Effect double-invoke must not break fetch count or state' },
]

const HINTS = [
  'Use [key] as the only useEffect dependency — not fetchFn.',
  'Initialise data state from cache: useState(() => cache.get(key)).',
  'Use useRef to guard setState after unmount.',
  'Check inFlight before calling fetchFn — attach .then() if already pending.',
  'Delete inFlight key in BOTH .then() and .catch().',
  'Never write to cache on a failed fetch.',
]

// ── Styles ───────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  shell: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  topbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 20px', background: '#ffffff',
    borderBottom: '0.5px solid #e0ddd8', position: 'sticky', top: 0, zIndex: 10,
  },
  topLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  topRight: { display: 'flex', alignItems: 'center', gap: 10 },
  titleText: { fontWeight: 500, fontSize: 15, fontFamily: 'monospace' },
  badgePurple: { fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#eeedfe', color: '#3c3489', fontWeight: 500 },
  badgeAmber: { fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#faeeda', color: '#633806', fontWeight: 500 },
  timerLabel: { fontSize: 11, color: '#9a9993' },
  timer: { fontSize: 15, fontWeight: 500, fontFamily: 'monospace', minWidth: 54 },
  verifyBtn: {
    padding: '7px 16px', background: '#3c3489', color: '#eeedfe',
    border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500,
    transition: 'background 0.15s', marginLeft: 8,
  },
  scoreChip: { fontSize: 12, padding: '3px 10px', borderRadius: 20, background: '#f1efe8', color: '#444441', fontWeight: 500 },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: {
    width: 300, flexShrink: 0, padding: '20px 18px',
    borderRight: '0.5px solid #e0ddd8', overflowY: 'auto',
    background: '#faf9f7',
  },
  main: { flex: 1, padding: '20px 24px', overflowY: 'auto' },
  sectionTitle: { fontSize: 11, fontWeight: 500, color: '#9a9993', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 },
  prose: { fontSize: 13, color: '#444441', lineHeight: 1.6 },
  inlineCode: { fontFamily: 'monospace', fontSize: 11, background: '#eeedfe', color: '#3c3489', padding: '1px 5px', borderRadius: 3 },
  reqRow: { display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  stepNum: {
    flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
    background: '#e0ddd8', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 10, fontWeight: 500, color: '#444441', marginTop: 1,
  },
  reqTitle: { fontSize: 12, fontWeight: 500, color: '#1c1c1a' },
  reqDesc: { fontSize: 11, color: '#9a9993', marginTop: 2 },
  hintList: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 },
  hint: { fontSize: 12, color: '#6b6b68', lineHeight: 1.5, paddingLeft: 14, position: 'relative' },
  termBox: { background: '#1c1c1a', borderRadius: 7, overflow: 'hidden' },
  termPre: { padding: '12px 14px', fontSize: 11.5, color: '#9FE1CB', lineHeight: 1.7, fontFamily: 'monospace' },
  resultsHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  resultsTitle: { fontSize: 14, fontWeight: 500 },
  scorePill: { fontSize: 12, padding: '3px 10px', borderRadius: 20, fontWeight: 500 },
  stepList: { display: 'flex', flexDirection: 'column', gap: 8 },
  stepCard: {
    background: '#ffffff', border: '0.5px solid #e0ddd8',
    borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s',
  },
  stepHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', gap: 12 },
  stepLeft: { display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 },
  stepRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  stepCardTitle: { fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 },
  stepCardDesc: { fontSize: 11, color: '#9a9993', marginTop: 2 },
  stepLabel: { fontSize: 10, color: '#9a9993', fontWeight: 400 },
  durationText: { fontSize: 11, color: '#b4b2a9', fontFamily: 'monospace' },
  passChip: { fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#eaf3de', color: '#27500a', fontWeight: 500 },
  failChip: { fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#fcebeb', color: '#791f1f', fontWeight: 500 },
  runChip: { fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#e6f1fb', color: '#0c447c', fontWeight: 500 },
  chevron: { fontSize: 10, color: '#9a9993' },
  assertionList: { borderTop: '0.5px solid #f1efe8', padding: '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 7, background: '#faf9f7' },
  errorBanner: { fontSize: 12, color: '#a32d2d', background: '#fcebeb', borderRadius: 5, padding: '7px 10px', fontFamily: 'monospace', marginBottom: 6 },
  assertionRow: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  assertLabel: { fontSize: 12, lineHeight: 1.5 },
  assertDetail: { fontSize: 11, color: '#a32d2d', fontFamily: 'monospace', marginTop: 2 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: 8 },
  emptyIcon: { fontSize: 28, color: '#d3d1c7' },
  emptyText: { fontSize: 13, color: '#9a9993' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  overlayBox: { background: '#fff', border: '0.5px solid #e0ddd8', borderRadius: 12, padding: '28px 36px', maxWidth: 340, textAlign: 'center' },
}
