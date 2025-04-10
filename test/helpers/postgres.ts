import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { exec } from "child_process"

async function runCmd(
  command: string,
  env: Record<string, string>,
): Promise<{
  stdout: string
  stderr: string
}> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      { env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
        }

        resolve({
          stdout,
          stderr,
        })
      },
    )
  })
}

export async function setupTestDatabase() {
  const postgresContainer = await new PostgreSqlContainer()
    .withDatabase("postgres")
    .withUsername("postgres")
    .withPassword("postgres")
    .start()

  const superuserUrl = new URL(postgresContainer.getConnectionUri())
  superuserUrl.pathname = "/gtfs"
  superuserUrl.searchParams.set("sslmode", "disable")

  await runCmd(`pnpm gtfs:db:migrate`, {
    SUPERUSER_DATABASE_URL: superuserUrl.toString(),
  })

  const gtfsUserUrl = new URL(postgresContainer.getConnectionUri())
  gtfsUserUrl.pathname = "/gtfs"
  gtfsUserUrl.username = "gtfs"
  gtfsUserUrl.password = "gtfs"

  return {
    superuserUrl,
    gtfsUserUrl,
    postgresContainer,
  }
}
