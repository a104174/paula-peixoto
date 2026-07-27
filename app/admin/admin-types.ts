export type AppointmentStatus = "pendente" | "confirmada" | "concluida" | "cancelada";

export type Appointment = {
  id: string;
  customerId: string | null;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  appointmentDate: string;
  appointmentTime: string;
  customerName: string;
  phone: string;
  email: string | null;
  notes: string | null;
  status: AppointmentStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BusinessService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminSection = "agenda" | "appointments" | "customers" | "services" | "settings";
