import { defineConfig } from "drizzle-kit";

const isApplicationMode = Boolean(process.env.IS_APP_MODE);
const dirPath = isApplicationMode ? "sqlite" : "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing database url from .env");
}

export default defineConfig({
  schema: `./src/database/${dirPath}/schemas`,
  out: `./src/database/${dirPath}/migrations`,
  dialect: isApplicationMode ? "sqlite" : "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
