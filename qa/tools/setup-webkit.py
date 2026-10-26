#!/usr/bin/env python3
"""Siapkan Playwright WebKit (WPE, dibangun di Ubuntu 24.04) di Amazon Linux 2023 tanpa root.

Masalah: build WebKit Playwright 1.64.1 butuh glibc >= 2.38, sistem ini 2.34. Solusi
(hanya di bawah /projects/sandbox/.tools):
  1. Unduh paket .deb Ubuntu 24.04 (daftar dari install-dependencies.sh bawaan WebKit),
     ekstrak ke .tools/webkit-root.
  2. Salin minibrowser-wpe ke .tools/webkit-wpe, ubah interpreter ELF (patchelf) ke
     ld-linux milik glibc Ubuntu.
  3. Tulis wrapper .tools/webkit-wpe/run.sh untuk executablePath Playwright.

Pakai: PYTHONPATH=/projects/sandbox/.tools/py python3 qa/tools/setup-webkit.py
"""
import gzip
import io
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import urllib.request

import zstandard

T = '/projects/sandbox/.tools'
SRC = f'{T}/pw-browsers/webkit-2370/minibrowser-wpe'
ROOT = f'{T}/webkit-root'
DEBS = f'{T}/webkit-debs'
OUT = f'{T}/webkit-wpe'
PATCHELF = f'{T}/py/bin/patchelf'
MIRROR = 'http://archive.ubuntu.com/ubuntu'
SUITES = ['noble-updates', 'noble-security', 'noble']
COMPONENTS = ['main', 'universe']


EXTRA = ['mesa-libgallium', 'libegl-mesa0', 'libgbm1']
# Paket yang tidak perlu ditarik sebagai dependensi (skrip/daemon, bukan library).
SKIP = {'debconf', 'dpkg', 'perl-base', 'base-files', 'init-system-helpers', 'adduser',
        'libc-bin', 'tzdata', 'passwd', 'login', 'sensible-utils', 'ucf', 'dconf-gsettings-backend',
        'gsettings-backend', 'default-dbus-session-bus', 'dbus-session-bus', 'systemd', 'udev'}


def load_index():
    idx, deps, provides = {}, {}, {}
    for suite in SUITES:
        for comp in COMPONENTS:
            url = f'{MIRROR}/dists/{suite}/{comp}/binary-amd64/Packages.gz'
            data = gzip.decompress(urllib.request.urlopen(url, timeout=60).read()).decode('utf-8', 'replace')
            for block in data.split('\n\n'):
                m = re.search(r'^Package: (.+)$', block, re.M)
                f = re.search(r'^Filename: (.+)$', block, re.M)
                if not (m and f) or m.group(1) in idx:  # suite pertama (updates) menang
                    continue
                name = m.group(1)
                idx[name] = f.group(1)
                d = []
                for key in ('Pre-Depends', 'Depends'):
                    mm = re.search(rf'^{key}: (.+)$', block, re.M)
                    if mm:
                        for alt in mm.group(1).split(','):
                            first = alt.split('|')[0].strip().split(' ')[0].split(':')[0]
                            d.append(first)
                deps[name] = d
                pv = re.search(r'^Provides: (.+)$', block, re.M)
                if pv:
                    for p in pv.group(1).split(','):
                        provides.setdefault(p.strip().split(' ')[0], name)
    return idx, deps, provides


def resolve(roots, idx, deps, provides):
    seen, stack = set(), list(roots)
    while stack:
        p = stack.pop()
        if p in SKIP:
            continue
        if p not in idx and p in provides:
            p = provides[p]
        if p in seen or p not in idx:
            continue
        seen.add(p)
        stack.extend(deps.get(p, []))
    return sorted(seen)


def extract_deb(path, dest):
    with open(path, 'rb') as fh:
        data = fh.read()
    assert data[:8] == b'!<arch>\n'
    pos = 8
    while pos < len(data):
        name = data[pos:pos + 16].decode().strip()
        size = int(data[pos + 48:pos + 58].decode().strip())
        body = data[pos + 60:pos + 60 + size]
        pos += 60 + size + (size % 2)
        if name.startswith('data.tar'):
            if name.endswith('.zst'):
                body = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(body)).read()
                mode = 'r:'
            elif name.endswith('.xz'):
                mode = 'r:xz'
            elif name.endswith('.gz'):
                mode = 'r:gz'
            else:
                mode = 'r:'
            with tarfile.open(fileobj=io.BytesIO(body), mode=mode) as tf:
                for m in tf.getmembers():
                    if m.isdev():
                        continue
                    try:
                        tf.extract(m, dest, filter='fully_trusted')
                    except Exception:
                        pass


def main():
    script = open(f'{SRC}/install-dependencies.sh').read()
    pkgs = re.search(r'REQUIREDPACKAGES="([^"]+)"', script).group(1).split()
    pkgs = [p.split(':')[0] for p in pkgs]
    os.makedirs(DEBS, exist_ok=True)
    os.makedirs(ROOT, exist_ok=True)
    idx, deps, provides = load_index()
    pkgs = resolve(pkgs + EXTRA, idx, deps, provides)
    missing = [p for p in pkgs if p not in idx]
    if missing:
        print('paket tidak ditemukan di indeks:', missing)
    for p in pkgs:
        if p not in idx:
            continue
        fn = os.path.join(DEBS, os.path.basename(idx[p]))
        if not os.path.exists(fn):
            urllib.request.urlretrieve(f'{MIRROR}/{idx[p]}', fn)
        extract_deb(fn, ROOT)
    print(f'{len(pkgs) - len(missing)} paket diekstrak ke {ROOT}')

    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(SRC, OUT, symlinks=True)
    ld = f'{ROOT}/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'
    if not os.path.exists(ld):
        ld = f'{ROOT}/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'
    for b in os.listdir(f'{OUT}/bin'):
        subprocess.run([PATCHELF, '--set-interpreter', ld, f'{OUT}/bin/{b}'], check=True)
    # Hanya modul TLS GIO; modul proxy (libproxy / gnome) butuh GSettings schema.
    giodir = f'{OUT}/gio-modules'
    os.makedirs(giodir, exist_ok=True)
    os.symlink(f'{ROOT}/usr/lib/x86_64-linux-gnu/gio/modules/libgiognutls.so', f'{giodir}/libgiognutls.so')
    os.makedirs(f'{T}/empty', exist_ok=True)
    libpath = ':'.join([
        f'{OUT}/lib', f'{OUT}/sys/lib',
        f'{ROOT}/usr/lib/x86_64-linux-gnu', f'{ROOT}/lib/x86_64-linux-gnu',
    ])
    run = f'''#!/bin/sh
# Wrapper WebKit WPE untuk Playwright (executablePath). Lihat qa/tools/setup-webkit.py.
D={OUT}
export WEBKIT_EXEC_PATH="$D/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$D/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$D/share"
export GIO_MODULE_DIR="$D/gio-modules"
export GSETTINGS_BACKEND=memory
export GST_PLUGIN_SYSTEM_PATH="{T}/empty"
export EGL_PLATFORM=surfaceless
export GST_REGISTRY_FORK=no
export FONTCONFIG_FILE="{ROOT}/etc/fonts/fonts.conf"
export XDG_DATA_DIRS="{ROOT}/usr/share:/usr/share"
export LIBGL_DRIVERS_PATH="{ROOT}/usr/lib/x86_64-linux-gnu/dri"
export __EGL_VENDOR_LIBRARY_DIRS="{ROOT}/usr/share/glvnd/egl_vendor.d"
export LD_LIBRARY_PATH="{libpath}"
export WEBKIT_FORCE_COMPLEX_TEXT=1
exec "$D/bin/MiniBrowser" "$@"
'''
    with open(f'{OUT}/run.sh', 'w') as fh:
        fh.write(run)
    os.chmod(f'{OUT}/run.sh', 0o755)
    print('wrapper:', f'{OUT}/run.sh')


if __name__ == '__main__':
    sys.exit(main())
