// src/js/awal.js (skrip klasik, bukan modul): dijalankan di node:vm dengan location/history palsu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buangParamHosting } from '../../src/js/lib/rute.js';

const KODE = readFileSync(new URL('../../src/js/awal.js', import.meta.url), 'utf8');

/** Menjalankan awal.js untuk `href`; mengembalikan tujuan location.replace / replaceState. */
function jalankan(href) {
  const u = new URL(href);
  const hasil = { replace: null, replaceState: null, atribut: {} };
  const location = {
    href: u.href, protocol: u.protocol, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash,
    replace: (url) => {
      hasil.replace = url;
    },
  };
  const history = {
    state: null,
    replaceState: (_s, _t, url) => {
      hasil.replaceState = url;
    },
  };
  const document = { documentElement: { setAttribute: (k, v) => (hasil.atribut[k] = v) } };
  vm.runInNewContext(KODE, { location, history, document });
  return hasil;
}

test('http di host lokal / IP privat / *.local tetap http', () => {
  for (const href of [
    'http://localhost/', 'http://localhost:8080/po.html?id=3', 'http://LOCALHOST/',
    'http://127.0.0.1:8090/', 'http://127.1.2.3/', 'http://[::1]:8080/',
    'http://10.0.0.5/', 'http://10.255.255.255/',
    'http://172.16.0.1/', 'http://172.20.10.2/', 'http://172.31.255.255/',
    'http://192.168.1.10/jastip/index.html', 'http://192.168.0.1:8080/',
    'http://jastip.local/', 'http://laptop-budi.local:8080/keranjang.html?po=1&customer=2',
  ]) {
    const h = jalankan(href);
    assert.equal(h.replace, null, href);
    assert.deepEqual(h.atribut, {}, href);
  }
});

test('http di host publik → location.replace ke https (path, query, hash, port tetap)', () => {
  const kasus = [
    ['http://jastip.infinityfreeapp.com/', 'https://jastip.infinityfreeapp.com/'],
    ['http://jastip.example/po.html?id=3&status=lunas#x', 'https://jastip.example/po.html?id=3&status=lunas#x'],
    ['http://example.com:8080/login.html', 'https://example.com:8080/login.html'],
    ['http://172.15.0.1/', 'https://172.15.0.1/'],
    ['http://172.32.0.1/', 'https://172.32.0.1/'],
    ['http://192.169.0.1/', 'https://192.169.0.1/'],
    ['http://11.0.0.1/', 'https://11.0.0.1/'],
    ['http://8.8.8.8/', 'https://8.8.8.8/'],
    ['http://10.0.0.1.nip.io/', 'https://10.0.0.1.nip.io/'],
    ['http://192.168.1.1.example.com/', 'https://192.168.1.1.example.com/'],
    ['http://localhost.example.com/', 'https://localhost.example.com/'],
    ['http://jastip.localdomain/', 'https://jastip.localdomain/'],
    ['http://local/', 'https://local/'],
    ['http://[2001:db8::1]/', 'https://[2001:db8::1]/'],
  ];
  for (const [href, tujuan] of kasus) {
    const h = jalankan(href);
    assert.equal(h.replace, tujuan, href);
    assert.equal(h.atribut['data-pindah-https'], '', href);
    assert.equal(h.replaceState, null, href);
  }
});

test('https tidak pernah dialihkan', () => {
  for (const href of ['https://jastip.example/', 'https://localhost/', 'https://192.168.1.10/po.html?id=1']) {
    assert.equal(jalankan(href).replace, null, href);
  }
});

test('pengalihan https sekaligus membuang ?i=N', () => {
  assert.equal(jalankan('http://jastip.example/po.html?id=3&i=1').replace, 'https://jastip.example/po.html?id=3');
  assert.equal(jalankan('http://jastip.example/?i=2#q=rina').replace, 'https://jastip.example/#q=rina');
});

test('?i=N dari hosting dibuang dengan replaceState (parameter lain dan hash tetap)', () => {
  const kasus = [
    ['https://jastip.example/po.html?id=3&i=1', '/po.html?id=3'],
    ['https://jastip.example/po.html?i=2&id=3&status=lunas#q=a', '/po.html?id=3&status=lunas#q=a'],
    ['https://jastip.example/?i=1', '/'],
    ['https://jastip.example/keranjang.html?po=3&customer=5&i=3', '/keranjang.html?po=3&customer=5'],
    ['https://jastip.example/po.html?id=3&pesan=po-dibuat&i=1', '/po.html?id=3&pesan=po-dibuat'],
    ['https://jastip.example/login.html?next=%2Fpo.html%3Fid%3D3&i=1', '/login.html?next=%2Fpo.html%3Fid%3D3'],
    ['http://127.0.0.1:8090/po.html?id=3&i=1', '/po.html?id=3'],
  ];
  for (const [href, tujuan] of kasus) {
    const h = jalankan(href);
    assert.equal(h.replace, null, href);
    assert.equal(h.replaceState, tujuan, href);
  }
});

test('URL tanpa ?i=N tidak disentuh', () => {
  for (const href of [
    'https://jastip.example/po.html?id=3', 'https://jastip.example/po.html?i=abc', 'https://jastip.example/po.html?pi=1',
    'https://jastip.example/po.html?id=3&ii=1', 'https://jastip.example/po.html?item=1', 'https://jastip.example/customer.html#i=1',
    'https://jastip.example/',
  ]) {
    assert.equal(jalankan(href).replaceState, null, href);
  }
});

test('awal.js dan buangParamHosting (rute.js) memberi hasil yang sama', () => {
  for (const search of ['', '?id=3', '?id=3&i=1', '?i=1', '?i=1&i=2', '?a=1&&i=4', '?i=x', '?next=%2Fpo.html%3Fid%3D3&i=10']) {
    const harap = buangParamHosting(search);
    const h = jalankan(`https://jastip.example/po.html${search}`);
    assert.equal(h.replaceState ?? `/po.html${search}`, `/po.html${harap}`, search);
  }
});
