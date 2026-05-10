#!/usr/bin/env bash
# Декларативная настройка pm2-logrotate. Запускать один раз на новом хосте
# либо при изменении полиси. Idempotent — pm2 set безопасен к повторам.
#
# Текущая полиси:
#   - max 100MB на файл (≥ нашего worst-case за день)
#   - 10 ротированных копий → ~1GB на сервис worst-case
#   - gzip → exfil-сжимает в ~10×, реально ~100MB на сервис
#   - daily rotate в 00:00 + size-trigger
set -euo pipefail

echo "[logrotate] устанавливаю модуль pm2-logrotate (если нет)…"
pm2 list | grep -q "pm2-logrotate" || pm2 install pm2-logrotate

echo "[logrotate] применяю конфигурацию…"
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 10
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateInterval "0 0 * * *"
pm2 set pm2-logrotate:rotateModule true

echo "[logrotate] готово. Текущая конфигурация:"
pm2 conf pm2-logrotate
