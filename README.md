# CodeWidget

Paste any widget code, preview it instantly and pin it to your desktop.

Ask Claude or ChatGPT for a widget, paste the code in, press **Add widget**. That's it. No account, no setup, free and open source.

**Try it in your browser: [thomaslrw.github.io/CodeWidget](https://thomaslrw.github.io/CodeWidget/)**. Paste code, see it live, then get the app to put it on your desktop. CodeWidget is for desktop computers, not phones.

- **Paste and preview.** Code on the left, a live preview at the real size on the right.
- **Any code from any AI.** HTML, CSS and JavaScript in one file. Code copied straight from a chat, fences and all, works.
- **Fully interactive.** Buttons, inputs, clicks, animations, fetching from the web.
- **Any size.** Pick a preset or type your own, then drag the corner to resize.
- **Remembers its data.** Each widget keeps its own saved data (localStorage), so trackers and to-do lists survive a restart.
- **Sandboxed.** Widget code can't touch your files, run commands or reach the rest of the app.
- **Mac, Windows and Linux.**

## Download

Get the latest version from [Releases](https://github.com/thomaslrw/codewidget/releases/latest):

| Computer | File |
| --- | --- |
| Mac with Apple silicon (M1, M2, M3, M4, M5) | `CodeWidget-mac-arm64.dmg` |
| Mac with Intel | `CodeWidget-mac-x64.dmg` |
| Windows | `CodeWidget-windows-x64-setup.exe` |
| Linux | `CodeWidget-linux-x86_64.AppImage` |

Not sure which Mac you have? Apple menu, then **About This Mac**, and look at **Chip**.

## Install

CodeWidget isn't signed by Apple or Microsoft yet, so your computer warns you the first time. This is a one-time step.

**Mac**

1. Open the `.dmg` and drag CodeWidget into Applications.
2. Open CodeWidget. You'll see "Apple could not verify...". Click **Done**.
3. Open **System Settings**, then **Privacy & Security**, scroll down and click **Open Anyway** next to CodeWidget.
4. Confirm with your password. From then on it opens normally.

**Windows**

Run the installer. If you see "Windows protected your PC", click **More info**, then **Run anyway**.

**Linux**

Make the AppImage executable (`chmod +x CodeWidget-linux-x86_64.AppImage`) and run it.

## Use

1. Click **Copy AI prompt**, paste it into Claude or ChatGPT and describe your widget (a habit tracker, a countdown, a to-do list, a clock).
2. Paste the code it gives you into CodeWidget. The preview updates as you paste.
3. Set the size, give it a name and click **Add widget**. It appears on your desktop.

Hover over a widget to see its controls:

- **::: move**: drag to move it.
- **Pin**: keep it above other windows.
- **Edit**: open its code in CodeWidget.
- **Hide**: hide it. Bring it back from the CodeWidget icon in your menu bar (Mac) or system tray (Windows and Linux).
- The corner grip in the bottom right resizes it.

Widgets stay put when you close the editor. CodeWidget keeps running in the menu bar or tray, and **Open at login** brings your widgets back when you start your computer.

## Writing widgets yourself

A widget is one HTML file. A bare snippet is fine: CodeWidget wraps it in a page with a transparent background.

```html
<div class="card">Hello</div>
<style>
  .card { height: 100vh; display: grid; place-items: center; background: #111; color: #fff; border-radius: 20px; }
</style>
<script>
  // Anything you like. Use localStorage to keep data between restarts.
</script>
```

Tips:

- Fill the window with `100vw` and `100vh`.
- The window itself is transparent, so give your widget a background and rounded corners.
- Libraries can be loaded from a CDN with a `<script src="...">` tag.
- Links open in your normal browser.

## What widgets can't do

Widget code runs in a sandbox, like a web page. It can't read your files, run commands, or use the camera, microphone or location. That's on purpose, because people share widget code.

## Build from source

You need [Node.js](https://nodejs.org) 22 or later.

```sh
npm install
npm start          # run it
npm test           # run the tests
npm run dist       # build an app for your computer into dist/
```

Every pull request is built for Mac, Windows and Linux by GitHub Actions, and every version merged to `main` is published to Releases. To publish a new version, bump `version` in `package.json`.

The website lives in `site/` and is published to GitHub Pages on every push to `main` (it uses `src/code.js` too, so the preview matches the app). To try it locally, copy `src/code.js` and `assets/icon.png` into `site/` and open `site/index.html`.

## Licence

[MIT](LICENSE). Free to use, change and share.
