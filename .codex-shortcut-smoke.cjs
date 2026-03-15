const { app, globalShortcut } = require('electron');
const { writeFileSync, appendFileSync } = require('fs');
writeFileSync('.codex-shortcut-smoke.log', 'start\n');
app.whenReady().then(() => {
  const tests = ['Control+D', 'Alt+D', 'CommandOrControl+D'];
  for (const accel of tests) {
    const ok = globalShortcut.register(accel, () => appendFileSync('.codex-shortcut-smoke.log', `fired ${accel}\n`));
    appendFileSync('.codex-shortcut-smoke.log', `register ${accel} ${ok} ${globalShortcut.isRegistered(accel)}\n`);
  }
  setTimeout(() => {
    appendFileSync('.codex-shortcut-smoke.log', 'done\n');
    app.quit();
  }, 1000);
});
