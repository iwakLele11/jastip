import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idDariQuery, nextAman } from '../../src/js/lib/rute.js';

const O = 'https://jastip.example';

test('nextAman menerima path internal aplikasi', () => {
  assert.equal(nextAman('/po.html?id=3&status=lunas', O), '/po.html?id=3&status=lunas');
  assert.equal(nextAman('/', O), '/');
  assert.equal(nextAman('/index.html', O), '/index.html');
  assert.equal(nextAman('/customer-form.html?id=5', O), '/customer-form.html?id=5');
  assert.equal(nextAman('/app/pengaturan.html', O), '/app/pengaturan.html'); // deploy di subfolder
});

test('nextAman menolak open redirect dan tujuan aneh', () => {
  for (const salah of [
    null, undefined, '', 'po.html', 'https://evil.example/po.html', '//evil.example/po.html',
    '/\\evil.example/po.html', '/%0d%0aSet-Cookie:x', '/\tpo.html', ' /po.html', 'javascript:alert(1)',
    '/login.html', '/login.html?next=/po.html', '/api/v1/open-po', '/backend/.env', '/po.html/../../etc',
    '/x'.repeat(1001),
  ]) {
    assert.equal(nextAman(salah, O), null, String(salah));
  }
});

test('idDariQuery: bilangan bulat positif saja', () => {
  assert.equal(idDariQuery('12'), 12);
  for (const salah of [null, '', '0', '-1', '1.5', '01', 'abc', '12a', '12345678901']) {
    assert.equal(idDariQuery(salah), null, String(salah));
  }
});
