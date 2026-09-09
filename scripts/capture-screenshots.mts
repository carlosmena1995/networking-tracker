/**
 * Capture the README's evidence screenshots by driving a real browser through
 * the real app. Reproducible on demand, so the evidence cannot drift from the
 * code the way hand-taken screenshots do.
 *
 * Uses the system Chrome via puppeteer-core, so nothing is downloaded.
 *
 * Run:  npm run screenshots            (against http://localhost:3000)
 *       BASE_URL=https://… npm run screenshots
 */

import { mkdir, rm } from 'node:fs/promises';
import puppeteer, { type Browser, type ElementHandle, type Page } from 'puppeteer-core';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const OUT = 'docs/screenshots';
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// A throwaway account for the walkthrough. Nothing here is secret.
const DEMO = {
  name: 'Carlos Mena',
  email: process.env.DEMO_EMAIL ?? 'demo.walkthrough@berkeley.edu',
  password: process.env.DEMO_PASSWORD ?? 'DemoPassword2026!',
};

const CONTACTS = [
  { name: 'Priya Nair', company: 'McKinsey', role: 'Engagement Manager', met_at: 'Consulting club panel', notes: 'Offered to run a mock case.', priority: 'high' },
  { name: 'Marcus Webb', company: 'Anthropic', role: 'Recruiter', met_at: 'Tech trek SF', notes: 'Wants my resume by Friday.', priority: 'high' },
  { name: 'Dana Ruiz', company: 'Sequoia Capital', role: 'Partner', met_at: 'Haas career fair', notes: 'Follow up in two weeks about the summer internship.', priority: 'medium' },
  { name: 'Tom Alvarez', company: 'Stripe', role: 'PM', met_at: 'Alumni mixer', notes: 'Berkeley MBA 2019.', priority: 'low' },
];

let step = 0;
async function shot(page: Page, label: string) {
  step += 1;
  const file = `${OUT}/${String(step).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: file as `${string}.png` });
  console.log(`  saved ${file}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Click the first element whose trimmed text matches exactly.
 *
 * Pass a dialog-scoped selector for anything inside a modal: the page header
 * also has an "Add contact" button, and it comes first in the DOM, so an
 * unscoped lookup clicks the wrong one and silently reopens the dialog.
 */
async function clickText(page: Page, selector: string, text: string) {
  const handle = await page.evaluateHandle(
    (sel, want) =>
      ([...document.querySelectorAll(sel)].find(
        (el) => el.textContent?.trim() === want,
      ) ?? null) as Element | null,
    selector,
    text,
  );
  const element = handle.asElement() as ElementHandle<Element> | null;
  if (!element) throw new Error(`No ${selector} with text "${text}"`);
  await element.click();
  await sleep(600);
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser: Browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--window-size=1280,860'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 2 });

    // --- Signed out -------------------------------------------------------
    console.log(`Capturing against ${BASE_URL}`);
    await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'networkidle2' });
    await shot(page, 'sign-in');

    // --- Sign up (or sign in if the account already exists) ---------------
    await clickText(page, 'button', 'Need an account? Sign up');
    await page.type('#name', DEMO.name);
    await page.type('#email', DEMO.email);
    await page.type('#password', DEMO.password);
    await shot(page, 'sign-up-filled');
    await clickText(page, 'button', 'Create account');
    await sleep(4000);

    if (!page.url().includes('/contacts')) {
      // Account already exists - sign in instead.
      await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'networkidle2' });
      await page.type('#email', DEMO.email);
      await page.type('#password', DEMO.password);
      await clickText(page, 'button', 'Sign in');
      await sleep(4000);
    }
    if (!page.url().includes('/contacts')) {
      throw new Error(`Could not reach /contacts. Landed on ${page.url()}`);
    }

    // --- Start from a clean list ------------------------------------------
    await page.evaluate(async () => {
      const res = await fetch('/api/contacts', { cache: 'no-store' });
      const { contacts } = await res.json();
      for (const c of contacts) await fetch(`/api/contacts/${c.id}`, { method: 'DELETE' });
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    await shot(page, 'empty-state');

    // --- Validation failure ------------------------------------------------
    await clickText(page, 'button', 'Add your first contact');
    await sleep(800);
    await clickText(page, '[role="dialog"] button', 'Add contact');
    await sleep(1500);
    await shot(page, 'validation-empty-name');

    // Now fill it in properly.
    await page.type('#name', CONTACTS[0].name);
    await page.type('#company', CONTACTS[0].company);
    await page.type('#role', CONTACTS[0].role);
    await page.type('#met_at', CONTACTS[0].met_at);
    await page.type('#notes', CONTACTS[0].notes);
    await clickText(page, '[role="dialog"] button', 'Add contact');
    await sleep(2500);
    await shot(page, 'contact-created');

    // --- Seed the rest through the same API the UI uses -------------------
    await page.evaluate(async (rest) => {
      for (const c of rest) {
        await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(c),
        });
      }
    }, CONTACTS.slice(1));

    // --- Persistence across a full reload ---------------------------------
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);
    await shot(page, 'list-after-refresh');

    // --- Filter -----------------------------------------------------------
    await page.goto(`${BASE_URL}/contacts`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.type('#search', 'haas');
    await sleep(1800);
    await shot(page, 'search-filter');
    await page.click('#search', { count: 3 });
    await page.keyboard.press('Backspace');
    await sleep(1500);

    // --- Edit -------------------------------------------------------------
    // Scope to the table: the mobile card layout renders the same buttons and
    // comes first in the DOM, but is hidden at this width and so unclickable.
    await clickText(page, 'table button', 'Edit');
    await sleep(1000);
    await shot(page, 'edit-dialog');
    await clickText(page, '[role="dialog"] button', 'Cancel');
    await sleep(600);

    // --- Delete confirmation ----------------------------------------------
    await clickText(page, 'table button', 'Delete');
    await sleep(1000);
    await shot(page, 'delete-confirm');

    // --- Mobile -----------------------------------------------------------
    const mobile = await browser.newPage();
    await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
    await mobile.goto(`${BASE_URL}/contacts`, { waitUntil: 'networkidle2' });
    await sleep(2500);
    await shot(mobile, 'mobile-list');
    await mobile.close();

    // --- Signed out again --------------------------------------------------
    await page.goto(`${BASE_URL}/contacts`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    await clickText(page, 'button', 'Sign out');
    await sleep(3000);
    await shot(page, 'signed-out');

    console.log(`\nDone. ${step} screenshots in ${OUT}/`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('\nScreenshot capture failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
