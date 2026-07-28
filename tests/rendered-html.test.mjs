import assert from "node:assert/strict";
import { scrypt as nodeScrypt, createHash } from "node:crypto";
import { glob, readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";

const ORIGIN = "http://paula.test";
const CONTROL_HEADER = { "x-test-control": "paula-auth-tests" };

async function loadMiniflare() {
  const packageDirectory = (await readdir("node_modules/.pnpm"))
    .find((name) => name.startsWith("miniflare@"));
  if (!packageDirectory) throw new Error("Miniflare não está instalado.");
  return import(pathToFileURL(
    `${process.cwd()}/node_modules/.pnpm/${packageDirectory}/node_modules/miniflare/dist/src/index.js`,
  ));
}

async function builtModules() {
  const paths = ["tests/fixtures/worker-wrapper.mjs"];
  for await (const path of glob("dist/server/**/*.js")) paths.push(path);
  return paths.map((path) => ({ type: "ESModule", path }));
}

async function passwordHash(password) {
  const salt = Buffer.from("auth-test-salt-1");
  const key = await new Promise((resolve, reject) => {
    nodeScrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("base64url");
}

function cookieFrom(response) {
  const raw = response.headers.get("set-cookie") || "";
  return raw.split(";")[0];
}

function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(options.method || "GET")) {
    headers.set("origin", ORIGIN);
  }
  return { ...options, headers };
}

test("autenticação administrativa e rotas principais", async (t) => {
  const { Miniflare } = await loadMiniflare();
  const mf = new Miniflare({
    modules: await builtModules(),
    modulesRoot: process.cwd(),
    d1Databases: ["DB"],
    serviceBindings: { ASSETS: async () => new Response("Not found", { status: 404 }) },
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
  });

  const fetchApp = (path, options) => mf.dispatchFetch(`${ORIGIN}${path}`, request(path, options));
  const sql = async (statement) => {
    const statements = statement.split(";").map((part) => part.trim()).filter(Boolean);
    for (const query of statements) {
      const response = await mf.dispatchFetch(`${ORIGIN}/__test/sql`, {
        method: "POST",
        headers: CONTROL_HEADER,
        body: query,
      });
      assert.equal(response.status, 200, await response.text());
    }
  };

  try {
    const migrations = [
      await readFile("drizzle/0000_curly_lady_bullseye.sql", "utf8"),
      await readFile("drizzle/0001_admin_auth.sql", "utf8"),
      await readFile("drizzle/0002_backoffice_calendar.sql", "utf8"),
    ].join("\n").replaceAll("--> statement-breakpoint", "");
    await sql(migrations);

    const ownerPassword = "Frase-segura-original-2026";
    const inactivePassword = "Frase-segura-inativa-2026";
    const now = new Date().toISOString();
    await sql(`
      INSERT INTO admin_users
        (id,email,password_hash,display_name,role,is_active,must_change_password,created_at,updated_at)
      VALUES
        ('owner-1','owner@paula.test','${await passwordHash(ownerPassword)}','Paula','owner',1,0,'${now}','${now}'),
        ('inactive-1','inativa@paula.test','${await passwordHash(inactivePassword)}','Inativa','admin',0,0,'${now}','${now}');
    `);

    await t.test("contrato responsivo para mobile compacto e standard", async () => {
      const [css, dashboard, calendar] = await Promise.all([
        readFile("app/globals.css", "utf8"),
        readFile("app/admin/admin-dashboard.tsx", "utf8"),
        readFile("app/admin/calendar-view.tsx", "utf8"),
      ]);
      assert.match(css, /@media\(max-width:760px\)/);
      assert.match(css, /@media\(max-width:380px\)/);
      assert.match(css, /\.mobile-admin-nav\{position:fixed/);
      assert.match(css, /\.mobile-new\{position:fixed/);
      assert.match(css, /\.appointment-dialog\{height:96svh\}/);
      assert.doesNotMatch(`${dashboard}${calendar}`, /<table\b/i);
    });

    await t.test("website público, serviços, reservas e login respondem", async () => {
      for (const path of ["/", "/servicos", "/reservas", "/admin/login"]) {
        const response = await fetchApp(path);
        assert.equal(response.status, 200, path);
      }
    });

    await t.test("marcação pública começa apenas por data e hora", async () => {
      const response = await fetchApp("/");
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(html, /Data e hora/);
      assert.match(html, /Quando gostaria de vir/);
      assert.doesNotMatch(html, /Nome completo/);
      assert.doesNotMatch(html, /Enviar pedido de marcação/);
    });

    await t.test("acesso a /admin sem sessão redireciona", async () => {
      const response = await fetchApp("/admin", { redirect: "manual" });
      assert.ok([302, 303, 307, 308].includes(response.status));
      assert.equal(new URL(response.headers.get("location"), ORIGIN).pathname, "/admin/login");
    });

    await t.test("API administrativa sem sessão devolve 401", async () => {
      const response = await fetchApp("/api/admin/appointments");
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "Não autenticado" });
      assert.match(response.headers.get("cache-control") || "", /no-store/);
    });

    await t.test("login com password errada", async () => {
      const response = await fetchApp("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.1" },
        body: JSON.stringify({ email: "owner@paula.test", password: "password-errada" }),
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, "Email ou password incorretos.");
    });

    await t.test("login com email inexistente não permite enumeração", async () => {
      const response = await fetchApp("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.2" },
        body: JSON.stringify({ email: "ninguem@paula.test", password: "password-errada" }),
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, "Email ou password incorretos.");
    });

    await t.test("login de administrador inativo", async () => {
      const response = await fetchApp("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.3" },
        body: JSON.stringify({ email: "inativa@paula.test", password: inactivePassword }),
      });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error, "Email ou password incorretos.");
    });

    await t.test("rate limit após várias tentativas", async () => {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await fetchApp("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.4" },
          body: JSON.stringify({ email: "rate@paula.test", password: "password-errada" }),
        });
      }
      const blocked = await fetchApp("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.4" },
        body: JSON.stringify({ email: "rate@paula.test", password: "password-errada" }),
      });
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    });

    let ownerCookie = "";
    await t.test("login válido cria cookie seguro", async () => {
      const response = await fetchApp("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.5" },
        body: JSON.stringify({ email: "OWNER@PAULA.TEST", password: ownerPassword }),
      });
      assert.equal(response.status, 200);
      ownerCookie = cookieFrom(response);
      const setCookie = response.headers.get("set-cookie") || "";
      assert.match(ownerCookie, /^paula_admin_session=/);
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Lax/i);
      assert.match(setCookie, /Path=\//i);
      assert.match(setCookie, /Secure/i);
    });

    await t.test("acesso a /admin e API com sessão válida", async () => {
      const page = await fetchApp("/admin", { headers: { cookie: ownerCookie } });
      assert.equal(page.status, 200);
      assert.match(await page.text(), /Agenda/);
      const api = await fetchApp("/api/admin/appointments", { headers: { cookie: ownerCookie } });
      assert.equal(api.status, 200);
      assert.ok(Array.isArray((await api.json()).appointments));
    });

    await t.test("gestão de clientes, serviços e conflitos de agenda", async () => {
      const serviceResponse = await fetchApp("/api/admin/services", { headers: { cookie: ownerCookie } });
      assert.equal(serviceResponse.status, 200);
      const serviceData = await serviceResponse.json();
      assert.ok(serviceData.services.length >= 6);
      const newServiceResponse = await fetchApp("/api/admin/services", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          name: "Tratamento Teste",
          description: "Serviço temporário",
          durationMinutes: 30,
          price: "20€",
          color: "#AABBCC",
        }),
      });
      const newServiceBody = await newServiceResponse.json();
      assert.equal(newServiceResponse.status, 201, JSON.stringify(newServiceBody));
      const disabled = await fetchApp("/api/admin/services", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          ...newServiceBody.service,
          isActive: false,
        }),
      });
      assert.equal(disabled.status, 200, await disabled.text());
      const publicServices = await (await fetchApp("/api/services")).json();
      assert.ok(!publicServices.services.some((service) => service.id === newServiceBody.service.id));

      const customerResponse = await fetchApp("/api/admin/customers", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ name: "Cliente Agenda", phone: "930000000", email: "agenda@example.test", notes: "Prefere manhã." }),
      });
      const customerBody = await customerResponse.json();
      assert.equal(customerResponse.status, 201, JSON.stringify(customerBody));
      const customer = customerBody.customer;
      const date = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const payload = {
        customerId: customer.id,
        serviceId: "corte-feminino",
        date,
        time: "10:00",
        durationMinutes: 45,
        status: "confirmada",
        notes: "Teste de agenda",
      };
      const created = await fetchApp("/api/admin/appointments", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify(payload),
      });
      assert.equal(created.status, 201, await created.text());
      const conflict = await fetchApp("/api/admin/appointments", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ ...payload, time: "10:30" }),
      });
      assert.equal(conflict.status, 409);
      assert.ok((await conflict.json()).conflicts.length >= 1);
      const override = await fetchApp("/api/admin/appointments", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ ...payload, time: "10:30", allowConflict: true }),
      });
      assert.equal(override.status, 201, await override.text());
      const appointmentRows = await (await fetchApp("/api/admin/appointments", {
        headers: { cookie: ownerCookie },
      })).json();
      const createdAppointment = appointmentRows.appointments.find((item) =>
        item.customerId === customer.id && item.appointmentTime === "10:00");
      const edited = await fetchApp("/api/admin/appointments", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          id: createdAppointment.id,
          ...payload,
          time: "12:00",
          status: "concluida",
        }),
      });
      assert.equal(edited.status, 200, await edited.text());
    });

    let deletedFixture = null;
    await t.test("eliminação autenticada de uma marcação", async () => {
      const customerResponse = await fetchApp("/api/admin/customers", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          name: "Cliente a manter",
          phone: "931111111",
          email: "manter@example.test",
          notes: "A cliente não deve ser eliminada.",
        }),
      });
      const customerBody = await customerResponse.json();
      assert.equal(customerResponse.status, 201, JSON.stringify(customerBody));

      const date = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const created = await fetchApp("/api/admin/appointments", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          customerId: customerBody.customer.id,
          serviceId: "corte-feminino",
          date,
          time: "16:00",
          durationMinutes: 45,
          status: "confirmada",
          notes: "Fixture para eliminação",
        }),
      });
      assert.equal(created.status, 201, await created.text());

      const beforeDelete = await (await fetchApp("/api/admin/appointments", {
        headers: { cookie: ownerCookie },
      })).json();
      const appointment = beforeDelete.appointments.find((item) =>
        item.customerId === customerBody.customer.id && item.appointmentDate === date);
      assert.ok(appointment);
      deletedFixture = {
        appointmentId: appointment.id,
        customerId: customerBody.customer.id,
        serviceId: appointment.serviceId,
      };

      const response = await fetchApp("/api/admin/appointments", {
        method: "DELETE",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ id: appointment.id }),
      });
      const responseBody = await response.json();
      assert.equal(response.status, 200, JSON.stringify(responseBody));
      assert.deepEqual(responseBody, { ok: true, id: appointment.id });
      const afterDelete = await (await fetchApp("/api/admin/appointments", {
        headers: { cookie: ownerCookie },
      })).json();
      assert.ok(!afterDelete.appointments.some((item) => item.id === appointment.id));
    });

    await t.test("eliminação sem sessão é rejeitada", async () => {
      const response = await fetchApp("/api/admin/appointments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "Não autenticado" });
    });

    await t.test("eliminação de marcação inexistente e duplicada devolve 404", async () => {
      assert.ok(deletedFixture);
      const response = await fetchApp("/api/admin/appointments", {
        method: "DELETE",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({ id: deletedFixture.appointmentId }),
      });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "Marcação não encontrada." });
    });

    await t.test("eliminação mantém cliente e serviço na base de dados", async () => {
      assert.ok(deletedFixture);
      const [customerResponse, serviceResponse] = await Promise.all([
        fetchApp("/api/admin/customers", { headers: { cookie: ownerCookie } }),
        fetchApp("/api/admin/services", { headers: { cookie: ownerCookie } }),
      ]);
      assert.equal(customerResponse.status, 200);
      assert.equal(serviceResponse.status, 200);
      const [customerBody, serviceBody] = await Promise.all([
        customerResponse.json(),
        serviceResponse.json(),
      ]);
      assert.ok(customerBody.customers.some((item) => item.id === deletedFixture.customerId));
      assert.ok(serviceBody.services.some((item) => item.id === deletedFixture.serviceId));
    });

    await t.test("token adulterado é rejeitado", async () => {
      const response = await fetchApp("/api/auth/session", {
        headers: { cookie: `${ownerCookie}adulterado` },
      });
      assert.equal(response.status, 401);
    });

    await t.test("sessão expirada é rejeitada", async () => {
      const token = "expired-test-token-with-more-than-thirty-two-characters";
      const past = new Date(Date.now() - 60_000).toISOString();
      await sql(`INSERT INTO admin_sessions
        (id,user_id,token_hash,expires_at,created_at,last_used_at)
        VALUES ('expired-1','owner-1','${tokenHash(token)}','${past}','${past}','${past}');`);
      const response = await fetchApp("/api/auth/session", {
        headers: { cookie: `paula_admin_session=${token}` },
      });
      assert.equal(response.status, 401);
    });

    await t.test("sessão revogada é rejeitada", async () => {
      const token = "revoked-test-token-with-more-than-thirty-two-characters";
      const future = new Date(Date.now() + 60_000).toISOString();
      await sql(`INSERT INTO admin_sessions
        (id,user_id,token_hash,expires_at,created_at,last_used_at,revoked_at)
        VALUES ('revoked-1','owner-1','${tokenHash(token)}','${future}','${now}','${now}','${now}');`);
      const response = await fetchApp("/api/auth/session", {
        headers: { cookie: `paula_admin_session=${token}` },
      });
      assert.equal(response.status, 401);
    });

    await t.test("administrador desativado perde a sessão existente", async () => {
      await sql("UPDATE admin_users SET is_active=0 WHERE id='owner-1';");
      const response = await fetchApp("/api/auth/session", { headers: { cookie: ownerCookie } });
      assert.equal(response.status, 401);
      await sql("UPDATE admin_users SET is_active=1 WHERE id='owner-1';");
    });

    await t.test("logout revoga a sessão e remove o cookie", async () => {
      const response = await fetchApp("/api/auth/logout", {
        method: "POST",
        headers: { cookie: ownerCookie },
        redirect: "manual",
      });
      assert.equal(response.status, 303);
      assert.match(response.headers.get("set-cookie") || "", /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
      const session = await fetchApp("/api/auth/session", { headers: { cookie: ownerCookie } });
      assert.equal(session.status, 401);
    });

    let passwordCookie = "";
    await t.test("alteração de password revoga sessões e permite a nova password", async () => {
      const login = await fetchApp("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.6" },
        body: JSON.stringify({ email: "owner@paula.test", password: ownerPassword }),
      });
      passwordCookie = cookieFrom(login);
      const changedPassword = "Nova-frase-segura-2026";
      const change = await fetchApp("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: passwordCookie },
        body: JSON.stringify({
          currentPassword: ownerPassword,
          newPassword: changedPassword,
          confirmation: changedPassword,
        }),
      });
      assert.equal(change.status, 200, await change.text());
      const oldSession = await fetchApp("/api/auth/session", { headers: { cookie: passwordCookie } });
      assert.equal(oldSession.status, 401);
      const newLogin = await fetchApp("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.7" },
        body: JSON.stringify({ email: "owner@paula.test", password: changedPassword }),
      });
      assert.equal(newLogin.status, 200);
    });

    await t.test("CSRF bloqueia mutações administrativas cross-origin", async () => {
      const response = await mf.dispatchFetch(`${ORIGIN}/api/auth/logout`, {
        method: "POST",
        headers: { origin: "https://evil.test", cookie: passwordCookie },
      });
      assert.equal(response.status, 403);
    });

    await t.test("criação pública de reserva continua funcional", async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const response = await fetchApp("/api/appointments", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.8" },
        body: JSON.stringify({
          serviceId: "corte-feminino",
          date: futureDate,
          time: "09:30",
          name: "Cliente Teste",
          phone: "910000000",
          email: "cliente@example.test",
        }),
      });
      assert.equal(response.status, 201, await response.text());
      const availability = await fetchApp(`/api/availability?date=${futureDate}`);
      assert.equal(availability.status, 200);
      assert.ok((await availability.json()).unavailable.includes("09:30"));

      const durationAware = await fetchApp(
        `/api/availability?date=${futureDate}&serviceId=coloracao`,
      );
      assert.equal(durationAware.status, 200);
      assert.ok((await durationAware.json()).unavailable.includes("10:00"));

      const overlap = await fetchApp("/api/appointments", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.9" },
        body: JSON.stringify({
          serviceId: "brushing",
          date: futureDate,
          time: "10:00",
          name: "Cliente Sobreposição",
          phone: "910000001",
        }),
      });
      assert.equal(overlap.status, 409);
    });
  } finally {
    await mf.dispose();
  }
});
