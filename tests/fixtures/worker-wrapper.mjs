import app from "../../dist/server/index.js";

const worker = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/__test/sql" && request.headers.get("x-test-control") === "paula-auth-tests") {
      const sql = await request.text();
      try {
        const result = await env.DB.prepare(sql).run();
        return Response.json(result);
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 500 });
      }
    }
    return app.fetch(request, env, ctx);
  },
};

export default worker;
