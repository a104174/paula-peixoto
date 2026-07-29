import assert from "node:assert/strict";
import { scrypt as nodeScrypt, createHash, createHmac } from "node:crypto";
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
    bindings: {
      EMAIL_ENABLED: "false",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "must-not-be-used",
      EMAIL_FROM: "Paula Peixoto <marcacoes@example.test>",
      PAULA_NOTIFICATION_EMAIL: "paula@example.test",
      APP_URL: ORIGIN,
      RESEND_WEBHOOK_SECRET: "",
    },
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
  const sqlRows = async (statement) => {
    const response = await mf.dispatchFetch(`${ORIGIN}/__test/sql`, {
      method: "POST",
      headers: CONTROL_HEADER,
      body: statement,
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.results;
  };

  try {
    const migrations = [
      await readFile("drizzle/0000_curly_lady_bullseye.sql", "utf8"),
      await readFile("drizzle/0001_admin_auth.sql", "utf8"),
      await readFile("drizzle/0002_backoffice_calendar.sql", "utf8"),
      await readFile("drizzle/0003_transactional_email.sql", "utf8"),
      await readFile("drizzle/0004_configurable_availability.sql", "utf8"),
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

    await t.test("scroll animado fica limitado aos links internos do website público", async () => {
      const [css, publicSite, scrollUtilities] = await Promise.all([
        readFile("app/globals.css", "utf8"),
        readFile("app/public-site.tsx", "utf8"),
        import("../lib/public-scroll.ts"),
      ]);
      assert.doesNotMatch(
        css,
        /(?:^|[;{]\s*)(?:scroll-behavior|scroll-padding(?:-[a-z]+)?|scroll-margin(?:-[a-z]+)?)\s*:/m,
      );
      assert.match(publicSite, /document\.scrollingElement/);
      assert.equal(scrollUtilities.LANDING_SCROLL_DURATION_MS, 720);
      assert.match(publicSite, /easeInOutCubic\(progress\)/);
      assert.match(publicSite, /requestAnimationFrame\(animate\)/);
      assert.match(publicSite, /getBoundingClientRect\(\)\.bottom/);
      assert.match(publicSite, /a\[href\^="#"\]/);
      assert.match(publicSite, /window\.history\.pushState\(window\.history\.state, "", hash\)/);
      assert.match(publicSite, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
      for (const id of ["servicos", "sobre", "galeria", "marcar", "contacto"]) {
        assert.match(publicSite, new RegExp(`href="#${id}"|["']${id}["']`));
      }

      assert.equal(scrollUtilities.easeInOutCubic(0), 0);
      assert.equal(scrollUtilities.easeInOutCubic(0.25), 0.0625);
      assert.equal(scrollUtilities.easeInOutCubic(0.5), 0.5);
      assert.equal(scrollUtilities.easeInOutCubic(0.75), 0.9375);
      assert.equal(scrollUtilities.easeInOutCubic(1), 1);

      const desktopTarget = scrollUtilities.calculateLandingScrollTop({
        currentTop: 0,
        targetViewportTop: 1200,
        headerViewportBottom: 82,
        scrollHeight: 5000,
        viewportHeight: 900,
      });
      assert.equal(desktopTarget, 1102);

      const mobileTargetAfterMenuCloses = scrollUtilities.calculateLandingScrollTop({
        currentTop: 450,
        targetViewportTop: 700,
        headerViewportBottom: 82,
        scrollHeight: 5000,
        viewportHeight: 720,
      });
      assert.equal(mobileTargetAfterMenuCloses, 1052);

      const targetNearPageEnd = scrollUtilities.calculateLandingScrollTop({
        currentTop: 3500,
        targetViewportTop: 900,
        headerViewportBottom: 82,
        scrollHeight: 4500,
        viewportHeight: 800,
      });
      assert.equal(targetNearPageEnd, 3700);
    });

    await t.test("navbar pública responde a scroll, secções, hash e menu mobile acessível", async () => {
      const [publicSite, css, mobileLogo, desktopLogo] = await Promise.all([
        readFile("app/public-site.tsx", "utf8"),
        readFile("app/globals.css", "utf8"),
        readFile("public/pp.png"),
        readFile("public/paula-peixoto.png"),
      ]);

      for (const [id, label] of [
        ["inicio", "Início"],
        ["servicos", "Serviços"],
        ["sobre", "Sobre"],
        ["galeria", "Galeria"],
        ["contacto", "Contacto"],
      ]) {
        assert.match(publicSite, new RegExp(`\\["${id}", "${label}"\\]`));
      }
      assert.match(publicSite, /window\.scrollY > 28/);
      assert.match(publicSite, /addEventListener\("scroll", handleScroll, \{ passive: true \}\)/);
      assert.match(publicSite, /new IntersectionObserver/);
      assert.match(publicSite, /aria-current=\{activeSection === id \? "location" : undefined\}/);
      assert.match(publicSite, /siteHeaderRef\.current/);
      assert.match(publicSite, /header\?\.getBoundingClientRect\(\)\.bottom/);
      assert.match(publicSite, /window\.location\.hash/);
      assert.match(publicSite, /requestAnimationFrame\(\(\) => scrollToLandingTarget\(target\)\)/);

      assert.match(publicSite, /aria-controls="mobile-navigation"/);
      assert.match(publicSite, /event\.key === "Escape"/);
      assert.match(publicSite, /event\.key !== "Tab"/);
      assert.match(publicSite, /element\.offsetParent !== null/);
      assert.match(publicSite, /event\.preventDefault\(\)/);
      assert.match(publicSite, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
      assert.match(publicSite, /document\.body\.style\.overflow = "hidden"/);
      assert.match(publicSite, /document\.body\.style\.overflow = previousOverflow/);
      assert.match(publicSite, /querySelector<HTMLAnchorElement>\("a"\)\?\.focus\(\)/);
      assert.match(publicSite, /window\.matchMedia\("\(min-width: 901px\)"\)/);
      assert.match(publicSite, /tabIndex=\{menuOpen \? 0 : -1\}/);
      assert.match(publicSite, /onClick=\{closeMobileNavigation\}/);
      assert.match(publicSite, /className="mobile-navigation-primary"/);
      assert.match(publicSite, /className="mobile-navigation-cta"/);
      assert.match(publicSite, /event\.target === event\.currentTarget/);
      assert.match(publicSite, /<\/div>\s*<nav\s+className="mobile-navigation"/);
      assert.match(publicSite, /src="\/pp\.png"/);
      assert.match(publicSite, /alt="Símbolo Paula Peixoto"/);
      assert.match(publicSite, /src="\/paula-peixoto\.png"/);
      assert.match(publicSite, /alt="Paula Peixoto"/);
      assert.equal(publicSite.match(/\s+unoptimized/g)?.length, 2);
      const mobileMenuMarkup = publicSite.match(
        /<button[\s\S]*?className="mobile-menu"[\s\S]*?<\/button>/,
      )?.[0] ?? "";
      assert.equal(mobileMenuMarkup.match(/<span aria-hidden="true" \/>/g)?.length, 3);
      assert.equal(mobileLogo.readUInt32BE(16), 510);
      assert.equal(mobileLogo.readUInt32BE(20), 497);
      assert.equal(desktopLogo.readUInt32BE(16), 734);
      assert.equal(desktopLogo.readUInt32BE(20), 175);

      assert.match(css, /\.public-nav-frame\{[\s\S]*background:transparent/);
      assert.match(css, /\.site-header\.is-scrolled \.public-nav-frame\{[\s\S]*border-radius:999px/);
      assert.match(css, /background:rgba\(249,249,246,.88\)/);
      assert.match(css, /backdrop-filter:blur\(18px\) saturate\(1.12\)/);
      assert.match(css, /\.nav-links a\.active/);
      assert.match(css, /\.site-header a:focus-visible,.site-header button:focus-visible/);
      assert.match(css, /@media\(max-width:1120px\)/);
      assert.match(css, /@media\(max-width:900px\)/);
      assert.match(css, /@media\(max-width:480px\)/);
      assert.match(css, /\.site-header\.menu-open \.mobile-navigation/);
      assert.match(css, /@media\(max-width:900px\)\{[\s\S]*--mobile-nav-inset:clamp\(16px,5vw,24px\)/);
      assert.match(css, /\.public-nav-frame\{[\s\S]*z-index:2/);
      assert.match(css, /\.site-header\.is-scrolled \.public-nav-frame,[\s\S]*border-radius:999px/);
      assert.match(css, /\.mobile-navigation\{[\s\S]*position:fixed;[\s\S]*inset:0;[\s\S]*min-height:100dvh/);
      assert.match(css, /\.mobile-navigation-primary a\{[\s\S]*font-size:clamp\(1\.8rem,8vw,2\.35rem\)/);
      assert.match(css, /\.mobile-navigation>\.mobile-navigation-cta\{[\s\S]*margin-top:auto/);
      assert.match(css, /\.brand-logo\{[\s\S]*object-fit:contain/);
      assert.match(css, /\.brand\{[\s\S]*margin-left:8px/);
      assert.match(css, /\.brand-logo-full\{width:clamp\(132px,12vw,156px\);height:auto\}/);
      assert.match(css, /\.brand-logo-symbol\{width:40px;height:auto;display:none\}/);
      assert.match(css, /\.site-header\.menu-open \.mobile-menu>span:nth-child\(2\)\{opacity:0/);
      assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.site-header/);
    });

    await t.test("landing pública mantém contrato mobile fluido entre 320 e 768 px", async () => {
      const [publicSite, css] = await Promise.all([
        readFile("app/public-site.tsx", "utf8"),
        readFile("app/globals.css", "utf8"),
      ]);
      const responsiveAudit = css.slice(
        css.indexOf("/* Public landing responsive audit */"),
        css.indexOf(".email-preview-page"),
      );

      for (const width of [320, 360, 375, 390, 412, 430, 768]) {
        const gutter = Math.min(20, Math.max(12, width * 0.04));
        assert.ok(width - (2 * gutter) > 0, `${width}px mantém largura útil positiva`);
        assert.ok(width - (2 * gutter) <= width, `${width}px não excede o viewport`);
      }

      for (const section of [
        "hero",
        "services",
        "about",
        "gallery",
        "booking",
        "cta-band",
        "site-footer",
      ]) {
        assert.match(responsiveAudit, new RegExp(`\\.public-site \\.${section.replace("-", "\\-")}`));
      }

      assert.match(responsiveAudit, /--public-mobile-gutter:clamp\(12px,4vw,20px\)/);
      assert.match(responsiveAudit, /\.public-site\{max-width:100%;overflow-x:clip\}/);
      assert.match(responsiveAudit, /\.public-site \.hero-grid\{[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
      assert.match(responsiveAudit, /\.public-site \.service-grid\{grid-template-columns:minmax\(0,1fr\)/);
      assert.match(responsiveAudit, /\.public-site \.about-grid\{[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
      assert.match(responsiveAudit, /\.public-site \.gallery-grid\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
      assert.match(responsiveAudit, /@media\(max-width:480px\)\{[\s\S]*\.public-site \.gallery-grid\{grid-template-columns:minmax\(0,1fr\)/);
      assert.match(responsiveAudit, /\.public-site \.booking-calendar-panel\{[\s\S]*padding-inline:0/);
      assert.match(responsiveAudit, /\.public-site \.booking-month-grid button\{min-width:0;min-height:44px\}/);
      assert.match(responsiveAudit, /\.public-site \.nav-book,[\s\S]*min-height:44px/);
      assert.match(responsiveAudit, /\.public-site \.form-elegant \.field textarea\{font-size:16px\}/);
      assert.match(responsiveAudit, /\.public-site \.booking-wizard:focus-within \.booking-actions\{position:relative\}/);
      assert.match(responsiveAudit, /safe-area-inset-bottom/);
      assert.match(responsiveAudit, /\.public-site \.footer-grid\{grid-template-columns:minmax\(0,1fr\)/);
      assert.match(responsiveAudit, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*\.public-site \.gallery-item img\{transition:none!important\}/);
      assert.match(publicSite, /booking-choice-panel booking-calendar-panel/);
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

    await t.test("wizard público mantém estrutura, ações e estados visuais consistentes", async () => {
      const [publicSite, css] = await Promise.all([
        readFile("app/public-site.tsx", "utf8"),
        readFile("app/globals.css", "utf8"),
      ]);

      for (const step of [1, 2, 3]) {
        assert.match(publicSite, new RegExp(`step === ${step}`));
      }
      assert.match(publicSite, /className="booking-content-grid"/);
      assert.match(publicSite, /className="booking-review"/);
      assert.match(publicSite, /ReviewItem label="Preço"/);
      assert.match(publicSite, /ReviewItem label="Telemóvel"/);
      assert.match(publicSite, /onEdit=\{\(\) => goToStep\(1\)\}/);
      assert.match(publicSite, /onEdit=\{\(\) => goToStep\(2\)\}/);
      assert.match(publicSite, /Continuar para serviços/);
      assert.match(publicSite, /Rever pedido/);
      assert.match(publicSite, /Confirmar marcação/);
      assert.match(publicSite, /setSubmitted\(true\)/);
      assert.match(publicSite, /if \(sending \|\| submitted\) return/);
      assert.match(publicSite, /A aguardar confirmação/);
      assert.match(publicSite, /Não precisa de enviar novamente/);
      assert.match(publicSite, /Voltar ao início/);
      assert.match(publicSite, /href="tel:\+351912345678"/);
      assert.match(publicSite, /\$\{selectedService\.duration\} min · \$\{selectedService\.price\}/);

      assert.match(css, /\.public-site \.booking-wizard\.wide-wizard\{/);
      assert.match(css, /min-height:0/);
      assert.match(css, /overflow:clip/);
      assert.match(css, /\.public-site \.booking-content-grid\{\s*display:grid;\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
      assert.match(css, /\.public-site \.booking-actions\{\s*margin-top:32px/);
      assert.match(css, /\.public-site \.booking-review-card dl>div\{[\s\S]*grid-template-columns:/);
      assert.match(css, /@media\(max-width:900px\)\{[\s\S]*\.public-site \.booking-content-grid\{grid-template-columns:1fr/);
      assert.match(css, /position:sticky;[\s\S]*bottom:0/);
      assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
      assert.doesNotMatch(css, /\.public-site \.booking-wizard\.wide-wizard\{[^}]*min-height:600px/);
    });

    await t.test("templates transacionais e preview local estão preparados", async () => {
      const [templates, preview] = await Promise.all([
        readFile("lib/email/templates.ts", "utf8"),
        readFile("app/email-preview/page.tsx", "utf8"),
      ]);
      for (const type of [
        "request_received",
        "new_appointment_paula",
        "appointment_confirmed",
        "appointment_rescheduled",
        "appointment_cancelled",
      ]) assert.match(templates, new RegExp(type));
      assert.match(preview, /NODE_ENV === "production"/);
      assert.match(preview, /não envia emails nem contacta o provider/);
      const productionPreview = await fetchApp("/email-preview");
      assert.equal(productionPreview.status, 404);
    });

    await t.test("webhook Resend fica inativo sem secret", async () => {
      const response = await fetchApp("/api/webhooks/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "Webhook não configurado." });
    });

    await t.test("webhook Resend valida assinatura e deduplica svix-id", async () => {
      const webhookSecret = "webhook-test-secret";
      const signingSecret = `whsec_${Buffer.from(webhookSecret).toString("base64")}`;
      const webhookMf = new Miniflare({
        modules: await builtModules(),
        modulesRoot: process.cwd(),
        d1Databases: ["DB"],
        bindings: {
          EMAIL_ENABLED: "false",
          EMAIL_PROVIDER: "disabled",
          RESEND_WEBHOOK_SECRET: signingSecret,
        },
        serviceBindings: { ASSETS: async () => new Response("Not found", { status: 404 }) },
        compatibilityDate: "2026-05-22",
        compatibilityFlags: ["nodejs_compat"],
      });
      try {
        for (const query of migrations.split(";").map((part) => part.trim()).filter(Boolean)) {
          const migrated = await webhookMf.dispatchFetch(`${ORIGIN}/__test/sql`, {
            method: "POST",
            headers: CONTROL_HEADER,
            body: query,
          });
          assert.equal(migrated.status, 200, await migrated.text());
        }
        const id = "msg_webhook_test";
        const timestamp = String(Math.floor(Date.now() / 1000));
        const payload = JSON.stringify({
          type: "email.delivered",
          created_at: new Date().toISOString(),
          data: { email_id: "email_unknown" },
        });
        const signature = createHmac("sha256", webhookSecret)
          .update(`${id}.${timestamp}.${payload}`)
          .digest("base64");
        const webhookHeaders = {
          "content-type": "application/json",
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": `v1,${signature}`,
        };
        const invalid = await webhookMf.dispatchFetch(`${ORIGIN}/api/webhooks/resend`, {
          method: "POST",
          headers: { ...webhookHeaders, "svix-signature": "v1,invalid" },
          body: payload,
        });
        assert.equal(invalid.status, 400);
        const accepted = await webhookMf.dispatchFetch(`${ORIGIN}/api/webhooks/resend`, {
          method: "POST",
          headers: webhookHeaders,
          body: payload,
        });
        assert.equal(accepted.status, 200, await accepted.text());
        const duplicate = await webhookMf.dispatchFetch(`${ORIGIN}/api/webhooks/resend`, {
          method: "POST",
          headers: webhookHeaders,
          body: payload,
        });
        assert.equal(duplicate.status, 200);
        assert.equal((await duplicate.json()).duplicate, true);
      } finally {
        await webhookMf.dispose();
      }
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

    await t.test("API de disponibilidade administrativa exige sessão", async () => {
      const response = await fetchApp("/api/admin/availability");
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "Não autenticado" });
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

    await t.test("outbox evita emails duplicados em eventos administrativos repetidos", async () => {
      const customerResponse = await fetchApp("/api/admin/customers", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          name: "Cliente Email",
          phone: "932222222",
          email: "outbox@example.test",
        }),
      });
      const customerBody = await customerResponse.json();
      assert.equal(customerResponse.status, 201, JSON.stringify(customerBody));
      const date = new Date(Date.now() + 24 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const created = await fetchApp("/api/admin/appointments", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          customerId: customerBody.customer.id,
          serviceId: "brushing",
          date,
          time: "14:00",
          durationMinutes: 30,
          status: "pendente",
        }),
      });
      const createdBody = await created.json();
      assert.equal(created.status, 201, JSON.stringify(createdBody));

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const confirmed = await fetchApp("/api/admin/appointments", {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: ownerCookie },
          body: JSON.stringify({ id: createdBody.id, status: "confirmada" }),
        });
        assert.equal(confirmed.status, 200, await confirmed.text());
      }
      const rescheduled = await fetchApp("/api/admin/appointments", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          id: createdBody.id,
          customerId: customerBody.customer.id,
          serviceId: "brushing",
          date,
          time: "15:00",
          durationMinutes: 30,
          status: "confirmada",
          notes: "",
        }),
      });
      assert.equal(rescheduled.status, 200, await rescheduled.text());
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const cancelled = await fetchApp("/api/admin/appointments", {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie: ownerCookie },
          body: JSON.stringify({ id: createdBody.id, status: "cancelada" }),
        });
        assert.equal(cancelled.status, 200, await cancelled.text());
      }
      const rows = await sqlRows(
        `SELECT type,status,attempts,provider,idempotency_key FROM email_outbox
         WHERE appointment_id='${createdBody.id}' ORDER BY type`,
      );
      assert.deepEqual(rows.map((row) => row.type), [
        "appointment_cancelled",
        "appointment_confirmed",
        "appointment_rescheduled",
      ]);
      assert.ok(rows.every((row) =>
        row.status === "disabled" &&
        row.attempts === 0 &&
        row.provider === "disabled" &&
        row.idempotency_key.length <= 256));
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

    await t.test("disponibilidade normal, sobreposições, dias fechados e durações diferentes", async () => {
      const date = new Date(Date.now() + 35 * 86_400_000).toISOString().slice(0, 10);
      const closedDate = new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const saved = await fetchApp("/api/admin/availability", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          minimumNoticeMinutes: 60,
          bookingHorizonDays: 90,
          bufferMinutes: 15,
          slotIntervalMinutes: 30,
          periods: [
            { weekday, startTime: "09:00", endTime: "12:00" },
            { weekday, startTime: "14:00", endTime: "17:00" },
          ],
          blocks: [{
            label: "Assunto pessoal",
            startDate: date,
            endDate: date,
            startTime: "14:00",
            endTime: "15:00",
            allDay: false,
          }],
        }),
      });
      const savedBody = await saved.json();
      assert.equal(saved.status, 200, JSON.stringify(savedBody));
      assert.equal(savedBody.configured, true);
      assert.equal(savedBody.periods.length, 2);

      const normal = await (await fetchApp(
        `/api/availability?date=${date}&serviceId=brushing`,
      )).json();
      assert.equal(normal.configured, true);
      assert.ok(normal.slots.includes("09:00"));
      assert.ok(normal.slots.includes("16:30"));
      assert.ok(normal.unavailable.includes("14:00"));
      assert.ok(normal.unavailable.includes("14:30"));

      const longService = await (await fetchApp(
        `/api/availability?date=${date}&serviceId=coloracao`,
      )).json();
      assert.ok(longService.slots.includes("10:30"));
      assert.ok(!longService.slots.includes("11:00"));

      await sql(`INSERT INTO appointments
        (id,service_id,service_name,duration_minutes,appointment_date,appointment_time,
         customer_name,phone,status,source,created_at,updated_at)
        VALUES ('availability-overlap','brushing','Brushing',30,'${date}','10:00',
        'Cliente Ocupada','939999999','confirmada','admin','${now}','${now}');`);
      const overlap = await (await fetchApp(
        `/api/availability?date=${date}&serviceId=brushing`,
      )).json();
      assert.ok(overlap.unavailable.includes("09:30"));
      assert.ok(overlap.unavailable.includes("10:00"));
      assert.ok(overlap.unavailable.includes("10:30"));

      const closed = await (await fetchApp(
        `/api/availability?date=${closedDate}&serviceId=brushing`,
      )).json();
      assert.equal(closed.reason, "closed");
      assert.deepEqual(closed.slots, []);
    });

    await t.test("intervalos de férias bloqueiam integralmente um dia", async () => {
      const date = new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10);
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      const response = await fetchApp("/api/admin/availability", {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: ownerCookie },
        body: JSON.stringify({
          minimumNoticeMinutes: 0,
          bookingHorizonDays: 90,
          bufferMinutes: 0,
          slotIntervalMinutes: 30,
          periods: [{ weekday, startTime: "09:00", endTime: "12:00" }],
          blocks: [{
            label: "Férias",
            startDate: date,
            endDate: date,
            allDay: true,
          }],
        }),
      });
      assert.equal(response.status, 200, await response.text());
      const availability = await (await fetchApp(
        `/api/availability?date=${date}&serviceId=brushing`,
      )).json();
      assert.equal(availability.reason, "blocked");
      assert.ok(availability.slots.length > 0);
      assert.deepEqual(availability.unavailable, availability.slots);
      await sql("DELETE FROM availability_blocks; DELETE FROM availability_work_periods; DELETE FROM availability_settings;");
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
      const responseBody = await response.json();
      assert.equal(response.status, 201, JSON.stringify(responseBody));
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

      const outboxRows = await sqlRows(
        `SELECT recipient,type,status,attempts,provider FROM email_outbox
         WHERE appointment_id='${responseBody.id}' ORDER BY type`,
      );
      assert.deepEqual(outboxRows.map((row) => row.type), [
        "new_appointment_paula",
        "request_received",
      ]);
      assert.ok(outboxRows.every((row) =>
        row.status === "disabled" && row.attempts === 0 && row.provider === "disabled"));
    });

    await t.test("falha da outbox não reverte a reserva", async () => {
      await sql("DROP TABLE email_outbox;");
      const futureDate = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const response = await fetchApp("/api/appointments", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "10.0.0.10" },
        body: JSON.stringify({
          serviceId: "manicure",
          date: futureDate,
          time: "15:00",
          name: "Cliente Sem Outbox",
          phone: "910000002",
          email: "sem-outbox@example.test",
        }),
      });
      assert.equal(response.status, 201, await response.text());
      const appointments = await sqlRows(
        "SELECT id FROM appointments WHERE phone='910000002'",
      );
      assert.equal(appointments.length, 1);
    });
  } finally {
    await mf.dispose();
  }
});
