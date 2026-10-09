import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { aiService } from '../services/ai.service.js'
import { api } from '../services/http.js'
import {
  Card, CardHeader, Button, Badge, Alert, Field, Input,
  Textarea, Select, Spinner, EmptyState, cx
} from '../components/ui.jsx'

const ROLE_SUGGESTIONS = [
  'Full Stack Developer',
  'Backend Developer',
  'Frontend Developer',
  'DevOps Engineer',
  'AI / ML Engineer',
  'Software Engineer',
]

export default function ResumeAnalyzer() {
  const [inputMode, setInputMode] = useState('upload') // 'upload' | 'profile' | 'text'
  const [file, setFile] = useState(null)
  const [resumeText, setResumeText] = useState('')
  const [targetRole, setTargetRole] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')

  // Platform state
  const [storedResume, setStoredResume] = useState(null)
  const [jobsList, setJobsList] = useState([])
  const [loadingContext, setLoadingContext] = useState(true)

  // Execution state
  const [status, setStatus] = useState('idle') // 'idle' | 'analyzing' | 'result'
  const [loadingStage, setLoadingStage] = useState(0)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [error, setError] = useState(null)

  // Load user's existing profile resume & active platform jobs
  useEffect(() => {
    let mounted = true
    async function fetchPlatformData() {
      setLoadingContext(true)
      try {
        const [resumeRes, jobsRes] = await Promise.all([
          api.get('/profiles/me/resume').catch(() => null),
          api.get('/jobs', { params: { limit: 20 } }).catch(() => null),
        ])

        if (mounted) {
          if (resumeRes?.data) {
            setStoredResume(resumeRes.data)
          }
          const rawJobs = Array.isArray(jobsRes?.data) ? jobsRes.data : Array.isArray(jobsRes?.data?.jobs) ? jobsRes.data.jobs : Array.isArray(jobsRes) ? jobsRes : []
          setJobsList(rawJobs.filter((j) => String(j.status || '').toLowerCase() === 'published' || String(j.status || '').toLowerCase() === 'active'))
        }
      } catch {
        // Non-fatal
      } finally {
        if (mounted) setLoadingContext(false)
      }
    }
    fetchPlatformData()
    return () => { mounted = false }
  }, [])

  // Cycle UI loading stages during analysis
  useEffect(() => {
    if (status !== 'analyzing') {
      setLoadingStage(0)
      return
    }
    const interval = setInterval(() => {
      setLoadingStage((prev) => (prev < 3 ? prev + 1 : prev))
    }, 1200)
    return () => clearInterval(interval)
  }, [status])

  const stages = [
    'Reading resume document and extracting text...',
    'Extracting technical skills and evaluating ATS compatibility...',
    'Analyzing experience impact, metrics, and formatting...',
    'Comparing with target role and platform job requirements...',
  ]

  async function handleAnalyze(e) {
    if (e) e.preventDefault()
    setError(null)

    // Validation
    if (inputMode === 'upload' && !file) {
      setError('Please select a PDF or DOCX resume document.')
      return
    }
    if (inputMode === 'profile' && !storedResume) {
      setError('No stored resume found. Please upload a resume document first.')
      return
    }
    if (inputMode === 'text' && resumeText.trim().length < 20) {
      setError('Resume text must be at least 20 characters.')
      return
    }

    setStatus('analyzing')

    try {
      let payload
      if (inputMode === 'upload') {
        const form = new FormData()
        form.append('file', file)
        if (targetRole.trim()) form.append('targetRole', targetRole.trim())
        if (selectedJobId) form.append('jobId', selectedJobId)
        payload = form
      } else if (inputMode === 'profile') {
        payload = {
          useStoredResume: true,
          targetRole: targetRole.trim() || undefined,
          jobId: selectedJobId || undefined,
        }
      } else {
        payload = {
          resumeText: resumeText.trim(),
          targetRole: targetRole.trim() || undefined,
          jobId: selectedJobId || undefined,
        }
      }

      const res = await aiService.analyzeResume(payload)
      const data = res?.data || res
      setAnalysisResult(data)
      setStatus('result')
    } catch (err) {
      setError(err?.message || 'Failed to complete resume analysis. Please verify your file and try again.')
      setStatus('idle')
    }
  }

  function handleReset() {
    setAnalysisResult(null)
    setStatus('idle')
    setError(null)
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-swiss-border pb-6">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">
            11 &mdash; RESUME ANALYZER
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
            AI RESUME ANALYZER & ATS INTELLIGENCE
          </h1>
          <p className="mt-2 text-sm text-swiss-muted max-w-2xl">
            Upload your resume or analyze your active profile document. Run deterministic ATS diagnostics, detect technical skills, discover skill gaps, and match against real platform job postings.
          </p>
        </div>
        {status === 'result' && (
          <Button variant="secondary" onClick={handleReset}>
            ← Analyze Another Resume
          </Button>
        )}
      </header>

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* INPUT FORM VIEW */}
      {status === 'idle' && (
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Input Mode Selector */}
            <div className="flex border border-swiss-border rounded-sm bg-swiss-surface p-1 gap-1">
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className={cx(
                  'flex-1 py-2 text-xs font-mono tracking-wider uppercase rounded-sm transition-colors',
                  inputMode === 'upload' ? 'bg-swiss-accent text-white font-bold' : 'text-swiss-muted hover:text-swiss-text'
                )}
              >
                Upload Document
              </button>
              <button
                type="button"
                onClick={() => setInputMode('profile')}
                className={cx(
                  'flex-1 py-2 text-xs font-mono tracking-wider uppercase rounded-sm transition-colors',
                  inputMode === 'profile' ? 'bg-swiss-accent text-white font-bold' : 'text-swiss-muted hover:text-swiss-text'
                )}
              >
                Use Profile Resume
              </button>
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={cx(
                  'flex-1 py-2 text-xs font-mono tracking-wider uppercase rounded-sm transition-colors',
                  inputMode === 'text' ? 'bg-swiss-accent text-white font-bold' : 'text-swiss-muted hover:text-swiss-text'
                )}
              >
                Paste Text
              </button>
            </div>

            <Card className="p-6">
              {inputMode === 'upload' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-swiss-border rounded-sm p-10 hover:border-swiss-text transition-colors text-center">
                    <input
                      type="file"
                      accept=".pdf,.docx"
                      id="resume-file-input"
                      className="hidden"
                      onChange={(e) => {
                        const selected = e.target.files?.[0]
                        if (selected) {
                          setFile(selected)
                          setError(null)
                        }
                      }}
                    />
                    <label htmlFor="resume-file-input" className="cursor-pointer flex flex-col items-center">
                      <svg className="w-10 h-10 text-swiss-muted mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      {file ? (
                        <div className="space-y-1">
                          <p className="text-swiss-text font-semibold text-base">{file.name}</p>
                          <p className="text-xs font-mono text-swiss-label">
                            {(file.size / 1024).toFixed(1)} KB &bull; {file.type || 'Document'}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-swiss-text font-medium">Click to select or drag and drop resume</p>
                          <p className="text-xs font-mono text-swiss-label mt-1">Supported formats: PDF, DOCX (Max 5MB)</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              )}

              {inputMode === 'profile' && (
                <div className="space-y-4 py-2">
                  <div className="border border-swiss-border bg-swiss-surface-alt p-5 rounded-sm">
                    {loadingContext ? (
                      <div className="flex items-center gap-3 text-swiss-muted text-sm">
                        <Spinner /> Loading active profile resume details...
                      </div>
                    ) : storedResume ? (
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs uppercase px-2 py-0.5 bg-green-950/30 text-green-400 border border-green-800">
                              ACTIVE PROFILE RESUME
                            </span>
                            <span className="text-sm font-semibold text-swiss-text">
                              {storedResume.originalFilename || storedResume.fileName || 'Profile_Resume.pdf'}
                            </span>
                          </div>
                          <p className="text-xs text-swiss-muted font-mono">
                            Uploaded {new Date(storedResume.createdAt || storedResume.uploadedAt || Date.now()).toLocaleDateString()} &bull; {storedResume.byteSize ? `${Math.round(storedResume.byteSize / 1024)} KB` : 'Verified file'}
                          </p>
                        </div>
                        <Badge tone="green">READY</Badge>
                      </div>
                    ) : (
                      <div className="text-center py-4 space-y-3">
                        <p className="text-sm text-swiss-muted">No resume found on your profile.</p>
                        <Link to="/resume" className="inline-block text-xs font-mono text-swiss-accent underline">
                          Upload a resume in My Resume →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {inputMode === 'text' && (
                <div className="space-y-2">
                  <Field label="Resume Content Text" hint={`${resumeText.length} characters (min 20)`}>
                    <Textarea
                      rows={10}
                      placeholder="Paste your plain resume text, work experience bullets, skills, and education here..."
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </Card>
          </div>

          {/* Configuration & Options Column */}
          <div className="space-y-6">
            <Card className="p-6 space-y-5">
              <h3 className="text-sm font-bold tracking-tight text-swiss-text font-mono uppercase">
                TARGET ROLE & JOB
              </h3>

              <div className="space-y-2">
                <Field label="Target Role (Optional)" hint="Leave blank to auto-infer">
                  <Input
                    placeholder="e.g. Full Stack Developer"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                  />
                </Field>
                <div className="pt-1">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-swiss-label mb-2">
                    POPULAR ROLES:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ROLE_SUGGESTIONS.map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setTargetRole(role)}
                        className={cx(
                          'text-xs font-mono px-2 py-1 rounded-sm border transition-colors',
                          targetRole === role
                            ? 'border-swiss-accent bg-swiss-accent/10 text-swiss-accent'
                            : 'border-swiss-border text-swiss-muted hover:border-swiss-text hover:text-swiss-text'
                        )}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-swiss-border">
                <Field label="Compare Against Platform Job" hint="Optional real PostgreSQL job">
                  <Select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                  >
                    <option value="">-- General ATS & Platform Matching --</option>
                    {jobsList.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.title} &mdash; {job.companyName || job.company_name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <p className="text-xs text-swiss-muted">
                  Select a live posting to calculate job-specific requirements and skill gaps.
                </p>
              </div>

              <div className="pt-4">
                <Button
                  onClick={handleAnalyze}
                  className="w-full py-3 text-sm font-bold tracking-wider uppercase"
                  disabled={
                    (inputMode === 'upload' && !file) ||
                    (inputMode === 'profile' && !storedResume) ||
                    (inputMode === 'text' && resumeText.trim().length < 20)
                  }
                >
                  Run ATS Analysis →
                </Button>
              </div>
            </Card>

            <Card className="p-5 bg-swiss-surface-alt">
              <h4 className="text-xs font-mono uppercase tracking-widest text-swiss-label mb-2">
                ATS EVALUATION SIGNALS
              </h4>
              <ul className="text-xs space-y-2 text-swiss-muted">
                <li>&bull; <strong className="text-swiss-text">Section Completeness:</strong> Contact info, education, experience, projects, skills.</li>
                <li>&bull; <strong className="text-swiss-text">Skill Taxonomy:</strong> Detected technical stack vs target role benchmarks.</li>
                <li>&bull; <strong className="text-swiss-text">Measurable Metrics:</strong> Action verbs and quantified business impact.</li>
                <li>&bull; <strong className="text-swiss-text">Format Readability:</strong> Machine-parseable document structure.</li>
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* ANALYZING LOADING VIEW */}
      {status === 'analyzing' && (
        <Card className="p-16 max-w-2xl mx-auto text-center flex flex-col items-center justify-center space-y-6">
          <div className="w-12 h-12 border-4 border-swiss-border border-t-swiss-accent rounded-full animate-spin" />
          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-swiss-text uppercase">
              ANALYZING RESUME &bull; ATS INTELLIGENCE
            </h2>
            <p className="text-sm font-mono text-swiss-accent tracking-wide transition-all">
              {stages[loadingStage]}
            </p>
          </div>
          <div className="w-full max-w-md bg-swiss-border h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-swiss-accent h-full transition-all duration-700 ease-out"
              style={{ width: `${((loadingStage + 1) / stages.length) * 100}%` }}
            />
          </div>
          <p className="text-xs font-mono text-swiss-label">
            Running grounded analysis with strict zero-hallucination policies
          </p>
        </Card>
      )}

      {/* RESULTS DASHBOARD VIEW */}
      {status === 'result' && analysisResult && (
        <div className="space-y-8">
          {/* Top Scorecard Hero Tile */}
          <div className="grid gap-6 md:grid-cols-4">
            <Card className="p-6 md:col-span-2 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono uppercase tracking-widest text-swiss-label">
                    AI ATS COMPATIBILITY SCORE
                  </p>
                  <Badge tone={analysisResult.score >= 80 ? 'green' : analysisResult.score >= 60 ? 'amber' : 'red'}>
                    {analysisResult.score >= 80 ? 'STRONG MATCH' : analysisResult.score >= 60 ? 'COMPETITIVE' : 'NEEDS OPTIMIZATION'}
                  </Badge>
                </div>
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="text-5xl font-black tracking-tight text-swiss-text font-mono">
                    {analysisResult.score}
                  </span>
                  <span className="text-swiss-muted font-mono text-sm">/ 100</span>
                  <span className="text-xs font-mono px-2 py-0.5 bg-swiss-surface-alt border border-swiss-border rounded-sm text-swiss-muted ml-auto">
                    {analysisResult.atsCompatibility}% Match Rate
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-swiss-border h-2.5 rounded-full overflow-hidden">
                <div
                  className={cx(
                    'h-full transition-all duration-1000',
                    analysisResult.score >= 80 ? 'bg-green-500' : analysisResult.score >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  )}
                  style={{ width: `${analysisResult.score}%` }}
                />
              </div>

              {/* Inferred or target role info */}
              <div className="pt-2 border-t border-swiss-border flex items-center justify-between text-xs">
                <span className="text-swiss-muted font-mono uppercase">TARGET ROLE:</span>
                <span className="font-semibold text-swiss-text flex items-center gap-1.5">
                  {analysisResult.targetRole}
                  {analysisResult.isRoleInferred && (
                    <Badge tone="blue">AUTO-INFERRED</Badge>
                  )}
                </span>
              </div>
            </Card>

            {/* Signal Breakdown Tile */}
            <Card className="p-6 md:col-span-2 space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-widest text-swiss-label">
                DETERMINISTIC SIGNAL BREAKDOWN
              </h3>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                  <p className="text-[10px] font-mono text-swiss-label uppercase">SECTION COMPLETENESS</p>
                  <p className="text-lg font-bold font-mono text-swiss-text mt-1">
                    {analysisResult.breakdown?.sectionScore ?? 22} <span className="text-xs text-swiss-muted">/ 25</span>
                  </p>
                </div>
                <div className="border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                  <p className="text-[10px] font-mono text-swiss-label uppercase">SKILL COVERAGE</p>
                  <p className="text-lg font-bold font-mono text-swiss-text mt-1">
                    {analysisResult.breakdown?.skillScore ?? 28} <span className="text-xs text-swiss-muted">/ 35</span>
                  </p>
                </div>
                <div className="border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                  <p className="text-[10px] font-mono text-swiss-label uppercase">IMPACT & METRICS</p>
                  <p className="text-lg font-bold font-mono text-swiss-text mt-1">
                    {analysisResult.breakdown?.impactScore ?? 20} <span className="text-xs text-swiss-muted">/ 25</span>
                  </p>
                </div>
                <div className="border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                  <p className="text-[10px] font-mono text-swiss-label uppercase">ATS FORMATTING</p>
                  <p className="text-lg font-bold font-mono text-swiss-text mt-1">
                    {analysisResult.breakdown?.formattingScore ?? 14} <span className="text-xs text-swiss-muted">/ 15</span>
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Executive Summary */}
          {analysisResult.summary && (
            <Card className="p-5 border-l-4 border-l-swiss-accent">
              <h3 className="text-xs font-mono uppercase tracking-widest text-swiss-label mb-1">
                EXECUTIVE SUMMARY
              </h3>
              <p className="text-sm text-swiss-text leading-relaxed">
                {analysisResult.summary}
              </p>
            </Card>
          )}

          {/* Strengths & Improvements */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6 space-y-4">
              <h3 className="text-sm font-bold font-mono uppercase tracking-widest text-swiss-text flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                KEY CANDIDATE STRENGTHS
              </h3>
              <ul className="space-y-2.5 text-sm">
                {(analysisResult.strengths || []).map((s, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-swiss-text">
                    <span className="text-green-500 font-bold shrink-0">&check;</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="text-sm font-bold font-mono uppercase tracking-widest text-swiss-text flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                HIGH-IMPACT IMPROVEMENTS
              </h3>
              <div className="space-y-3">
                {(analysisResult.improvements || []).map((imp, idx) => (
                  <div key={idx} className="border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt text-xs space-y-1">
                    <div className="flex items-center justify-between font-mono font-bold text-swiss-accent">
                      <span>{imp.section || 'General'}</span>
                      {imp.issue && <span className="text-swiss-label font-normal">{imp.issue}</span>}
                    </div>
                    <p className="text-swiss-text">
                      {imp.recommendation || imp.advice}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Skills Breakdown */}
          <Card className="p-6 space-y-6">
            <CardHeader
              title="SKILL GAP & KEYWORD INTELLIGENCE"
              description={`Evaluation against ${analysisResult.targetRole} core requirements.`}
            />

            <div className="space-y-6 pt-2">
              {/* Detected Skills categorized */}
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-swiss-label mb-3">
                  DETECTED SKILLS IN RESUME
                </p>
                {analysisResult.skills?.categorized && Object.values(analysisResult.skills.categorized).some((arr) => arr.length > 0) ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    {analysisResult.skills.categorized.languages?.length > 0 && (
                      <div className="space-y-1.5 border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                        <span className="text-[10px] font-mono uppercase text-swiss-label">Languages</span>
                        <div className="flex flex-wrap gap-1.5">
                          {analysisResult.skills.categorized.languages.map((s) => (
                            <Badge key={s} tone="slate">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysisResult.skills.categorized.frameworks?.length > 0 && (
                      <div className="space-y-1.5 border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                        <span className="text-[10px] font-mono uppercase text-swiss-label">Frameworks</span>
                        <div className="flex flex-wrap gap-1.5">
                          {analysisResult.skills.categorized.frameworks.map((s) => (
                            <Badge key={s} tone="slate">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysisResult.skills.categorized.databases?.length > 0 && (
                      <div className="space-y-1.5 border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                        <span className="text-[10px] font-mono uppercase text-swiss-label">Databases</span>
                        <div className="flex flex-wrap gap-1.5">
                          {analysisResult.skills.categorized.databases.map((s) => (
                            <Badge key={s} tone="slate">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysisResult.skills.categorized.cloudDevops?.length > 0 && (
                      <div className="space-y-1.5 border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                        <span className="text-[10px] font-mono uppercase text-swiss-label">Cloud / DevOps</span>
                        <div className="flex flex-wrap gap-1.5">
                          {analysisResult.skills.categorized.cloudDevops.map((s) => (
                            <Badge key={s} tone="slate">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysisResult.skills.categorized.tools?.length > 0 && (
                      <div className="space-y-1.5 border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                        <span className="text-[10px] font-mono uppercase text-swiss-label">Developer Tools</span>
                        <div className="flex flex-wrap gap-1.5">
                          {analysisResult.skills.categorized.tools.map((s) => (
                            <Badge key={s} tone="slate">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysisResult.skills.categorized.aiData?.length > 0 && (
                      <div className="space-y-1.5 border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                        <span className="text-[10px] font-mono uppercase text-swiss-label">AI & Data</span>
                        <div className="flex flex-wrap gap-1.5">
                          {analysisResult.skills.categorized.aiData.map((s) => (
                            <Badge key={s} tone="slate">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(analysisResult.detectedSkills || analysisResult.skills?.detected || []).map((s) => (
                      <Badge key={s} tone="slate">{s}</Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Missing Skills */}
              <div className="pt-4 border-t border-swiss-border">
                <p className="text-xs font-mono uppercase tracking-widest text-swiss-label mb-2">
                  COMMONLY EXPECTED ADDITIONS FOR THIS ROLE
                </p>
                <div className="flex flex-wrap gap-2">
                  {(analysisResult.missingSkills || analysisResult.skills?.missing || analysisResult.recommendedSkills || []).map((s) => (
                    <Badge key={s} tone="amber">+ {s}</Badge>
                  ))}
                </div>
              </div>

              {/* Keywords */}
              {analysisResult.keywords && (
                <div className="pt-4 border-t border-swiss-border grid gap-4 md:grid-cols-2">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-swiss-label block mb-2">
                      FOUND KEYWORDS
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(analysisResult.keywords.found || []).map((kw) => (
                        <span key={kw} className="px-2 py-0.5 rounded-sm bg-green-950/20 border border-green-900/40 text-green-400 font-mono text-xs">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-swiss-label block mb-2">
                      RECOMMENDED KEYWORDS
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(analysisResult.keywords.missing || []).map((kw) => (
                        <span key={kw} className="px-2 py-0.5 rounded-sm bg-amber-950/20 border border-amber-900/40 text-amber-400 font-mono text-xs">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Section & Formatting Diagnostics */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="p-5 md:col-span-2 space-y-4">
              <h3 className="text-xs font-mono uppercase tracking-widest text-swiss-label">
                EXPERIENCE & PROJECT IMPACT FEEDBACK
              </h3>
              <div className="space-y-2 text-xs text-swiss-text">
                {(analysisResult.experienceAnalysis || []).map((item, idx) => (
                  <p key={idx} className="border-l-2 border-swiss-accent pl-3 py-0.5">
                    <strong>Experience:</strong> {item}
                  </p>
                ))}
                {(analysisResult.projectAnalysis || []).map((item, idx) => (
                  <p key={idx} className="border-l-2 border-swiss-border pl-3 py-0.5 text-swiss-muted">
                    <strong>Projects:</strong> {item}
                  </p>
                ))}
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <h3 className="text-xs font-mono uppercase tracking-widest text-swiss-label">
                FORMATTING & READABILITY
              </h3>
              <ul className="space-y-3 text-xs">
                {(analysisResult.formatting || []).map((f, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className={f.passed ? 'text-green-500 font-bold' : 'text-amber-500 font-bold'}>
                      {f.passed ? '✓' : '⚠'}
                    </span>
                    <span className={f.passed ? 'text-swiss-muted' : 'text-amber-300'}>
                      {f.label || f.name}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Specific Job Comparison or Matching Platform Jobs */}
          {analysisResult.jobComparison && (
            <Card className="p-6 space-y-4 border-l-4 border-l-green-500">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-swiss-label">
                    TARGET JOB MATCH ANALYSIS
                  </span>
                  <h3 className="text-lg font-bold text-swiss-text">
                    {analysisResult.jobComparison.title} &bull; {analysisResult.jobComparison.companyName}
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black font-mono text-green-400">
                    {analysisResult.jobComparison.matchScore}%
                  </span>
                  <span className="text-xs text-swiss-muted block">Match Fit</span>
                </div>
              </div>

              <p className="text-xs text-swiss-muted">
                {analysisResult.jobComparison.matchSummary}
              </p>

              <div className="grid gap-3 md:grid-cols-2 text-xs pt-2">
                <div className="border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                  <span className="text-[10px] font-mono uppercase text-green-400 block mb-1">Matching Requirements</span>
                  <div className="flex flex-wrap gap-1">
                    {(analysisResult.jobComparison.matchingSkills || []).map((s) => (
                      <Badge key={s} tone="green">{s}</Badge>
                    ))}
                  </div>
                </div>
                <div className="border border-swiss-border p-3 rounded-sm bg-swiss-surface-alt">
                  <span className="text-[10px] font-mono uppercase text-amber-400 block mb-1">Missing Requirements</span>
                  <div className="flex flex-wrap gap-1">
                    {(analysisResult.jobComparison.missingSkills || []).map((s) => (
                      <Badge key={s} tone="amber">{s}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Link to={`/jobs`}>
                  <Button size="sm" variant="secondary">View Job Details →</Button>
                </Link>
              </div>
            </Card>
          )}

          {/* Recommended Real Platform Jobs */}
          {!analysisResult.jobComparison && (analysisResult.recommendedJobs || []).length > 0 && (
            <Card className="p-6 space-y-4">
              <CardHeader
                title="MATCHING PLATFORM JOBS"
                description="Active job postings from the Alumni Network portal matching your detected profile."
              />
              <div className="grid gap-4 md:grid-cols-3 pt-2">
                {analysisResult.recommendedJobs.map((job) => (
                  <div key={job.id} className="border border-swiss-border p-4 rounded-sm bg-swiss-surface-alt flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-swiss-text">{job.title}</h4>
                        <span className="font-mono text-xs font-bold text-swiss-accent">{job.matchScore}%</span>
                      </div>
                      <p className="text-xs text-swiss-muted">{job.companyName} &bull; {job.location}</p>
                      <p className="text-[11px] text-swiss-label font-mono mt-2">{job.matchReason}</p>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-swiss-border">
                      <div className="flex flex-wrap gap-1">
                        {(job.matchingSkills || []).slice(0, 3).map((s) => (
                          <Badge key={s} tone="slate">{s}</Badge>
                        ))}
                      </div>
                      <Link to={`/jobs`} className="block">
                        <Button size="sm" variant="secondary" className="w-full text-xs">
                          View On Job Board
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
