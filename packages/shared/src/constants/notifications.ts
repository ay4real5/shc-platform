/** Notification types. Titles and bodies must never contain personal details — the app loads those after sign-in. */
export const NOTIFICATION_TYPES = [
  'credential_expiry',
  'message_received',
  'document_signature',
  'time_off_decided',
  /** A new job application arrived (S1-04) — for people who manage recruitment. */
  'application_received',
  /** Supervision, appraisal or spot check: booked for tomorrow, overdue, or a record to read and sign (S3-04). */
  'supervision',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Alerts nobody can switch off (security and serious-incident alerts, D-066). */
export const MANDATORY_NOTIFICATION_TYPES: readonly NotificationType[] = ['system'];

/** Delivery channels. In-app always; push, SMS and email once the agency's accounts are connected (D-071). */
export const NOTIFICATION_CHANNELS = ['inApp', 'push', 'sms', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Channels outside the app, sent through the delivery outbox (D-071). */
export type DeliveryChannel = 'push' | 'sms' | 'email';

/**
 * Which outside channels a type uses when the person hasn't chosen (DESIGN.md §13.2; types added since follow the
 * closest listed one). Texts are kept for what can't wait.
 */
export const DEFAULT_DELIVERY_CHANNELS: Record<NotificationType, readonly DeliveryChannel[]> = {
  credential_expiry: ['email'],
  message_received: ['push'],
  // "Please sign your contract" is what holds a new starter back, so it is texted as well.
  document_signature: ['push', 'sms'],
  time_off_decided: ['push'],
  application_received: ['push', 'email'],
  supervision: ['push', 'email'],
  system: ['email'],
};
