import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // Create a download path
    const downloadPath = process.cwd() + '/test_downloads';
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadPath,
    });

    console.log("Navigating to app...");
    // We assume the settings page is available or accessible
    await page.goto('http://localhost:5173');
    
    // Evaluate some data into localStorage to test export
    await page.evaluate(() => {
        localStorage.setItem('globalSettings', JSON.stringify({ backupLabel: 'RoundTripTest' }));
        localStorage.setItem('personalTables', JSON.stringify([{ id: '1', name: 'Test Table', source: 'TestSrc' }]));
    });

    await page.reload();

    // The app usually has a router, let's navigate to settings
    // If it's hash router or history router, maybe there's a link or we can go to /settings
    // Let's see the DOM first to find the settings link
    const html = await page.content();
    if (html.includes('Settings') || html.includes('settings')) {
        // Find a settings link
    }
    console.log("Setting up done. DOM size:", html.length);
    await browser.close();
})();
