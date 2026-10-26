// Cek apakah browser Playwright bisa diluncurkan di mesin ini.
// Pakai: node qa/tools/launch-check.cjs chromium firefox webkit
// Env: QA_WEBKIT_EXEC (wrapper WebKit WPE, qa/tools/setup-webkit.py),
//      QA_FIREFOX_EXEC (wrapper Firefox, qa/tools/setup-firefox.sh)
const pw = require('playwright');

(async () => {
  let gagal = 0;
  for (const name of process.argv.slice(2)) {
    try {
      const args = name === 'chromium' ? ['--no-sandbox'] : [];
      const opts = { headless: true, timeout: 60000, args };
      if (name === 'webkit' && process.env.QA_WEBKIT_EXEC) opts.executablePath = process.env.QA_WEBKIT_EXEC;
      if (name === 'firefox' && process.env.QA_FIREFOX_EXEC) opts.executablePath = process.env.QA_FIREFOX_EXEC;
      const b = await pw[name].launch(opts);
      const p = await b.newPage();
      await p.setContent('<h1>ok</h1>');
      console.log(`${name}: OK versi ${b.version()} -> ${await p.textContent('h1')}`);
      await b.close();
    } catch (e) {
      gagal++;
      console.log(`${name}: GAGAL ${String(e.message).slice(0, 1500)}`);
    }
  }
  process.exit(gagal ? 1 : 0);
})();
