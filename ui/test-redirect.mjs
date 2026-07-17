import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(2000);
    
    const url = page.url();
    console.log('FINAL URL:', url);
    
    const content = await page.content();
    if (content.includes('Welcome to CM Transcription')) {
        console.log('SUCCESS: Setup page loaded.');
    } else {
        console.log('FAILED: Setup page NOT loaded.');
    }
    
    await browser.close();
})();
