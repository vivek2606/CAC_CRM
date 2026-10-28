import { execSync } from "node:child_process";

// The schema in the test database before the run. Non-destructive: an empty
// database gets the tables; an existing test database is brought up to date
// (Prisma refuses changes that would lose data). The tests are written to
// pass on a database that already holds earlier test runs' data.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  if (!/test/i.test(url)) throw new Error("TEST_DATABASE_URL must point at a test database (its name containing 'test').");
  execSync("npx prisma db push --skip-generate", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
