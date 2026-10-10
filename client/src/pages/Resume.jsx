import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { resumes, ai } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field,
  Input, LoadingBlock, Spinner
} from '../components/ui.jsx'

export default function Resume() {
  const { user } = useAuth()
  const [resume, setResume] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [message, setMessage] = useState(null)

  async function loadResume() {
    setLoading(true)
    setError(null)
    try {
      const res = await resumes.get()
      setResume(res.data)
      setLoading(false)
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadResume()
  }, [user?.id])

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMessage(null)
    try {
      const res = await resumes.upload(file)
      setResume(res.data)
      setMessage({ tone: 'success', text: 'Resume uploaded and analyzed successfully!' })
      setAiAnalysis(null)
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to upload resume' })
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete() {
    if (!resume) return
    setUploading(true)
    try {
      await resumes.delete()
      setResume(null)
      setAiAnalysis(null)
      setMessage({ tone: 'info', text: 'Resume removed from your profile.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err.message })
    } finally {
      setUploading(false)
    }
  }

  async function triggerAiScan() {
    if (!resume) return
    setAnalyzing(true)
    try {
      const res = await ai.analyzeResume(resume.previewText)
      setAiAnalysis(res.data)
    } catch {
      setMessage({ tone: 'error', text: 'AI analysis failed. Try again.' })
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">
            05 &mdash; RESUME & ATS INTELLIGENCE
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
            MY RESUME
          </h1>
          <p className="mt-2 text-sm text-swiss-muted max-w-xl">
            Manage your active resume document, verify parsed technical skills, and run AI ATS diagnostics before applying to jobs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
            <Button as="span" variant="primary" disabled={uploading}>
              {uploading ? <><Spinner /> Uploading...</> : 'UPLOAD NEW RESUME →'}
            </Button>
          </label>
        </div>
      </header>

      {message && (
        <Alert tone={message.tone} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {loading ? (
        <Card><LoadingBlock rows={6} label="Loading resume metadata" /></Card>
      ) : error ? (
        <Card><ErrorState error={error} onRetry={loadResume} /></Card>
      ) : !resume ? (
        <Card className="p-10">
          <EmptyState
            title="NO RESUME UPLOADED"
            description="Upload your PDF resume to automatically parse skills and attach it to job applications across the alumni network."
            action={
              <label className="inline-flex cursor-pointer">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button as="span">SELECT PDF RESUME</Button>
              </label>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3 items-start">
          {/* Main Resume Details */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader
                title="ACTIVE RESUME FILE"
                description={`Uploaded on ${new Date(resume.uploadedAt).toLocaleDateString()} · ${resume.fileSize}`}
                actions={
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={triggerAiScan}
                      disabled={analyzing}
                    >
                      {analyzing ? <><Spinner /> ANALYZING...</> : 'RUN AI ATS SCAN'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={handleDelete}
                      disabled={uploading}
                    >
                      DELETE
                    </Button>
                  </div>
                }
              />
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex items-center justify-center bg-swiss-text text-swiss-base font-mono text-xs font-bold rounded-xs">
                      PDF
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-swiss-text">{resume.fileName}</p>
                      <p className="font-mono text-xs text-swiss-muted">{resume.fileSize} · Ready for 1-click applications</p>
                    </div>
                  </div>
                  <Badge tone="green">ACTIVE FILE</Badge>
                </div>

                <div>
                  <h3 className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">
                    PARSED TECHNICAL SKILLS
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {resume.parsedSkills?.map((skill) => (
                      <Badge key={skill} tone="slate">{skill}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">
                    EXTRACTED TEXT PREVIEW
                  </h3>
                  <pre className="font-mono text-xs leading-relaxed p-4 border border-swiss-border bg-swiss-surface-hover rounded-sm overflow-x-auto whitespace-pre-wrap text-swiss-text max-h-80">
                    {resume.previewText}
                  </pre>
                </div>
              </div>
            </Card>

            {/* AI Diagnostics Panel */}
            {aiAnalysis && (
              <Card className="border border-swiss-accent/40">
                <CardHeader
                  title="AI ATS AUDIT REPORT"
                  description="Detailed keyword matching and resume parser telemetry"
                  actions={<Badge tone="green">{aiAnalysis.matchRate} RELEVANCE</Badge>}
                />
                <div className="p-6 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                      <p className="font-mono text-[10px] text-swiss-label uppercase tracking-widest">
                        Grammar & Structure
                      </p>
                      <p className="mt-1 text-xs text-swiss-text font-medium">{aiAnalysis.grammarAndFormatting}</p>
                    </div>
                    <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm">
                      <p className="font-mono text-[10px] text-swiss-label uppercase tracking-widest">
                        Quantified Impact
                      </p>
                      <p className="mt-1 text-xs text-swiss-text font-medium">{aiAnalysis.impactAnalysis}</p>
                    </div>
                  </div>

                  <div>
                    <p className="font-mono text-[10px] text-swiss-label uppercase tracking-widest mb-1.5">
                      Missing High-Demand Keywords
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {aiAnalysis.missingSkills?.map((skill) => (
                        <Badge key={skill} tone="amber">+ {skill}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar Readiness Card */}
          <div className="space-y-6">
            <Card className="p-6">
              <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase">
                ATS SCORE READINESS
              </p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-black text-swiss-text">{resume.atsScore}</span>
                <span className="text-sm font-mono text-swiss-muted">/ 100</span>
              </div>
              <div className="mt-3 w-full bg-swiss-border h-2 rounded-xs overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-xs transition-all duration-500"
                  style={{ width: `${resume.atsScore}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-swiss-muted leading-relaxed">
                Your resume ranks in the top 15% of applicant resumes parsed this month.
              </p>

              <div className="mt-6 pt-6 border-t border-swiss-border space-y-4">
                <div>
                  <h4 className="font-mono text-[10px] text-swiss-label uppercase tracking-widest mb-2">
                    Key Strengths
                  </h4>
                  <ul className="space-y-1.5 text-xs text-swiss-text">
                    {resume.strengths?.map((s, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold">&check;</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="font-mono text-[10px] text-swiss-label uppercase tracking-widest mb-2">
                    Suggested Improvements
                  </h4>
                  <ul className="space-y-1.5 text-xs text-swiss-muted">
                    {resume.improvements?.map((imp, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-500 font-bold">→</span>
                        <span>{imp}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2">
                  <Link to="/job-readiness" className="w-full block">
                    <Button variant="secondary" className="w-full justify-center text-xs font-mono uppercase">
                      VIEW FULL JOB READINESS →
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
