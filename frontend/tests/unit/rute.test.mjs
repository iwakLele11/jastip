import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buangParamHosting, idDariQuery, nextAman } from '../../src/js/lib/rute.js';

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

test('buangParamHosting: hanya i=<angka> dari tantangan hosting yang dibuang', () => {
  assert.equal(buangParamHosting('?id=3&i=1'), '?id=3');
  assert.equal(buangParamHosting('?i=1&id=3&status=lunas'), '?id=3&status=lunas');
  assert.equal(buangParamHosting('?i=12'), '');
  assert.equal(buangParamHosting('?po=3&i=1&customer=5&i=2'), '?po=3&customer=5');
  for (const tetap of ['', '?id=3', '?i=', '?i=abc', '?pi=1', '?ii=1', '?item=2', '?next=%2Fpo.html%3Fi%3D1']) {
    assert.equal(buangParamHosting(tetap), tetap, tetap);
  }
});

test('nextAman menerima URL dengan ?i=N tambahan, lalu membuangnya', () => {
  assert.equal(nextAman('/po.html?id=3&status=lunas&i=1', O), '/po.html?id=3&status=lunas');
  assert.equal(nextAman('/keranjang.html?i=2&po=3&customer=5', O), '/keranjang.html?po=3&customer=5');
  assert.equal(nextAman('/?i=1', O), '/');
  assert.equal(nextAman('/login.html?i=1', O), null);
});
