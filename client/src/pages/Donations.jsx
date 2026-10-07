import { useEffect, useState } from 'react'
import { donations } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import {
  Alert, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field,
  Input, LoadingBlock, Select, Textarea, Spinner, cx
} from '../components/ui.jsx'

const PRESET_AMOUNTS = [1000, 5000, 15000, 25000, 50000]

export default function Donations() {
  const { user } = useAuth()
  const [funds, setFunds] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedFundId, setSelectedFundId] = useState('')
  const [amount, setAmount] = useState('5000')
  const [customAmount, setCustomAmount] = useState('')
  const [message, setMessage] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [donating, setDonating] = useState(false)
  const [statusMessage, setStatusMessage] = useState(null)
  const [activeReceipt, setActiveReceipt] = useState(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [fundsRes, historyRes] = await Promise.all([
        donations.funds(),
        donations.history(user?.id),
      ])
      setFunds(fundsRes.data || [])
      setHistory(historyRes.data || [])
      if (fundsRes.data?.length > 0 && !selectedFundId) {
        setSelectedFundId(fundsRes.data[0].id)
      }
      setLoading(false)
    } catch (err) {
      setError(err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user?.id])

  async function handleDonate(e) {
    e.preventDefault()
    const donationAmount = amount === 'custom' ? Number(customAmount) : Number(amount)
    if (!donationAmount || donationAmount <= 0) {
      setStatusMessage({ tone: 'error', text: 'Please enter a valid donation amount.' })
      return
    }

    setDonating(true)
    setStatusMessage(null)
    try {
      const res = await donations.donate({
        fundId: selectedFundId,
        amount: donationAmount,
        message,
        isAnonymous,
      })
      setStatusMessage({ tone: 'success', text: res.message })
      setActiveReceipt(res.data)
      setMessage('')
      loadData()
    } catch (err) {
      setStatusMessage({ tone: 'error', text: err.message || 'Donation processing failed.' })
    } finally {
      setDonating(false)
    }
  }

  const selectedFund = funds.find((f) => f.id === selectedFundId) || funds[0]

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">
            06 &mdash; ALUMNI GIVING & ENDOWMENTS
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-swiss-text">
            ALUMNI GIVING PORTAL
          </h1>
          <p className="mt-2 text-sm text-swiss-muted max-w-2xl">
            Give back to Vidyalankar Institute of Technology. Support student scholarships, research lab equipment, and student emergency welfare. Eligible for Section 80G tax benefits.
          </p>
        </div>
      </header>

      {statusMessage && (
        <Alert tone={statusMessage.tone} onDismiss={() => setStatusMessage(null)}>
          {statusMessage.text}
        </Alert>
      )}

      {loading ? (
        <Card><LoadingBlock rows={6} label="Loading donation funds" /></Card>
      ) : error ? (
        <Card><ErrorState error={error} onRetry={loadData} /></Card>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3 items-start">
          {/* Main Donation Form & Funds */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader
                title="MAKE A CONTRIBUTION"
                description="Select an initiative and choose your contribution tier"
              />
              <form onSubmit={handleDonate} className="p-6 space-y-6">
                <Field label="Select Endowment Fund" required>
                  <Select
                    value={selectedFundId}
                    onChange={(e) => setSelectedFundId(e.target.value)}
                  >
                    {funds.map((fund) => (
                      <option key={fund.id} value={fund.id}>
                        {fund.name} (Goal: ₹{(fund.goal / 100000).toFixed(1)}L)
                      </option>
                    ))}
                  </Select>
                </Field>

                {selectedFund && (
                  <div className="p-4 border border-swiss-border bg-swiss-surface rounded-sm space-y-3">
                    <p className="text-xs text-swiss-muted leading-relaxed">
                      {selectedFund.description}
                    </p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-swiss-label">RAISED SO FAR:</span>
                        <span className="font-bold text-swiss-text">
                          ₹{selectedFund.raised.toLocaleString()} / ₹{selectedFund.goal.toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full bg-swiss-border h-1.5 rounded-xs overflow-hidden">
                        <div
                          className="bg-swiss-text h-full rounded-xs"
                          style={{ width: `${Math.min(100, Math.round((selectedFund.raised / selectedFund.goal) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Amount Selection */}
                <div>
                  <label className="block mb-2 font-mono text-[10px] tracking-widest text-swiss-label uppercase">
                    CONTRIBUTION AMOUNT (INR)*
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                    {PRESET_AMOUNTS.map((amt) => {
                      const isSelected = amount === String(amt)
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => { setAmount(String(amt)); setCustomAmount(''); }}
                          className={cx(
                            'py-2 px-3 text-xs font-mono font-medium rounded-sm border transition-colors',
                            isSelected
                              ? 'bg-swiss-text text-swiss-base border-swiss-text font-bold'
                              : 'bg-transparent text-swiss-text border-swiss-border hover:bg-swiss-surface-hover'
                          )}
                        >
                          ₹{amt.toLocaleString()}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setAmount('custom')}
                    className={cx(
                      'text-xs font-mono underline uppercase tracking-wider',
                      amount === 'custom' ? 'font-bold text-swiss-text' : 'text-swiss-muted'
                    )}
                  >
                    Or enter a custom amount &rarr;
                  </button>

                  {amount === 'custom' && (
                    <div className="mt-3 max-w-xs">
                      <Input
                        type="number"
                        placeholder="Enter amount in ₹"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        min="100"
                        required
                      />
                    </div>
                  )}
                </div>

                <Field label="Donor Message (Optional)" hint="Words of encouragement for scholars">
                  <Textarea
                    rows={2}
                    placeholder="e.g. Proud to support our future engineers!"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </Field>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="anonymousCheck"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="rounded-xs border-swiss-border"
                  />
                  <label htmlFor="anonymousCheck" className="text-xs text-swiss-muted cursor-pointer">
                    Display my donation anonymously on public donor honor rolls
                  </label>
                </div>

                <div className="pt-4 border-t border-swiss-border flex flex-wrap items-center justify-between gap-4">
                  <Button type="submit" disabled={donating} size="lg">
                    {donating ? <><Spinner /> PROCESSING GIFT...</> : 'COMPLETE CONTRIBUTION &rarr;'}
                  </Button>
                  <p className="text-[10px] font-mono text-swiss-label uppercase tracking-widest">
                    SECURE SIMULATED 80G TRANSACTION
                  </p>
                </div>
              </form>
            </Card>

            {/* Receipt Modal/View if newly completed */}
            {activeReceipt && (
              <Card className="border-2 border-emerald-500/50 bg-emerald-950/10 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge tone="green">TAX RECEIPT GENERATED</Badge>
                    <h3 className="text-lg font-bold text-swiss-text mt-2">
                      Receipt #{activeReceipt.receiptNumber}
                    </h3>
                    <p className="font-mono text-xs text-swiss-muted">
                      80G Certificate: {activeReceipt.taxExemption80G}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => window.print()}>
                    PRINT RECEIPT
                  </Button>
                </div>
                <div className="mt-4 p-4 border border-swiss-border bg-swiss-surface rounded-sm font-mono text-xs space-y-1">
                  <p><span className="text-swiss-label">Donor:</span> {activeReceipt.donorName} ({activeReceipt.donorEmail})</p>
                  <p><span className="text-swiss-label">Fund:</span> {activeReceipt.fundName}</p>
                  <p><span className="text-swiss-label">Amount:</span> ₹{activeReceipt.amount.toLocaleString()}</p>
                  <p><span className="text-swiss-label">Date:</span> {new Date(activeReceipt.date).toLocaleString()}</p>
                </div>
              </Card>
            )}
          </div>

          {/* Sidebar Donation History */}
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="YOUR GIVING HISTORY"
                description="Tax deductible donations on record"
              />
              {history.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="NO DONATIONS RECORDED"
                    description="Your contribution history will be listed here with receipts."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-swiss-border">
                  {history.map((d) => (
                    <li key={d.id} className="p-4 space-y-1.5 hover:bg-swiss-surface-hover transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-sm text-swiss-text">
                          ₹{d.amount.toLocaleString()}
                        </span>
                        <Badge tone="green">80G VERIFIED</Badge>
                      </div>
                      <p className="text-xs text-swiss-muted truncate" title={d.fundName}>
                        {d.fundName}
                      </p>
                      <div className="flex items-center justify-between text-[10px] font-mono text-swiss-label">
                        <span>{new Date(d.date).toLocaleDateString()}</span>
                        <span>{d.receiptNumber}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5 space-y-3">
              <h4 className="font-mono text-[10px] tracking-widest text-swiss-label uppercase">
                TAX BENEFITS UNDER 80G
              </h4>
              <p className="text-xs text-swiss-muted leading-relaxed">
                All donations made to the Vidyalankar Institute of Technology Endowment Fund qualify for 50% deduction under Section 80G of the Indian Income Tax Act.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
