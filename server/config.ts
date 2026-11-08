import dotenv from "dotenv";
// The user's repository-local .env is authoritative over inherited process values.
// Never expose values through the config API; only expose readiness and model IDs.
if (process.env.TALKWEAVE_SKIP_ENV !== "1") {
  dotenv.config({ override: true, quiet: true });
}
