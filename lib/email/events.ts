import type { Appointment, BusinessService } from "@/db/schema";
import { getEmailConfig } from "./config";
import { queueTransactionalEmails, type QueueEmailInput } from "./outbox";
import type { AppointmentEmailData, EmailType } from "./templates";

type AppointmentWithPrice = Appointment & { price?: string | null };

export async function queuePublicAppointmentEmails(appointment: AppointmentWithPrice) {
  const config = getEmailConfig();
  const data = toEmailData(appointment, config.appUrl);
  const inputs: QueueEmailInput[] = [];
  if (appointment.email) {
    inputs.push(emailInput("request_received", appointment.email, appointment, data, appointment.createdAt));
  }
  if (config.paulaNotificationEmail) {
    inputs.push(emailInput(
      "new_appointment_paula",
      config.paulaNotificationEmail,
      appointment,
      data,
      appointment.createdAt,
    ));
  }
  await queueTransactionalEmails(inputs);
}

export async function queueAdminCreatedAppointmentEmail(appointment: AppointmentWithPrice) {
  if (!appointment.email || appointment.status !== "confirmada") return;
  const config = getEmailConfig();
  await queueTransactionalEmails([
    emailInput(
      "appointment_confirmed",
      appointment.email,
      appointment,
      toEmailData(appointment, config.appUrl),
      appointment.createdAt,
    ),
  ]);
}

export async function queueAppointmentChangedEmail(
  previous: Appointment,
  current: AppointmentWithPrice,
) {
  if (!current.email) return;
  let type: EmailType | null = null;
  if (previous.status !== "cancelada" && current.status === "cancelada") {
    type = "appointment_cancelled";
  } else if (
    previous.appointmentDate !== current.appointmentDate ||
    previous.appointmentTime !== current.appointmentTime
  ) {
    type = "appointment_rescheduled";
  } else if (previous.status !== "confirmada" && current.status === "confirmada") {
    type = "appointment_confirmed";
  }
  if (!type) return;

  const config = getEmailConfig();
  const data = {
    ...toEmailData(current, config.appUrl),
    previousDate: previous.appointmentDate,
    previousTime: previous.appointmentTime,
  };
  await queueTransactionalEmails([
    emailInput(type, current.email, current, data, previous.updatedAt),
  ]);
}

export function withServicePrice(appointment: Appointment, service?: Pick<BusinessService, "price">) {
  return { ...appointment, price: service?.price ?? null };
}

function emailInput(
  type: EmailType,
  recipient: string,
  appointment: Appointment,
  data: AppointmentEmailData,
  eventVersion: string,
): QueueEmailInput {
  return {
    appointmentId: appointment.id,
    recipient,
    type,
    idempotencyKey: `${type}/${appointment.id}/${eventVersion}`,
    data,
  };
}

function toEmailData(appointment: AppointmentWithPrice, appUrl: string): AppointmentEmailData {
  return {
    appointmentId: appointment.id,
    customerName: appointment.customerName,
    serviceName: appointment.serviceName,
    date: appointment.appointmentDate,
    time: appointment.appointmentTime,
    durationMinutes: appointment.durationMinutes,
    price: appointment.price,
    phone: appointment.phone,
    email: appointment.email,
    notes: appointment.notes,
    appUrl,
  };
}
