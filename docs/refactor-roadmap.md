# Refactor roadmap

The immediate focus is to untangle the monolithic dashboard scripts while keeping day-to-day scenarios smooth for contributors. The plan follows the "20/80" principle: identify the 20 % of modules that drive 80 % of usage (connection, mappings, request log, demo walkthrough) and stabilise them first.

## 1. Slice business logic into focused modules
- Break down `js/features.js` and `js/managers.js` by domain (connection, mappings, requests, scenarios, notifications). Each resulting module should stay below ~800 lines to simplify review and testing.
- Promote shared helpers (caching, filtering, formatting) into a `src/shared/` area once the build system is in place.
- Keep UI wiring shallow: container components listen to store events instead of reading globals from `window`.

## 2. Demo mode with mocked client
- Replace the current placeholder Demo button with a mock API client that feeds canned mappings, requests, and history objects.
- Ensure every modal (edit mapping, request preview, JSON editor) can bootstrap from the mock data without network calls.
- Reuse fixtures inside automated tests so the demo experience and tests remain aligned.

## 3. Business-logic-first test strategy
- Expand unit coverage around the core store/cache modules using mocked HTTP layers; avoid coupling to DOM rendering.
- Add regression suites for optimistic cache updates, mapping CRUD, and request filters, using the same fixtures as Demo mode.
- Reserve browser/E2E checks for high-value happy paths once the modules are modularised.

## 4. Staged migration to modules
1. Introduce a build tool (Vite/Webpack) and migrate scripts to `src/` as ES modules.
2. Create a central store module encapsulating state, replacing `window` globals.
3. Iteratively peel domain modules off `features.js`/`managers.js`, validating that file sizes drop below the 800-line target after each slice.
4. Update the checklist and docs as each milestone lands to keep the team aligned.

## 5. Tooling and automation
- Add linting and formatting rules once modules stabilise to enforce consistent boundaries.
- Extend the CI pipeline to run the business-logic unit suite and (eventually) Playwright smoke flows using the demo fixtures.

This roadmap keeps contributors focused on the highest-impact slices while making the Demo experience self-sufficient for onboarding and manual QA.
