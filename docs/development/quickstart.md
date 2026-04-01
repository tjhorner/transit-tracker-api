# Development Quick Start

## Prerequisites

- [Node.js](https://nodejs.org/en)
- [pnpm](https://pnpm.io/)
- A container runtime: [Docker](https://www.docker.com/), [Podman](https://podman.io/), etc.

## Install & Run

First, install dependencies:

```shell
pnpm install
```

Copy and source the development environment variables (but hopefully not forever, see [#34](https://github.com/tjhorner/transit-tracker-api/issues/34)):

```shell
cp .env.development .env && source .env
```

Then run in development mode, which watches for changes and automatically restarts:

```shell
pnpm start:dev
```

If you are working with the GTFS database, also see [details on setting up the development database](gtfs-database.md#development-database).

## Formatting

This project uses Prettier for formatting. Run this command to automatically format your changes before submitting:

```shell
pnpm format
```

## Testing

There are two test suites: unit tests and end-to-end tests.

### Unit Tests

Exactly as they sound — they run quickly and are as isolated as possible. For mocking dependencies, you can use `vitest-mock-extended` to create a mock for a specified service and either pass it directly (recommended when possible), or use [the NestJS testing module](https://docs.nestjs.com/fundamentals/testing).

Run unit tests:

```shell
pnpm test
```

### E2E Tests

These tests are primarily meant to test the GTFS module due to the complexity involved and the number of things that can subtly go wrong. It spins up real Postgres and Redis instances using [Testcontainers](https://testcontainers.com/) and imports a set of test GTFS feeds.

Run E2E tests:

```shell
pnpm test:e2e
```
