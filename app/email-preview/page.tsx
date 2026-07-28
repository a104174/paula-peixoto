import { notFound } from "next/navigation";
import {
  emailTypes,
  previewEmailData,
  renderEmail,
  type EmailType,
} from "@/lib/email/templates";

const labels: Record<EmailType, string> = {
  request_received: "Pedido recebido",
  new_appointment_paula: "Nova marcação para a Paula",
  appointment_confirmed: "Confirmação",
  appointment_rescheduled: "Reagendamento",
  appointment_cancelled: "Cancelamento",
};

export default function EmailPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const sample = previewEmailData();

  return (
    <main className="email-preview-page">
      <header>
        <span>Desenvolvimento local</span>
        <h1>Templates de email</h1>
        <p>Previews estáticos: esta página não envia emails nem contacta o provider.</p>
      </header>
      <div className="email-preview-list">
        {emailTypes.map((type) => {
          const email = renderEmail(type, sample);
          return (
            <section key={type}>
              <div><h2>{labels[type]}</h2><p>{email.subject}</p></div>
              <iframe title={`Preview: ${labels[type]}`} srcDoc={email.html} />
              <details>
                <summary>Versão de texto</summary>
                <pre>{email.text}</pre>
              </details>
            </section>
          );
        })}
      </div>
    </main>
  );
}
