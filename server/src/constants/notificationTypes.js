/**
 * The notification vocabulary.
 *
 * This list is the single answer to "what kinds of notification are there". It
 * matches the `notifications_type_check` constraint that migration 013 leaves in
 * place, and the two are kept in step deliberately: the constraint is what stops a
 * bad row reaching a real inbox, and this list is what lets the API refuse the
 * same mistake at the edge with a useful message instead of a constraint name.
 *
 * It is the constraint's list, not the product's: `donation_confirmation` is in
 * here because the column accepts it, even though donations are out of scope for
 * this phase. Validating against a shorter list would reject a value the schema
 * already allows, which is the kind of disagreement that only shows up in
 * production.
 */
export const NOTIFICATION_TYPES = [
  'mentorship_request',
  'mentorship_accepted',
  'mentorship_declined',
  'mentorship_ended',
  'connection_request',
  'connection_accepted',
  'new_message',
  'message',
  'profile_view',
  'job_posted',
  'new_job_match',
  'application_received',
  'application_status',
  'job_application_update',
  'job_moderated',
  'event_rsvp',
  'event_reminder',
  'event_cancelled',
  'event_updated',
  'donation_confirmation',
  'admin_notice',
  'verification_result',
  'system',
]

const KNOWN = new Set(NOTIFICATION_TYPES)

export function isNotificationType(value) {
  return KNOWN.has(value)
}

/**
 * Notification preferences, in the shape the API speaks.
 *
 * The row is stored in snake_case like the rest of the schema; the client gets
 * camelCase, because every other endpoint in this API speaks camelCase and a
 * preferences screen is the one place that would notice.
 */
export function formatPreferences(row) {
  if (!row) return null
  return {
    userId: row.user_id,
    emailEnabled: row.email_enabled,
    inAppEnabled: row.in_app_enabled,
    mutedTypes: row.muted_types ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}