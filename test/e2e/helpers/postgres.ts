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

  const connectionUrl = new URL(postgresContainer.getConnectionUri())
  connectionUrl.pathname = "/gtfs"
  connectionUrl.searchParams.set("sslmode", "disable")

  await runCmd(`pnpm gtfs:db:migrate`, {
    DATABASE_URL: connectionUrl.toString(),
  })

  return {
    connectionUrl,
    postgresContainer,
  }
}
