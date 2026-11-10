import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const mocks = {
  "next/navigation": "export function redirect(path) { throw Error(path); }",
  "@/lib/supabase/server": 'export function createServerSupabaseClient() { throw Error("Unexpected catalog access"); }',
  "@/lib/supabase/ssr-server": "export const createSupabaseServerClient = () => globalThis.bertaPromptSession;",
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(mocks, specifier)) {
      return { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent(mocks[specifier]) };
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL("../" + specifier.slice(2) + ".ts", import.meta.url).href, context);
    }
    if (specifier === "./prompt-limits") return nextResolve("./prompt-limits.ts", context);
    return nextResolve(specifier, context);
  },
});
const { testBertaPrompt } = await import("../app/berta/prompt-actions.ts");
hooks.deregister();

function setup(t, { role = "admin", environment = "preview", status = 200 } = {}) {
  globalThis.bertaPromptSession = {
    auth: { getClaims: async () => ({ data: { claims: { sub: "fictional-admin", app_metadata: { role } } } }) },
    from(table) {
      assert.equal(table, "profiles");
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: { role, is_active: true } }; },
      };
    },
  };
  const previous = { VERCEL_ENV: process.env.VERCEL_ENV, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY };
  Object.assign(process.env, { VERCEL_ENV: environment, OPENROUTER_API_KEY: "fake-key" });
  t.after(() => {
    delete globalThis.bertaPromptSession;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    requests.push(JSON.parse(options.body).messages);
    return Response.json({ choices: [{ message: { content: "Respuesta ficticia" } }] }, { status });
  });
  return requests;
}

test("simulation combines base rules with the draft and uses only the model", async t => {
  const requests = setup(t);
  const result = await testBertaPrompt("Usá un saludo breve.", "¿Hacen envíos?");
  assert.deepEqual(result, { reply: "Respuesta ficticia" });
  assert.equal(requests.length, 1);
  const messages = requests[0];
  assert.match(messages[0].content, /Reglas obligatorias/);
  assert.match(messages[1].content, /compatibles.*Usá un saludo breve\./s);
  assert.match(messages[2].content, /simulación sin catálogo/);
  assert.deepEqual(messages[3], { role: "user", content: "¿Hacen envíos?" });
});

test("non-admin cannot call the simulator", async t => {
  const requests = setup(t, { role: "manager" });
  await assert.rejects(testBertaPrompt("", "Hola"), { message: "/dashboard" });
  assert.equal(requests.length, 0);
});

test("production disables the simulator before the model call", async t => {
  const requests = setup(t, { environment: "production" });
  assert.match((await testBertaPrompt("", "Hola")).error, /entorno de pruebas/);
  assert.equal(requests.length, 0);
});

test("oversized drafts and empty test messages are rejected without a model call", async t => {
  const requests = setup(t);
  assert.ok((await testBertaPrompt("x".repeat(6001), "Hola")).error);
  assert.ok((await testBertaPrompt("", "  ")).error);
  assert.equal(requests.length, 0);
});

test("provider failure is shown as a failed simulation", async t => {
  const requests = setup(t, { status: 503 });
  const result = await testBertaPrompt("", "Hola");
  assert.match(result.error, /No se pudo obtener/);
  assert.equal(result.reply, undefined);
  assert.equal(requests.length, 1);
});
