import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 20000 });
  await page.getByText('歌单').first().click();
  await page.waitForTimeout(3000);
  await page.locator('.gradient-card').first().click();
  await page.waitForTimeout(5000);
  
  // Check what the cover image looks like
  const coverInfo = await page.evaluate(() => {
    const shell = document.querySelector('.detail-shrink-shell');
    if (!shell) return { error: 'no shell' };
    
    // Find hero-bg
    const heroBg = shell.querySelector('.hero-bg');
    const bgImage = heroBg?.getAttribute('style');
    
    // Find HeroCoverMedia images
    const heroMedia = shell.querySelector('.hero-media');
    const heroImages = heroMedia ? Array.from(heroMedia.querySelectorAll('img')).map(i => ({
      src: i.getAttribute('src')?.substring(0, 100),
      className: i.className,
      loaded: i.classList.contains('loaded'),
      naturalWidth: i.naturalWidth,
      naturalHeight: i.naturalHeight,
      rect: i.getBoundingClientRect(),
    })) : [];
    
    // Find the cover image specifically
    const coverImg = shell.querySelector('.cover, .progressive-cover__full');
    const coverRect = coverImg?.getBoundingClientRect();
    
    return {
      heroBgStyle: bgImage?.substring(0, 100),
      heroImages,
      coverRect: coverRect ? { w: coverRect.width, h: coverRect.height } : null,
    };
  });
  console.log(JSON.stringify(coverInfo, null, 2));
  
  // Also check the PlaylistDetailPage's playlist data
  console.log("\n=== All images in shell ===");
  const allImgs = await page.evaluate(() => {
    const shell = document.querySelector('.detail-shrink-shell');
    if (!shell) return [];
    return Array.from(shell.querySelectorAll('img')).map(i => ({
      src: (i.getAttribute('src') || '').substring(0, 80),
      classes: i.className.substring(0, 60),
      visible: i.getBoundingClientRect().width > 0,
      rect: { w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height) },
    }));
  });
  console.log(JSON.stringify(allImgs, null, 2));
  
  await page.screenshot({ path: '/tmp/app_cover_check.png' });
  
  await browser.close();
})();
