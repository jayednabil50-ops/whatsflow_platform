/**
 * One-time admin bootstrap.
 *
 * Creates the owner user in Supabase Auth using the credentials configured
 * in environment variables, then ensures a matching `profiles` row exists.
 *
 * Run AFTER deploying database migrations:
 *   node scripts/setup-admin.js
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   WHATSFLOW_ADMIN_EMAIL       (defaults to first WHATSFLOW_OWNER_EMAILS entry)
 *   WHATSFLOW_ADMIN_PASSWORD    (required — set this in your hosting platform)
 *
 * The script is idempotent — re-running it will reset the password to the
 * current WHATSFLOW_ADMIN_PASSWORD if the user already exists.
 */

const path = require("node:path");
const fs = require("node:fs");

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv(path.join(__dirname, "..", ".env.local"));
loadLocalEnv(path.join(__dirname, "..", ".env.production"));

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail =
    process.env.WHATSFLOW_ADMIN_EMAIL ||
    (process.env.WHATSFLOW_OWNER_EMAILS || "").split(",")[0].trim();
  const adminPassword = process.env.WHATSFLOW_ADMIN_PASSWORD;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "[setup-admin] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }

  if (!adminEmail) {
    console.error(
      "[setup-admin] Set WHATSFLOW_ADMIN_EMAIL or WHATSFLOW_OWNER_EMAILS first."
    );
    process.exit(1);
  }

  if (!adminPassword) {
    console.error(
      "[setup-admin] Missing WHATSFLOW_ADMIN_PASSWORD. Set this and re-run."
    );
    process.exit(1);
  }

  if (adminPassword.length < 8) {
    console.error(
      "[setup-admin] WHATSFLOW_ADMIN_PASSWORD must be at least 8 characters."
    );
    process.exit(1);
  }

  const { createClient } = require(path.join(
    __dirname,
    "..",
    "node_modules",
    "@supabase",
    "supabase-js"
  ));
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log(`[setup-admin] Looking up ${adminEmail}…`);

  // Try to find existing user by listing through pages.
  let existing = null;
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200
    });
    if (error) {
      console.error("[setup-admin] Failed to list auth users:", error.message);
      process.exit(1);
    }
    existing = (data?.users || []).find(
      (user) => user.email && user.email.toLowerCase() === adminEmail.toLowerCase()
    );
    if (existing || (data?.users || []).length < 200) break;
    page += 1;
  }

  let adminId;
  if (existing) {
    console.log("[setup-admin] User exists — resetting password.");
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: adminPassword,
      email_confirm: true
    });
    if (error) {
      console.error("[setup-admin] Failed to update admin user:", error.message);
      process.exit(1);
    }
    adminId = data.user.id;
  } else {
    console.log("[setup-admin] User does not exist — creating.");
    const { data, error } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: "WhatsFlow Admin" }
    });
    if (error) {
      console.error("[setup-admin] Failed to create admin user:", error.message);
      process.exit(1);
    }
    adminId = data.user.id;
  }

  // Make sure the profiles row exists and is on the owner plan locally.
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: adminId,
      email: adminEmail,
      full_name: "WhatsFlow Admin",
      plan: "owner"
    },
    { onConflict: "id" }
  );
  if (profileError) {
    console.error(
      "[setup-admin] Failed to upsert admin profile:",
      profileError.message
    );
    process.exit(1);
  }

  console.log("[setup-admin] ✅ Admin ready.");
  console.log(`               Email:    ${adminEmail}`);
  console.log(`               Password: (the one you set in env)`);
  console.log(
    "               Login at /login and you'll automatically have full owner/admin access."
  );
}

main().catch((error) => {
  console.error("[setup-admin] Unexpected failure:", error);
  process.exit(1);
});
