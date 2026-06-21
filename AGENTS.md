# Repository Guidelines

## Project Structure & Module Organization

This is a WeChat Mini Program cloud-development project. Frontend code lives in `miniprogram/`, with pages under `miniprogram/pages`, reusable utilities in `miniprogram/utils`, shared styles in `miniprogram/styles`, and icons/assets in `miniprogram/assets`. Cloud functions live in `cloudfunctions/`: `api` is the main action-routed business function, `init-db` creates collections, and `seed` initializes catalog data. Contract and policy tests are plain Node.js scripts in `scripts/test-*.js`. Project configuration is in `project.config.json` and `miniprogram/app.json`.

## Build, Test, and Development Commands

Use `rtk` before local shell commands in this workspace.

- `rtk node scripts/test-navigation-and-pool-contract.js` runs one focused contract test.
- `rtk proxy sh -c 'count=0; for f in scripts/test-*.js; do node "$f" || exit 1; count=$((count+1)); done; echo "contract_tests=$count"'` runs the full local contract suite.
- `rtk proxy sh -c 'node --check cloudfunctions/api/index.js && python3 -m json.tool miniprogram/app.json >/dev/null'` checks key JavaScript syntax and JSON validity.
- Use WeChat Developer Tools to compile, preview, upload, and deploy cloud functions.

## Coding Style & Naming Conventions

Use CommonJS JavaScript (`require`, `module.exports`) and two-space indentation. Keep changes small and consistent with nearby code. Page files follow WeChat conventions: `index.js`, `index.wxml`, `index.wxss`, `index.json`. API actions use dotted names such as `drift.claim` and are routed through `cloudfunctions/api/index.js`. Prefer explicit, descriptive names over abbreviations.

## Testing Guidelines

Tests are lightweight contract scripts using Node’s `assert`. Add or update a relevant `scripts/test-*.js` file whenever behavior, UI text, routing, policy, or compliance constraints change. Run the most specific test first, then the full suite. Local contract tests passing does not prove cloud deployment or real-device behavior; verify those separately in WeChat Developer Tools.

## Commit & Pull Request Guidelines

No Git history is available in this workspace, so use concise imperative commit messages, for example `fix: update drift tab order` or `test: lock publish reward policy`. Pull requests should describe user-visible changes, list local tests run, mention cloud functions that require upload, and include screenshots for UI changes.

## Security & Configuration Tips

Do not commit secrets. Configure `TANSHU_API_KEY` and cloud environment IDs outside source control. Do not run cloud deployments, database initialization, seed, or migrations unless explicitly authorized. Keep audit-sensitive areas free of user-generated notes, image uploads, or social-sharing surfaces unless the compliance contract is updated intentionally.
