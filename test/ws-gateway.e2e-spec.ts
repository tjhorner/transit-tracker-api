import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql"
import { exec } from "child_process"
import { Test } from "@nestjs/testing"
import { INestApplication } from "@nestjs/common"
import { AppModule } from "src/app.module"
import { WsAdapter } from "@nestjs/platform-ws"

async function runCmd(command: string): Promise<{
  stdout: string
  stderr: string
}> {
  return new Promise((resolve, reject) => {
    console.debug(`$ ${command}`)
    exec(
      command,
      {
        env: process.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error)
        }

        console.debug(stdout)

        resolve({
          stdout,
          stderr,
        })
      },
    )
  })
}

describe("WebSocket gateway E2E test", () => {
  jest.setTimeout(60000)

  let postgresContainer: StartedPostgreSqlContainer
  let app: INestApplication

  beforeAll(async () => {
    postgresContainer = await new PostgreSqlContainer()
      .withDatabase("postgres")
      .withUsername("postgres")
      .withPassword("postgres")
      .start()

    const superuserUrl = new URL(postgresContainer.getConnectionUri())
    superuserUrl.pathname = "/gtfs"
    superuserUrl.searchParams.set("sslmode", "disable")
    process.env.SUPERUSER_DATABASE_URL = superuserUrl.toString()

    await runCmd(`pnpm gtfs:db:migrate`)

    const gtfsUserUrl = new URL(postgresContainer.getConnectionUri())
    gtfsUserUrl.pathname = "/gtfs"
    gtfsUserUrl.username = "gtfs"
    gtfsUserUrl.password = "gtfs"
    process.env.DATABASE_URL = gtfsUserUrl.toString()

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      exports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
    await app.init()
  })

  afterAll(async () => {
    await Promise.all([postgresContainer.stop(), app.close()])
  })

  it("works", () => {
    console.log("it sure does")
  })
})
