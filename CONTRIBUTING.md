# Contribution Guidelines

Thank you for contributing to the Transit Tracker project! If you are considering opening a PR, please take a quick look through these guidelines to help you get started.

See also: [development quickstart guide](./docs/development/quickstart.md)

## Discuss Your Changes

If you are implementing a feature which has a wide scope or significant changes, please first open an issue to discuss the proposed changes with the maintainers. This helps ensure that your efforts align with the project's goals and avoids duplicate work.

## Write Tests

It's important to write tests for your changes to ensure maintainability as the project evolves. Please add relevant unit tests in `test/unit` and, if you are making changes to the GTFS feed provider, the E2E tests in `test/e2e`.

## AI/LLM Usage

We allow contributions that utilize AI tools (GitHub Copilot, Claude Code, etc.), but we require them to be disclosed. This helps maintainers understand the context of your change and avoid a deluge of low-quality slop. When opening a PR, you will be asked to specify if AI was used to assist and, if so, to what extent.

## Pull Request Template

To ensure maintainers have all the relevant information related to your contribution, we have a [template](./.github/PULL_REQUEST_TEMPLATE.md) that you must follow when opening a PR. If anything is missing, a maintainer will request the information before proceeding with review/merge.
