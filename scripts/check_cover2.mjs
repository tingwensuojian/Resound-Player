import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 20000 });
  await page.getByText('歌单').first().click();
  await page.waitForTimeout(3000);
  await page.locator('.gradient-card').first().click();
  await page.waitForTimeout(5000);
  
  const styles = await page.evaluate(() => {
    const shell = document.querySelector('.detail-shrink-shell');
    if (!shell) return { error: 'no shell' };
    
    const coverImg = shell.querySelector('.cover') || shell.querySelector('.progressive-cover__full');
    if (!coverImg) return { error: 'no cover img' };
    
    const comp = getComputedStyle(coverImg);
    const parentEl = coverImg.parentElement;
    const parentComp = parentEl ? getComputedStyle(parentEl) : null;
    const grandparentEl = parentEl ? parentEl.parentElement : null;
    const grandparentComp = grandparentEl ? getComputedStyle(grandparentEl) : null;
    const heroMedia = shell.querySelector('.hero-media');
    const heroMediaComp = heroMedia ? getComputedStyle(heroMedia) : null;
    
    const heroMediaShell = shell.querySelector('.hero-media-shell');
    const heroMediaShellComp = heroMediaShell ? getComputedStyle(heroMediaShell) : null;
    
    return {
      cover: {
        width: comp.width,
        height: comp.height,
        maxWidth: comp.maxWidth,
        objectFit: comp.objectFit,
      },
      parent: {
        className: parentEl ? parentEl.className : '',
        width: parentComp ? parentComp.width : '',
        height: parentComp ? parentComp.height : '',
      },
      progressiveCover: {
        className: grandparentEl ? grandparentEl.className : '',
        width: grandparentComp ? grandparentComp.width : '',
        height: grandparentComp ? grandparentComp.height : '',
      },
      heroMediaShell: heroMediaShellComp ? {
        width: heroMediaShellComp.width,
        height: heroMediaShellComp.height,
      } : null,
      heroMedia: heroMediaComp ? {
        width: heroMediaComp.width,
        height: heroMediaComp.height,
      } : null,
    };
  });
  console.log(JSON.stringify(styles, null, 2));
  
  await browser.close();
})();
