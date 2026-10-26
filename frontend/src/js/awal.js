// Skrip pertama di setiap halaman: skrip klasik (bukan modul) yang dimuat sinkron di <head>,
// sebelum CSS dan modul halaman, supaya berjalan sedini mungkin. File terpisah karena CSP
// melarang inline script. Dites di tests/unit/awal.test.mjs.
//
// 1. HTTPS: cookie sesi produksi ber-flag Secure, jadi lewat http login tampak gagal tanpa
//    penjelasan. Host publik yang dibuka lewat http dialihkan ke https. Lokal tetap http:
//    localhost, 127.x.x.x, [::1], IP privat (10.x, 172.16–31.x, 192.168.x, mis. HP lewat LAN
//    ke XAMPP) dan *.local. Selama pengalihan, <html data-pindah-https> membuat api.js tidak
//    mengirim request apa pun.
// 2. Parameter `i=N` dari tantangan hosting (InfinityFree redirect ke URL yang sama + ?i=N)
//    dibuang dengan history.replaceState sebelum modul halaman membaca location.search, supaya
//    tidak ikut tersimpan di riwayat, `next` login, atau URL filter. Logika sama dengan
//    buangParamHosting() di lib/rute.js.
(() => {
  'use strict';

  const buangParamHosting = (search) => {
    const bagian = search.replace(/^\?/, '').split('&');
    const sisa = bagian.filter((p) => !/^i=\d+$/.test(p));
    if (sisa.length === bagian.length) return search;
    const q = sisa.filter(Boolean).join('&');
    return q ? `?${q}` : '';
  };

  const hostLokal = (host) =>
    /^(localhost|\[::1\])$/.test(host) ||
    /\.local$/.test(host) ||
    /^(127|10)(\.\d{1,3}){3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}$/.test(host) ||
    /^192\.168(\.\d{1,3}){2}$/.test(host);

  const search = buangParamHosting(location.search);

  if (location.protocol === 'http:' && !hostLokal(location.hostname.toLowerCase())) {
    document.documentElement.setAttribute('data-pindah-https', '');
    location.replace(`https://${location.host}${location.pathname}${search}${location.hash}`);
    return;
  }

  if (search !== location.search) {
    history.replaceState(history.state, '', location.pathname + search + location.hash);
  }
})();
