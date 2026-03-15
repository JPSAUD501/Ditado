const { app } = require('electron');
const { writeFileSync, appendFileSync } = require('fs');
writeFileSync('.codex-uiohook-smoke.log', 'start\n');
app.whenReady().then(() => {
  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.on('keydown', (e) => appendFileSync('.codex-uiohook-smoke.log', `keydown ${JSON.stringify(e)}\n`));
    uIOhook.start();
    appendFileSync('.codex-uiohook-smoke.log', 'hook started\n');
  } catch (error) {
    appendFileSync('.codex-uiohook-smoke.log', `hook error ${String(error && error.stack || error)}\n`);
  }
  setTimeout(() => {
    appendFileSync('.codex-uiohook-smoke.log', 'done\n');
    app.quit();
  }, 3000);
});
