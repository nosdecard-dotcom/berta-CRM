import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { registerHooks } from "node:module";
import { test } from "node:test";

const orderId = "10000000-0000-4000-8000-000000000001";
const conversationId = "10000000-0000-4000-8000-000000000002";
const productId = "10000000-0000-4000-8000-000000000003";
const item = { product_name: "Fusion Shampoo", quantity: 1, retail_unit_price_bob: 100 };
const origin = "https://crm.example.invalid";
const secret = "mock-app-secret";
const failure = { code: "MOCK_WRITE", message: "Simulated write error" };

// Only the framework, authentication, database and AI boundaries are replaced.
const modules = {
  "next/server": "export const NextRequest = Request; export const NextResponse = Response;",
  "@/lib/supabase/ssr-server": `export const createSupabaseServerClient = () => ({
    auth: { getClaims: async () => ({
      data: { claims: { sub: "test-user", app_metadata: { role: "admin" } } },
    }) },
  });`,
  "@/lib/supabase/server": "export const createServerSupabaseClient = () => globalThis.testDatabase;",
  "@/lib/contacts": `export const getOrCreateCustomer = async () => ({ id: "customer" });
    export const getOrCreateConversation = async () => ({ id: "${conversationId}" });
    export const isBotEnabledForConversation = () => true;`,
  "@/lib/agent": `export const shouldEscalateToHuman = () => false;
    export const generateBertaReply = async () => "Ya registramos tu pedido.";`,
};

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(modules, specifier)) {
      return { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent(modules[specifier]) };
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL("../" + specifier.slice(2) + ".ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const orders = await import("../app/api/orders/route.ts");
const webhook = await import("../app/api/webhook/route.ts");
hooks.deregister();

function setup(t, { fault, outcome, legacyStatus } = {}) {
  const state = {
    order: {
      id: orderId, status: legacyStatus ?? "new", confirmation_sent_at: null,
      confirmation_send_error: null, conversation_id: conversationId, customer_id: "customer",
      conversation: { assigned_to: null }, items: [item],
    },
    messages: [],
    calls: [],
  };
  const product = { id: productId, name: item.product_name, sku: "MOCK1", price_bob: 100, is_active: true };
  function query(table) {
    let operation = "read";
    let values;
    const filters = [];
    const matchingOrder = () => state.order && filters.every(([key, value]) => state.order[key] === value);
    async function execute() {
      if (operation === "read") {
        if (table === "sales_orders") {
          if (filters.some(([key]) => key === "source_message_id")) return { data: null };
          return { data: matchingOrder() ? { ...state.order } : null };
        }
        const rows = {
          profiles: { is_active: true, role: "admin" },
          customers: { phone: "000000000000" },
          conversations: { customer_id: "customer", status: "open" },
          catalog_products: values === "id,sku,name,price_bob" ? [product] : product,
          messages: [],
        };
        assert.ok(Object.hasOwn(rows, table), "Unexpected table " + table);
        return { data: rows[table] };
      }
      if (table === "sales_orders") {
        if (operation === "insert") {
          if (fault === "order-insert") return { error: failure };
          state.order = { id: orderId, ...values };
          return { data: { id: orderId } };
        }
        if (operation === "delete") {
          if (matchingOrder()) state.order = null;
          return {};
        }
        if (values.status === "confirmed" && fault === "claim") return { error: failure };
        if (values.confirmation_sent_at) {
          if (fault === "mark") return { error: failure };
          if (fault === "mark-no-row") return { data: null, error: null };
          if (fault === "mark-rejects") throw Error("Simulated connection loss");
        }
        if (!matchingOrder()) return { data: null, error: null };
        Object.assign(state.order, values);
        return { data: { id: orderId } };
      }
      if (table === "sales_order_items") return fault === "item" ? { error: failure } : {};
      if (table === "messages") {
        if (values.direction === "inbound" && fault === "inbound") return { error: failure };
        if (values.direction === "outbound" && fault === "history") return { error: failure };
        if (values.whatsapp_message_id && state.messages.some(row =>
          row.whatsapp_message_id === values.whatsapp_message_id)) return { data: null };
        state.messages.push(values);
        return { data: { id: "mock-message-" + state.messages.length } };
      }
      assert.ok(["customers", "conversations"].includes(table) && operation === "update");
      return {};
    }
    const builder = {
      select(fields) { if (operation === "read") values = fields; return this; },
      eq(key, value) { filters.push([key, value]); return this; },
      is(key, value) { return this.eq(key, value); },
      in() { return this; },
      order() { return this; },
      limit() { return this; },
      insert(row) { operation = "insert"; values = row; return this; },
      upsert(row) { return this.insert(row); },
      update(row) { operation = "update"; values = row; return this; },
      delete() { operation = "delete"; return this; },
      single: execute,
      maybeSingle: execute,
      then(resolve, reject) { return execute().then(resolve, reject); },
    };
    return builder;
  }

  globalThis.testDatabase = { from: query };
  const env = { WHATSAPP_PHONE_NUMBER_ID: "mock-sender", WHATSAPP_ACCESS_TOKEN: "mock-token", WHATSAPP_APP_SECRET: secret };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    delete globalThis.testDatabase;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/mock-sender\/messages$/);
    assert.equal(options.headers.Authorization, "Bearer mock-token");
    assert.equal(options.method, "POST");
    const payload = JSON.parse(options.body);
    assert.equal(payload.to, "000000000000");
    state.calls.push(payload);
    if (outcome === "reject") throw Error("Simulated connection loss");
    if (typeof outcome === "number") return Response.json({ error: "simulated" }, { status: outcome });
    if (outcome === "missing-id") return Response.json({ messages: [{}] });
    return Response.json({ messages: [{ id: "wamid.mock" }] });
  });
  return state;
}

function orderRequest(status = "confirmed") {
  return new Request(origin + "/api/orders", {
    method: "PATCH", headers: { origin },
    body: JSON.stringify({
      orderId, status, paymentMethod: "transfer_qr", recipientFullName: "Cliente Ficticio",
      deliveryCity: "Cochabamba", deliveryAddress: "Calle de prueba",
      googleMapsUrl: "https://maps.app.goo.gl/mock",
    }),
  });
}

function inboundRequest() {
  const body = JSON.stringify({ entry: [{ changes: [{ field: "messages", value: {
    messages: [{ id: "wamid.inbound", from: "000000000000", type: "text",
      text: { body: "quiero 1 MOCK1" } }],
  } }] }] });
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return new Request(origin + "/api/webhook", {
    method: "POST", headers: { "x-hub-signature-256": "sha256=" + signature }, body,
  });
}

test("order item write failure never reports creation and removes the incomplete order", async t => {
  const state = setup(t, { fault: "item" });
  const response = await orders.POST(new Request(origin + "/api/orders", {
    method: "POST", headers: { origin }, body: JSON.stringify({ conversationId, productId, quantity: 1 }),
  }));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).ok, undefined);
  assert.equal(state.order, null);
  assert.equal(state.calls.length, 0);
});

test("failure to save the order status prevents any send", async t => {
  const state = setup(t, { fault: "claim" });
  const response = await orders.PATCH(orderRequest());
  assert.equal(response.status, 500);
  assert.equal(state.order.status, "new");
  assert.equal(state.calls.length, 0);
});

for (const outcome of [400, 429, 503, "reject", "missing-id"]) {
  test(`WhatsApp ${outcome} leaves confirmation unverified and blocks a repeated send`, async t => {
    const state = setup(t, { outcome });
    const response = await orders.PATCH(orderRequest());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).orderUpdated, true);
    assert.equal(state.order.confirmation_sent_at, null);
    assert.ok(state.order.confirmation_send_error);
    assert.equal(state.messages.length, 0);
    assert.equal((await orders.PATCH(orderRequest())).status, 409);
    assert.equal(state.calls.length, 1);
  });
}

for (const fault of ["mark", "mark-no-row", "mark-rejects", "history"]) {
  test(`Supabase ${fault} after provider acceptance reports partial failure and never sends again`, async t => {
    const state = setup(t, { fault });
    const response = await orders.PATCH(orderRequest());
    assert.equal(response.status, 500);
    assert.equal((await response.json()).orderUpdated, true);
    assert.equal(Boolean(state.order.confirmation_sent_at), fault === "history");
    if (fault !== "history") assert.equal(state.messages[0].whatsapp_message_id, "wamid.mock");
    assert.equal((await orders.PATCH(orderRequest("preparing"))).status, 200);
    assert.equal((await orders.PATCH(orderRequest("verifying"))).status, 409);
    assert.equal((await orders.PATCH(orderRequest())).status, 409);
    assert.equal(state.calls.length, 1);
  });
}

test("two concurrent confirmations send once and record the provider id", async t => {
  const state = setup(t);
  const responses = await Promise.all([orders.PATCH(orderRequest()), orders.PATCH(orderRequest())]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.ok(state.order.confirmation_sent_at);
  assert.equal(state.order.confirmation_send_error, null);
  assert.equal(state.calls.length, 1);
  assert.equal(state.messages[0].whatsapp_message_id, "wamid.mock");
});

test("legacy confirmed orders with no recorded provider result cannot be reopened to resend", async t => {
  const state = setup(t, { legacyStatus: "confirmed" });
  assert.equal((await orders.PATCH(orderRequest("cancelled"))).status, 200);
  assert.equal((await orders.PATCH(orderRequest("new"))).status, 409);
  assert.equal((await orders.PATCH(orderRequest())).status, 409);
  assert.equal(state.calls.length, 0);
});

for (const fault of ["order-insert", "item"]) {
  test(`webhook ${fault} uses a failure message and suppresses repeat notifications`, async t => {
    const state = setup(t, { fault });
    assert.equal((await webhook.POST(inboundRequest())).status, 200);
    assert.equal((await webhook.POST(inboundRequest())).status, 200);
    assert.equal(state.calls.length, 1);
    assert.match(state.calls[0].text.body, /no pudimos registrar/i);
    assert.doesNotMatch(state.calls[0].text.body, /ya registramos/i);
  });
}

test("webhook inbound history write failure does not send a reply", async t => {
  const state = setup(t, { fault: "inbound" });
  assert.equal((await webhook.POST(inboundRequest())).status, 500);
  assert.equal(state.calls.length, 0);
});

test("webhook outbound history write failure does not resend on a Meta retry", async t => {
  const state = setup(t, { fault: "history" });
  assert.equal((await webhook.POST(inboundRequest())).status, 500);
  assert.equal((await webhook.POST(inboundRequest())).status, 200);
  assert.equal(state.calls.length, 1);
});

test("webhook with an unverified send records no sent message and does not resend", async t => {
  const state = setup(t, { outcome: "missing-id" });
  assert.equal((await webhook.POST(inboundRequest())).status, 200);
  assert.equal((await webhook.POST(inboundRequest())).status, 200);
  assert.equal(state.calls.length, 1);
  assert.equal(state.messages.find(row => row.direction === "outbound").delivery_status, "failed");
});
