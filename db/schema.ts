import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  serviceId: text("service_id").notNull(),
  serviceName: text("service_name").notNull(),
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
