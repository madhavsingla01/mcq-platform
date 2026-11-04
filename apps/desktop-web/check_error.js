import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('ErrorBoundary') || msg.text().includes('Something went wrong')) {
      console.log('PAGE ERROR LOG:', msg.text());
    } else {
      console.log('PAGE LOG:', msg.text());
    }
  });
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  console.log('Navigating to login...');
  const appUrl = process.env.DESKTOP_APP_URL;
  if (!appUrl) throw new Error('DESKTOP_APP_URL is required');
  await page.goto(new URL('/login', appUrl), { waitUntil: 'networkidle0' });
  
  console.log('Logging in...');
  await page.type('input[type="email"]', 'test@test.com');
  await page.type('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  
  console.log('Waiting for navigation...');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });

  console.log('Clicking on Upload link...');
  await page.click('a[href="/upload"]');
  
  console.log('Waiting 2 seconds...');
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
