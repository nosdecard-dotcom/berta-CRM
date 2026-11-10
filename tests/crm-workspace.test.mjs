import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const modules = {
  "next/navigation": 'export function redirect(path) { throw Error(path); }',
  "@/lib/supabase/ssr-server": 'export const createSupabaseServerClient = () => globalThis.mockWorkspaceClient;',
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(modules, specifier)) {
      return { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent(modules[specifier]) };
    }
    return nextResolve(specifier, context);
  },
});
const { requireCrmWorkspace } = await import("../lib/crm-workspace.ts");
hooks.deregister();

function fakeSession(t, { role, profileRole = role, active = true, profileError = null } = {}) {
  const profileReads = [];
  globalThis.mockWorkspaceClient = {
    auth: {
      getClaims: async () => role ? {
        data: { claims: { sub: "fictitious-user", app_metadata: { role } } },
      } : { data: null },
    },
    from(table) {
      assert.equal(table, "profiles");
      return {
        select() { return this; },
        eq(key, value) { profileReads.push([key, value]); return this; },
        async maybeSingle() {
          return { data: { full_name: "Cuenta ficticia", role: profileRole, is_active: active }, error: profileError };
        },
      };
    },
  };
  t.after(() => delete globalThis.mockWorkspaceClient);
  return profileReads;
}

test("workspace sections require a signed-in user", async t => {
  const reads = fakeSession(t);
  await assert.rejects(requireCrmWorkspace(), { message: "/login" });
  assert.deepEqual(reads, []);
});

test("active agents can open their workspace and cannot open reports by URL", async t => {
  const reads = fakeSession(t, { role: "agent" });
  assert.equal((await requireCrmWorkspace()).role, "agent");
  await assert.rejects(requireCrmWorkspace({ supervisorsOnly: true }), { message: "/dashboard" });
  assert.deepEqual(reads, [["id", "fictitious-user"]]);
});

for (const role of ["admin", "manager"]) {
  test(`active ${role} can open reports`, async t => {
    fakeSession(t, { role });
    assert.equal((await requireCrmWorkspace({ supervisorsOnly: true })).role, role);
  });
}

for (const [label, options] of [
  ["inactive profile", { active: false }],
  ["stale role", { profileRole: "agent" }],
  ["profile lookup failure", { profileError: { code: "MOCK" } }],
]) {
  test(`${label} cannot access reports`, async t => {
    fakeSession(t, { role: "manager", ...options });
    await assert.rejects(requireCrmWorkspace({ supervisorsOnly: true }), { message: "/dashboard" });
  });
}
