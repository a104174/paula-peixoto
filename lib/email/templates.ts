export const emailTypes = [
  "request_received",
  "new_appointment_paula",
  "appointment_confirmed",
  "appointment_rescheduled",
  "appointment_cancelled",
] as const;

export type EmailType = typeof emailTypes[number];

export type AppointmentEmailData = {
  appointmentId: string;
  customerName: string;
  serviceName: string;
  date: string;
  time: string;
  durationMinutes: number;
  price?: string | null;
  phone: string;
  email?: string | null;
  notes?: string | null;
  previousDate?: string;
  previousTime?: string;
  appUrl: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export function renderEmail(type: EmailType, data: AppointmentEmailData): RenderedEmail {
  const content = templateContent(type, data);
  return {
    subject: content.subject,
    html: emailLayout(content.heading, content.intro, content.rows, content.notice, data.appUrl),
    text: textVersion(content.heading, content.intro, content.rows, content.notice, data.appUrl),
  };
}

export function previewEmailData(): AppointmentEmailData {
  return {
    appointmentId: "preview-appointment",
    customerName: "Marta Silva",
    serviceName: "Corte Feminino",
    date: "2026-08-14",
    time: "15:00",
    durationMinutes: 45,
    price: "Desde 25€",
    phone: "912 345 678",
    email: "marta@example.com",
    notes: "Gostaria de manter o comprimento e dar mais movimento.",
    previousDate: "2026-08-12",
    previousTime: "11:00",
    appUrl: "http://localhost:3000",
  };
}

type Content = {
  subject: string;
  heading: string;
  intro: string;
  rows: Array<[string, string]>;
  notice: string;
};

function templateContent(type: EmailType, data: AppointmentEmailData): Content {
  const appointmentRows: Array<[string, string]> = [
    ["Data", formatDate(data.date)],
    ["Hora", data.time],
    ["Serviço", data.serviceName],
    ["Duração", `${data.durationMinutes} min`],
  ];
  if (data.price) appointmentRows.push(["Preço", data.price]);

  if (type === "request_received") {
    return {
      subject: "Recebemos o seu pedido de marcação",
      heading: "O seu pedido foi recebido",
      intro: `Olá ${data.customerName}, obrigada por escolher a Paula Peixoto. O pedido está registado e será confirmado diretamente consigo.`,
      rows: appointmentRows,
      notice: "Este email confirma apenas a receção do pedido; a marcação ainda aguarda confirmação.",
    };
  }
  if (type === "new_appointment_paula") {
    const rows: Array<[string, string]> = [
      ["Cliente", data.customerName],
      ["Telemóvel", data.phone],
      ["Email", data.email || "Não indicado"],
      ...appointmentRows,
    ];
    if (data.notes) rows.push(["Observações", data.notes]);
    return {
      subject: `Novo pedido de marcação · ${data.customerName}`,
      heading: "Novo pedido no website",
      intro: "Foi registado um novo pedido de marcação para rever no backoffice.",
      rows,
      notice: "Abra o backoffice para confirmar, reagendar ou cancelar este pedido.",
    };
  }
  if (type === "appointment_confirmed") {
    return {
      subject: "A sua marcação está confirmada",
      heading: "Marcação confirmada",
      intro: `Olá ${data.customerName}, o seu momento com a Paula está confirmado.`,
      rows: appointmentRows,
      notice: "Se precisar de alterar alguma informação, contacte a Paula diretamente.",
    };
  }
  if (type === "appointment_rescheduled") {
    return {
      subject: "A sua marcação foi reagendada",
      heading: "Novo dia e horário",
      intro: `Olá ${data.customerName}, a sua marcação foi atualizada.`,
      rows: [
        ["Data anterior", data.previousDate ? formatDate(data.previousDate) : "—"],
        ["Hora anterior", data.previousTime || "—"],
        ...appointmentRows,
      ],
      notice: "Considere a data e a hora novas indicadas acima.",
    };
  }
  return {
    subject: "A sua marcação foi cancelada",
    heading: "Marcação cancelada",
    intro: `Olá ${data.customerName}, a marcação abaixo foi cancelada.`,
    rows: appointmentRows,
    notice: "Esta mensagem é diferente de uma eliminação definitiva do registo administrativo.",
  };
}

function emailLayout(
  heading: string,
  intro: string,
  rows: Array<[string, string]>,
  notice: string,
  appUrl: string,
) {
  const details = rows.map(([label, value]) => `
    <tr>
      <td style="padding:9px 0;color:#76695d;font-size:12px;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(label)}</td>
      <td style="padding:9px 0;color:#25231f;font-size:14px;font-weight:600;text-align:right">${escapeHtml(value)}</td>
    </tr>`).join("");
  return `<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:0;background:#f4f1eb;color:#25231f;font-family:Arial,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 14px;background:#f4f1eb">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;overflow:hidden;border:1px solid #e1d7ca;border-radius:20px;background:#fff">
          <tr><td style="padding:34px 36px 24px;border-bottom:1px solid #eee7de">
            <p style="margin:0 0 12px;color:#7d562d;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">Paula Peixoto · Cabeleireiro & beleza</p>
            <h1 style="margin:0;font-family:Georgia,serif;font-size:30px;line-height:1.15">${escapeHtml(heading)}</h1>
          </td></tr>
          <tr><td style="padding:28px 36px">
            <p style="margin:0 0 22px;color:#665b51;font-size:15px;line-height:1.65">${escapeHtml(intro)}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:10px 18px;border-radius:14px;background:#faf7f2">${details}</table>
            <p style="margin:22px 0 0;padding:14px 16px;border-left:3px solid #d4a373;background:#fdf8f1;color:#665b51;font-size:13px;line-height:1.55">${escapeHtml(notice)}</p>
          </td></tr>
          <tr><td style="padding:20px 36px;background:#292b26;color:#ddd6ca;font-size:12px">
            Paula Peixoto · <a href="${escapeHtml(appUrl)}" style="color:#e8c797">Website</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function textVersion(
  heading: string,
  intro: string,
  rows: Array<[string, string]>,
  notice: string,
  appUrl: string,
) {
  return [
    "PAULA PEIXOTO · CABELEIREIRO & BELEZA",
    "",
    heading,
    intro,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    notice,
    "",
    appUrl,
  ].join("\n");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}
