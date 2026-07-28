import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  customerId: text("customer_id"),
  serviceId: text("service_id").notNull(),
  serviceName: text("service_name").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  appointmentDate: text("appointment_date").notNull(),
  appointmentTime: text("appointment_time").notNull(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  notes: text("notes"),
  status: text("status").notNull().default("pendente"),
  source: text("source").notNull().default("website"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("appointments_date_idx").on(table.appointmentDate),
  index("appointments_status_idx").on(table.status),
]);

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("customers_name_idx").on(table.name),
  index("customers_phone_idx").on(table.phone),
  index("customers_email_idx").on(table.email),
]);

export const businessServices = sqliteTable("business_services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  price: text("price").notNull().default(""),
  color: text("color").notNull().default("#D4A373"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("business_services_active_order_idx").on(table.isActive, table.sortOrder),
]);

export type Customer = typeof customers.$inferSelect;
export type BusinessService = typeof businessServices.$inferSelect;

export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["owner", "admin"] }).notNull().default("admin"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastLoginAt: text("last_login_at"),
}, (table) => [
  uniqueIndex("admin_users_email_unique").on(table.email),
  index("admin_users_active_role_idx").on(table.isActive, table.role),
]);

export const adminSessions = sqliteTable("admin_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at").notNull(),
  revokedAt: text("revoked_at"),
  userAgent: text("user_agent"),
}, (table) => [
  uniqueIndex("admin_sessions_token_hash_unique").on(table.tokenHash),
  index("admin_sessions_user_idx").on(table.userId),
  index("admin_sessions_expires_idx").on(table.expiresAt),
]);

export const adminLoginAttempts = sqliteTable("admin_login_attempts", {
  keyHash: text("key_hash").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  blockedUntil: text("blocked_until"),
  updatedAt: text("updated_at").notNull(),
});

export const publicRateLimits = sqliteTable("public_rate_limits", {
  keyHash: text("key_hash").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  blockedUntil: text("blocked_until"),
  updatedAt: text("updated_at").notNull(),
});

// Reserved for a future email-backed recovery flow. Tokens must only be stored
// as hashes and are never returned by application endpoints.
export const adminPasswordResetTokens = sqliteTable("admin_password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  usedAt: text("used_at"),
}, (table) => [
  uniqueIndex("admin_password_reset_token_hash_unique").on(table.tokenHash),
  index("admin_password_reset_user_idx").on(table.userId),
]);

export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;

export const emailOutbox = sqliteTable("email_outbox", {
  id: text("id").primaryKey(),
  appointmentId: text("appointment_id").notNull(),
  recipient: text("recipient").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  idempotencyKey: text("idempotency_key").notNull(),
  provider: text("provider").notNull(),
  providerMessageId: text("provider_message_id"),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body").notNull(),
  lastEvent: text("last_event"),
  lastEventAt: text("last_event_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  sentAt: text("sent_at"),
}, (table) => [
  uniqueIndex("email_outbox_idempotency_unique").on(table.idempotencyKey),
  index("email_outbox_appointment_idx").on(table.appointmentId),
  index("email_outbox_status_idx").on(table.status),
  index("email_outbox_provider_message_idx").on(table.providerMessageId),
]);

export const emailWebhookEvents = sqliteTable("email_webhook_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  providerMessageId: text("provider_message_id"),
  receivedAt: text("received_at").notNull(),
}, (table) => [
  index("email_webhook_provider_message_idx").on(table.providerMessageId),
]);

export type EmailOutboxEntry = typeof emailOutbox.$inferSelect;

export const availabilitySettings = sqliteTable("availability_settings", {
  id: text("id").primaryKey(),
  minimumNoticeMinutes: integer("minimum_notice_minutes").notNull().default(0),
  bookingHorizonDays: integer("booking_horizon_days").notNull().default(90),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  slotIntervalMinutes: integer("slot_interval_minutes").notNull().default(30),
  updatedAt: text("updated_at").notNull(),
});

export const availabilityWorkPeriods = sqliteTable("availability_work_periods", {
  id: text("id").primaryKey(),
  weekday: integer("weekday").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  index("availability_work_periods_weekday_idx").on(table.weekday, table.sortOrder),
]);

export const availabilityBlocks = sqliteTable("availability_blocks", {
  id: text("id").primaryKey(),
  label: text("label"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  allDay: integer("all_day", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("availability_blocks_dates_idx").on(table.startDate, table.endDate),
]);

export type AvailabilitySetting = typeof availabilitySettings.$inferSelect;
export type AvailabilityWorkPeriod = typeof availabilityWorkPeriods.$inferSelect;
export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;
