import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 20000 });
  await page.getByText('歌单').first().click();
  await page.waitForTimeout(3000);
  await page.locator('.gradient-card').first().click();
  await page.waitForTimeout(5000);
  
  const info = await page.evaluate(() => {
    const shell = document.querySelector('.detail-shrink-shell');
    if (!shell) return { error: 'no shell' };
    
    const heroMedia = shell.querySelector('.hero-media');
    if (!heroMedia) return { error: 'no hero-media' };
    
    const heroMediaRect = heroMedia.getBoundingClientRect();
    const coverImg = heroMedia.querySelector('.cover');
    const coverRect = coverImg ? coverImg.getBoundingClientRect() : null;
    
    return {
      heroMedia: { w: Math.round(heroMediaRect.width), h: Math.round(heroMediaRect.height) },
      coverImg: coverRect ? { w: Math.round(coverRect.width), h: Math.round(coverRect.height) } : null,
      detailRect: shell.querySelector('.detail')?.getBoundingClientRect(),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  
  await page.screenshot({ path: '/tmp/app_cover_fixed.png' });
  console.log("Screenshot saved");
  
  await browser.close();
})();
