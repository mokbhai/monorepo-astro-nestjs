# Capacitor mobile apps

This template can ship Astro frontends as native Android and iOS apps using
[Capacitor](https://capacitorjs.com/). Each frontend is a separate mobile app
with its own bundle identifier.

## Convention: `capacitor.config.ts` makes a frontend mobile-capable

> **An Astro app can be wrapped as a Capacitor app iff it has
> `apps/<name>/capacitor.config.ts`.**

The bundled examples are:

- `apps/web` — primary frontend (`com.workspacestarter.web`)
- `apps/secondary-web` — secondary frontend (`com.workspacestarter.secondaryweb`)

Override identifiers and display names with environment variables:

- `CAPACITOR_APP_ID` — reverse-DNS bundle id (no dashes)
- `CAPACITOR_APP_NAME` — app label on the home screen

Mobile builds always compile the frontend as a **static site at `/`**, even when
the same app is mounted under a subpath for `apps/web-host`. Set
`PUBLIC_API_URL` to the production API origin before syncing so the mobile
bundle talks to the right backend.

## Local workflow

```bash
# Install dependencies (once)
pnpm install

# Build the web bundle and sync into native projects
pnpm capacitor:sync web

# Add native projects the first time (Android works on Linux/macOS/Windows;
# iOS requires macOS with Xcode and CocoaPods)
pnpm capacitor:init web

# Open the native IDE
pnpm --filter @workspace-starter/web capacitor:open:android
pnpm --filter @workspace-starter/web capacitor:open:ios
```

Per-app shortcuts also exist, e.g. `pnpm --filter @workspace-starter/web capacitor:sync`.

## CI release workflows

Two manual GitHub Actions workflows build store-ready artifacts:

| Workflow                                                                        | Runner          | Default artifact       |
| ------------------------------------------------------------------------------- | --------------- | ---------------------- |
| [Capacitor Android Release](../.github/workflows/capacitor-android-release.yml) | `ubuntu-latest` | Debug APK              |
| [Capacitor iOS Release](../.github/workflows/capacitor-ios-release.yml)         | `macos-latest`  | Debug simulator `.app` |

Trigger them from **Actions → workflow → Run workflow**.

### Android signing secrets (release builds)

| Secret                      | Purpose                                  |
| --------------------------- | ---------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded `.jks` / `.keystore` file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                        |
| `ANDROID_KEY_ALIAS`         | Key alias                                |
| `ANDROID_KEY_PASSWORD`      | Key password                             |

Debug APK builds do not require secrets.

### iOS signing secrets (release builds)

| Secret / variable                     | Purpose                           |
| ------------------------------------- | --------------------------------- |
| `APPLE_CERTIFICATE_BASE64`            | Distribution certificate (`.p12`) |
| `APPLE_CERTIFICATE_PASSWORD`          | Certificate password              |
| `APPLE_PROVISIONING_PROFILE_BASE64`   | App Store provisioning profile    |
| `APPLE_TEAM_ID` (repository variable) | Apple Developer team id           |

Debug simulator builds do not require signing secrets.

## Adding Capacitor to a new frontend

1. Create an Astro app under `apps/<name>`.
2. Add `capacitor.config.ts` and Capacitor dependencies (copy from `apps/web`).
3. Run `pnpm capacitor:init <name>`.
4. Add `<name>` to the workflow `app` choice lists if you want CI builds.
