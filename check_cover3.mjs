import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 20000 });
  await page.getByText('歌单').first().click();
  await page.waitForTimeout(3000);
  await page.locator('.gradient-card').first().click();
  await page.waitForTimeout(5000);
  
  // Check if .cover CSS from detail-page.css is actually in the CSSOM
  const cssCheck = await page.evaluate(() => {
    // Search all stylesheets for .cover rule
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const sheet = document.styleSheets[i];
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          if (rule instanceof CSSStyleRule && rule.selectorText === '.cover') {
            return {
              found: true,
              sheetIndex: i,
              cssText: rule.cssText,
              width: rule.style.width,
            };
          }
        }
      } catch (e) {
        // cross-origin stylesheet, skip
      }
    }
    return { found: false };
  });
  console.log(".cover in CSSOM:", JSON.stringify(cssCheck, null, 2));
  
  // Also check what the actual applied styles are for the cover element
  const rules = await page.evaluate(() => {
    const shell = document.querySelector('.detail-shrink-shell');
    if (!shell) return { error: 'no shell' };
    const cover = shell.querySelector('.cover');
    if (!cover) return { error: 'no cover' };
    
    // Check which CSS rules apply
    const matches = [];
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const sheet = document.styleSheets[i];
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          if (rule instanceof CSSStyleRule && cover.matches(rule.selectorText)) {
            matches.push({
              selector: rule.selectorText,
              cssText: rule.cssText.substring(0, 100),
              width: rule.style.width,
            });
          }
        }
      } catch (e) {
        // skip
      }
    }
    return matches;
  });
  console.log("\nMatching CSS rules:");
  rules.forEach(r => console.log(`  ${r.selector}: width=${r.width}`));
  
  await browser.close();
})();
