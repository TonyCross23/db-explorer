import { test, expect } from '@playwright/test';
test('end user can unlock, connect, browse, search and remove a connection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to DB Explorer.' })).toBeVisible();
  await page.getByLabel('Workspace access token').fill('wrong');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByText('That access token is not correct.')).toBeVisible();
  await page.getByLabel('Workspace access token').fill('browser-test-token-never-for-production');
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your databases.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/workspace-overview.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.getByRole('button', { name: 'Workspace information' }).click();
  await page.getByLabel('Text size', { exact: true }).selectOption('18');
  await expect(page.locator('html')).toHaveCSS('font-size', '18px');
  await page.getByRole('button', { name: 'Close workspace settings' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveCSS('font-size', '18px');
  await page.getByRole('button', { name: 'Workspace information' }).click();
  await page.getByLabel('Text size', { exact: true }).selectOption('16');
  await page.getByRole('button', { name: 'Close workspace settings' }).click();
  await page.getByRole('button', { name: 'Add a connection' }).click();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status')).toContainText('Database name:');
  await expect(page.getByRole('status')).toContainText('Database username:');
  await page.getByLabel('Connection name').fill('Local analytics');
  await page.getByLabel('Port', { exact: true }).fill('55432');
  await page.getByLabel('Database', { exact: true }).fill('explorer_test');
  await page.getByLabel('Username', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('wrong_fixture_password');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('status')).toContainText('Database sign-in failed.');
  await page.getByLabel('Password', { exact: true }).fill('fixture_reader_only');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText(/Connected successfully/)).toBeVisible();
  await page.screenshot({ path: 'test-results/connection-dialog.png', fullPage: true });
  await page.getByRole('button', { name: 'Save & connect' }).click();
  await page.getByRole('button', { name: /^customers/ }).click();
  await expect(page.locator('.data-grid tbody tr')).toHaveCount(100);
  await expect(page.getByText('100 rows shown')).toBeVisible();
  await page.screenshot({ path: 'test-results/database-grid.png', fullPage: true });
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 2', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search table rows' }).fill('9007199254740993');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.locator('.data-grid tbody tr')).toHaveCount(1);
  await expect(page.locator('.data-grid')).toContainText('9007199254740993');
  await page.getByRole('button', { name: 'Structure', exact: true }).click();
  await expect(page.locator('.structure-table')).toContainText('full_name');
  await page.getByRole('button', { name: 'Query preview' }).click();
  await expect(page.locator('.query-view pre')).toContainText('SELECT * FROM');
  await page
    .getByRole('button', { name: 'Data', exact: false })
    .filter({ hasText: /^Data/ })
    .first()
    .click();
  await page
    .getByRole('textbox', { name: 'Search table rows' })
    .fill("' OR 1=1; DROP TABLE customers; --");
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.getByRole('heading', { name: 'No rows found' })).toBeVisible();
  await page.getByRole('button', { name: 'Schema diagram', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Schema diagram', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Inspect diagram table orders', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.erd-relationships>path')).toHaveCount(5);
  await page.getByRole('button', { name: 'Inspect diagram table orders', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Diagram table details' })).toContainText(
    'orders_customer_fk',
  );
  await page.screenshot({ path: 'test-results/schema-diagram-dark.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.screenshot({ path: 'test-results/schema-diagram-light.png', fullPage: true });
  await page.getByRole('button', { name: 'Zoom in diagram' }).click();
  await page.getByRole('button', { name: 'Fit diagram' }).click();
  await page.getByLabel('Find table in diagram').fill('order_lines');
  await expect(page.locator('.erd-table')).toHaveCount(1);
  await page.getByLabel('Find table in diagram').fill('');
  await page.getByRole('button', { name: 'Inspect diagram table orders', exact: true }).dblclick();
  await expect(page.getByRole('heading', { name: 'orders table', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Options for Local analytics' }).click();
  await page.getByRole('button', { name: 'Remove connection', exact: true }).click();
  await page.getByRole('button', { name: 'Remove connection', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your databases.' })).toBeVisible();
});
test('SSH form supports agent sign-in independently, password and PEM file with passphrase', async ({
  page,
}) => {
  await page.goto('/#session=browser-test-token-never-for-production');
  await page.getByRole('button', { name: 'Add a connection' }).click();
  await page.getByRole('button', { name: 'TLS / SSL' }).click();
  await expect(page.getByLabel('Use a verified TLS connection')).not.toBeChecked();
  await expect(
    page.getByText('Optional: encrypt the database connection.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'SSH tunnel' }).click();
  await page.getByLabel('Connect through an SSH tunnel').check();
  await expect(page.getByLabel('Authentication', { exact: true })).toHaveValue('agent');
  await expect(page.getByLabel('SSH password', { exact: true })).toHaveCount(0);
  await page.getByLabel('SSH host', { exact: true }).fill('fixture');
  await page.getByLabel('SSH username', { exact: true }).fill('fixture');
  await page.getByLabel('Verified host-key fingerprint').fill('SHA256:' + 'a'.repeat(43));
  await page.route('**/api/v1/connections/ssh-test', async (route) => {
    expect(route.request().postDataJSON().auth).toBe('agent');
    expect(route.request().postDataJSON().database).toBeUndefined();
    await route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.getByRole('button', { name: 'Test SSH sign-in', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('SSH sign-in succeeded.');
  await page.getByLabel('Authentication', { exact: true }).selectOption('password');
  await expect(page.getByLabel('SSH password', { exact: true })).toBeVisible();
  await page.getByLabel('Authentication', { exact: true }).selectOption('key');
  await page.locator('input[type=file]').setInputFiles({
    name: 'server.pem',
    mimeType: 'application/x-pem-file',
    buffer: Buffer.from('-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----'),
  });
  await expect(page.getByLabel('Private key', { exact: true })).toHaveValue(/BEGIN PRIVATE KEY/);
  await page.getByLabel('Key passphrase').fill('passphrase');
  await page.screenshot({ path: 'test-results/ssh-settings.png', fullPage: true });
});
