import "reflect-metadata";

Object.assign(process.env, {
  MODE: "application",
  NODE_ENV: "test",
  DATABASE_URL: "file:///tmp/test-interview-khichuri.db",
  FRONTEND_URL: "http://localhost:3000",
});
