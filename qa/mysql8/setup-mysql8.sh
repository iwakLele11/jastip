#!/usr/bin/env bash
# Memasang MySQL 8.4 LTS (tarball generic Linux "minimal") di /projects/sandbox/.tools/mysql8,
# plus libaio dan libnuma (diekstrak dari RPM Amazon Linux, tanpa install sistem).
set -euo pipefail
T=/projects/sandbox/.tools
VER="${MYSQL8_VERSION:-8.4.13}"
F="mysql-$VER-linux-glibc2.28-x86_64-minimal.tar.xz"
MD5_DIHARAPKAN="${MYSQL8_MD5:-fb536f5d26e3e43e933aec34679c0740}"   # dari dev.mysql.com untuk 8.4.13

mkdir -p "$T/mysql8-dl" "$T/mysql8" "$T/mysql8-libs" "$T/rpms-mysql"
cd "$T/mysql8-dl"
[ -s "$F" ] || curl -fSL -o "$F" "https://dev.mysql.com/get/Downloads/MySQL-8.4/$F"
echo "$MD5_DIHARAPKAN  $F" | md5sum -c -
[ -x "$T/mysql8/bin/mysqld" ] || tar -xJf "$F" -C "$T/mysql8" --strip-components=1

D="--setopt=cachedir=$T/dnf-cache --setopt=logdir=$T/dnf-log --setopt=persistdir=$T/dnf-cache/persist"
mkdir -p "$T/dnf-log"
dnf -y -q $D install --downloadonly --downloaddir="$T/rpms-mysql" libaio numactl-libs || true
cd "$T/mysql8-libs"
for r in "$T"/rpms-mysql/*.rpm; do rpm2archive - < "$r" | tar -xzf -; done
LD_LIBRARY_PATH="$T/mysql8-libs/usr/lib64" "$T/mysql8/bin/mysqld" --version
