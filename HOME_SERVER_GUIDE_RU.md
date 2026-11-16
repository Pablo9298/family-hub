# Family Hub — домашний сервер

## 1. Общая информация

Family Hub размещён на домашнем компьютере с Arch Linux.

Frontend, Node.js/Express и PostgreSQL работают локально. Доступ с других устройств осуществляется через Tailscale Serve по HTTPS.

**Адрес приложения:** `https://pablo9298.tail62ffac.ts.net`

Приложение доступно, пока домашний компьютер включён, подключён к интернету и необходимые службы работают.

## 2. Где что находится

| Компонент | Расположение |
|---|---|
| Исходный код | `/home/pablo9298/Projects/family-hub` |
| Backend | `family-hub/backend/` |
| Frontend | `family-hub/frontend/` |
| Основная конфигурация | `family-hub/.env` |
| Конфигурация разработки | `family-hub/.env.development` |
| Docker Compose | `family-hub/compose.yml` |
| Служба backend | `/etc/systemd/system/family-hub.service` |
| Служба резервирования | `/etc/systemd/system/family-hub-backup.service` |
| Таймер резервирования | `/etc/systemd/system/family-hub-backup.timer` |
| Скрипт резервирования | `/usr/local/bin/family-hub-backup.sh` |
| Резервные копии | `/home/pablo9298/family-hub-backups/` |

## 3. Базы данных

PostgreSQL работает в Docker-контейнере `family-hub-db`.

- `family_hub` — основная база для реальных семейных данных.
- `family_hub_dev` — база для разработки и тестирования.

Данные PostgreSQL сохраняются в Docker volume, смонтированном в `/var/lib/postgresql/data` внутри контейнера.

**Важно:** Git-ветки и базы данных независимы. База выбирается через `NODE_ENV` и настройки backend.

## 4. Запуск приложения

### Семейный режим

Production backend запускается автоматически через systemd:

```bash
sudo systemctl status family-hub
sudo systemctl restart family-hub
sudo systemctl stop family-hub
sudo systemctl start family-hub
```

При этом используется `NODE_ENV=production`, база `family_hub` и локальный адрес `127.0.0.1:3001`.

Для просмотра логов:

```bash
sudo journalctl -u family-hub -n 50 --no-pager
```

### Режим разработки

```bash
cd /home/pablo9298/Projects/family-hub/backend
npm run dev
```

Используется база `family_hub_dev`.

**Внимание:** сейчас DEV и PROD используют один порт `3001`. Чтобы запустить DEV, необходимо сначала остановить семейную службу. В будущем рекомендуется настроить отдельный порт для DEV.

## 5. Tailscale

Tailscale предоставляет защищённый доступ к приложению.

```bash
sudo systemctl status tailscaled
tailscale status
tailscale serve status
```

HTTPS-запросы перенаправляются на `http://127.0.0.1:3001`.

Для доступа с другого устройства необходимо подключить его к разрешённой сети Tailscale.

Google OAuth настроен на использование соответствующих redirect URI для локальной разработки и семейного HTTPS-адреса.

## 6. Резервные копии PostgreSQL

Автоматическое резервирование выполняется ежедневно в **03:00 по местному времени**.

Скрипт сохраняет базу `family_hub` в формате PostgreSQL Custom (`.dump`).

Старые автоматические архивы удаляются примерно через 14 дней. Ручные копии не затрагиваются.

Проверка таймера:

```bash
systemctl status family-hub-backup.timer
systemctl list-timers --all | grep family-hub
```

Ручной запуск резервирования:

```bash
sudo /usr/local/bin/family-hub-backup.sh
```

Просмотр архивов:

```bash
sudo ls -lh /home/pablo9298/family-hub-backups/
```

**Важно:** копии на том же SSD не защищают от выхода диска из строя. Необходимо дополнительно сохранять копии на другом устройстве или накопителе и периодически проверять восстановление.

## 7. Git и обновления

- `develop` — разработка и тестирование.
- `main` — стабильная семейная версия.

Новые функции сначала проверяются в `develop`, затем переносятся в `main`.

После обновления backend в `main` нужно перезапустить службу:

```bash
sudo systemctl restart family-hub
```

Перед изменениями структуры production-базы необходимо создать резервную копию и применить нужные миграции.

## 8. Как отключить домашний сервер в будущем

Если Family Hub будет перенесён в облако, сначала нужно проверить, что новая версия работает, а реальные финансовые данные успешно перенесены.

Затем остановить и отключить локальные службы:

```bash
sudo systemctl disable --now family-hub.service
sudo systemctl disable --now family-hub-backup.timer
```

После этого при необходимости можно удалить только файлы, созданные для Family Hub:

```bash
sudo rm /etc/systemd/system/family-hub.service
sudo rm /etc/systemd/system/family-hub-backup.service
sudo rm /etc/systemd/system/family-hub-backup.timer
sudo rm /usr/local/bin/family-hub-backup.sh

sudo systemctl daemon-reload
```

Docker, Tailscale, Docker volume и резервные копии **не удалять автоматически**. Они могут понадобиться для восстановления либо использоваться другими приложениями.

## 9. Что ещё предстоит

- Проверить восстановление базы из резервной копии в отдельную временную БД.
- Настроить хранение резервных копий на другом физическом носителе.
- Развести порты DEV и PROD.
- Проверить семейный доступ со второго Google-аккаунта.
- Добавить инструкцию по переносу Family Hub на новый сервер.

---

*Этот документ описывает локальную конфигурацию домашнего сервера Family Hub на ноябрь 2026 года.*