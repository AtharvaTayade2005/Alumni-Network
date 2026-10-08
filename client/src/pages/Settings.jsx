import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { notifications, auth, profiles } from '../services/api.js'
import { Card, Button, Checkbox, Field, Input, Select, Alert, Spinner } from '../components/ui.jsx'

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('account')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  // Account State
  const [language, setLanguage] = useState('en')

  // Notification Preferences State
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [inAppEnabled, setInAppEnabled] = useState(true)
  const [mutedMessages, setMutedMessages] = useState(false)
  const [mutedConnections, setMutedConnections] = useState(false)
  const [mutedMentorship, setMutedMentorship] = useState(false)
  const [mutedEvents, setMutedEvents] = useState(false)

  // Security State
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const TABS = [
    { id: 'account', label: 'Account' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'security', label: 'Security' },
  ]

  useEffect(() => {
    async function loadPreferences() {
      if (activeTab === 'notifications') {
        setLoading(true)
        try {
          const res = await notifications.preferences()
          const pref = res.data || {}
          setEmailEnabled(pref.emailEnabled ?? true)
          setInAppEnabled(pref.inAppEnabled ?? true)
          const muted = pref.mutedTypes || []
          setMutedMessages(muted.includes('message_received'))
          setMutedConnections(muted.includes('connection_request'))
          setMutedMentorship(muted.includes('mentorship_request'))
          setMutedEvents(muted.includes('event_reminder'))
        } catch {
          // Keep defaults
        } finally {
          setLoading(false)
        }
      }
    }
    loadPreferences()
  }, [activeTab])

  const handleSaveAccount = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await profiles.updatePrivacy({ isProfilePublic: true })
      setMessage({ tone: 'success', text: 'Account preferences updated successfully.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to update account preferences.' })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotifications = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const mutedTypes = []
      if (mutedMessages) mutedTypes.push('message_received')
      if (mutedConnections) mutedTypes.push('connection_request')
      if (mutedMentorship) mutedTypes.push('mentorship_request')
      if (mutedEvents) mutedTypes.push('event_reminder')

      await notifications.updatePreferences({
        emailEnabled,
        inAppEnabled,
        mutedTypes,
      })
      setMessage({ tone: 'success', text: 'Notification preferences saved to server.' })
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to save notification preferences.' })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSecurity = async (e) => {
    e.preventDefault()
    if (!currentPassword) {
      setMessage({ tone: 'error', text: 'Please enter your current password.' })
      return
    }
    if (newPassword.length < 10) {
      setMessage({ tone: 'error', text: 'New password must be at least 10 characters with upper, lower, digit and symbol.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ tone: 'error', text: 'New passwords do not match.' })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      await auth.changePassword({ currentPassword, newPassword })
      setMessage({ tone: 'success', text: 'Password successfully changed.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setMessage({ tone: 'error', text: err.message || 'Failed to change password.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="mb-4">
        <p className="font-mono text-[10px] tracking-widest text-swiss-label uppercase mb-2">09 &mdash; SETTINGS</p>
        <h1 className="text-3xl font-bold tracking-tight text-swiss-text">SETTINGS</h1>
        <p className="mt-2 text-sm text-swiss-muted">
          Manage your account preferences, security, and notification behaviors.
        </p>
      </header>

      <div className="flex flex-col md:flex-row gap-8">
        <nav className="w-full md:w-48 flex flex-col gap-1 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setMessage(null); }}
              className={`text-left px-3 py-2 text-sm font-medium rounded-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-swiss-surface text-swiss-text border-l-2 border-swiss-text'
                  : 'text-swiss-muted hover:bg-swiss-surface hover:text-swiss-text border-l-2 border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex-1">
          <Card className="p-6">
            {message ? <Alert tone={message.tone} className="mb-6">{message.text}</Alert> : null}

            {activeTab === 'account' && (
              <form onSubmit={handleSaveAccount} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-swiss-text mb-4">Account Information</h2>
                  <div className="space-y-4">
                    <Field label="Email Address">
                      <Input defaultValue={user?.email || ''} readOnly className="bg-[var(--color-swiss-surface-alt)] font-mono text-xs" />
                    </Field>
                    <Field label="User ID">
                      <Input defaultValue={user?.id || ''} readOnly className="bg-[var(--color-swiss-surface-alt)] font-mono text-xs" />
                    </Field>
                    <Field label="Language Preference">
                      <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                        <option value="en">English (US)</option>
                        <option value="en-in">English (India)</option>
                      </Select>
                    </Field>
                  </div>
                </div>
                <div className="pt-4 border-t border-swiss-border">
                  <Button type="submit" disabled={saving}>
                    {saving ? <><Spinner /> Saving changes...</> : 'Save changes'}
                  </Button>
                </div>
              </form>
            )}

            {activeTab === 'notifications' && (
              <form onSubmit={handleSaveNotifications} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-swiss-text mb-4">Notification Channels & Alerts</h2>
                  {loading ? (
                    <p className="text-sm text-swiss-muted font-mono">Loading notification preferences...</p>
                  ) : (
                    <div className="space-y-4">
                      <Checkbox
                        label="Email Notifications"
                        description="Receive digests and direct action alerts via email."
                        checked={emailEnabled}
                        onChange={(e) => setEmailEnabled(e.target.checked)}
                      />
                      <Checkbox
                        label="In-App Notifications"
                        description="Display alerts in the top bar bell dropdown."
                        checked={inAppEnabled}
                        onChange={(e) => setInAppEnabled(e.target.checked)}
                      />

                      <div className="pt-4 border-t border-swiss-border space-y-3">
                        <p className="font-mono text-[10px] text-swiss-label uppercase tracking-widest">Mute Specific Notification Types:</p>
                        <Checkbox
                          label="Mute Direct Messages"
                          description="Do not alert on incoming direct chats."
                          checked={mutedMessages}
                          onChange={(e) => setMutedMessages(e.target.checked)}
                        />
                        <Checkbox
                          label="Mute Connection Requests"
                          description="Do not alert on alumni network requests."
                          checked={mutedConnections}
                          onChange={(e) => setMutedConnections(e.target.checked)}
                        />
                        <Checkbox
                          label="Mute Mentorship Alerts"
                          description="Do not alert on incoming mentee requests."
                          checked={mutedMentorship}
                          onChange={(e) => setMutedMentorship(e.target.checked)}
                        />
                        <Checkbox
                          label="Mute Event Reminders"
                          description="Do not alert on upcoming event schedules."
                          checked={mutedEvents}
                          onChange={(e) => setMutedEvents(e.target.checked)}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="pt-4 border-t border-swiss-border">
                  <Button type="submit" disabled={saving || loading}>
                    {saving ? <><Spinner /> Saving preferences...</> : 'Save preferences'}
                  </Button>
                </div>
              </form>
            )}

            {activeTab === 'security' && (
              <form onSubmit={handleSaveSecurity} className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-swiss-text mb-4">Change Password</h2>
                  <div className="space-y-4 max-w-sm">
                    <Field label="Current password" required>
                      <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                      />
                    </Field>
                    <Field label="New password (min 10 chars, uppercase, digit, symbol)" required>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                    </Field>
                    <Field label="Confirm new password" required>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </Field>
                  </div>
                </div>
                <div className="pt-4 border-t border-swiss-border">
                  <Button type="submit" disabled={saving}>
                    {saving ? <><Spinner /> Updating password...</> : 'Update password'}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
