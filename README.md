# 3dAstra Landing

Готовий адаптивний landing page для української компанії, що займається 3D-друком прототипів, функціональних деталей і великих серій. Проєкт зібраний на `HTML + CSS + JavaScript + Node.js + Express` і підготовлений для деплою на Render та інтеграції з CRM.

Зараз у проєкті:
- `Zoho CRM` як основний CRM-варіант
- `CRM mock mode` для локального тестування без реальної CRM

## Що входить у проєкт

- сучасний landing page українською мовою
- форма завантаження моделі з drag and drop
- backend endpoint `POST /api/leads`
- загальний CRM-сервіс для Zoho або Bitrix24
- абстракція storage для подальшого переходу на S3 або Cloudflare R2
- базові security middleware і захист форми
- SEO-файли `robots.txt`, `sitemap.xml`, schema.org, Open Graph

## Структура

```text
/
  public/
    index.html
    robots.txt
    sitemap.xml
    css/
      style.css
    js/
      main.js
    images/
      logo.jpeg
      favicon-placeholder.svg
      placeholder-printer-farm.svg
      placeholder-serial-parts.svg
      placeholder-3d-mesh.svg
  services/
    crm.js
    storage.js
  scripts/
    mock-lead-test.js
  uploads/
  server.js
  package.json
  .env.example
  .gitignore
  README.md
```

## 1. Як встановити залежності

```bash
cd /Users/katarudenko/Documents/New\ project/3d-astra
npm install
```

## 2. Як запустити локально

```bash
npm start
```

Для автоперезапуску під час розробки:

```bash
npm run dev
```

Після запуску сайт буде доступний за адресою:

```text
http://localhost:3000
```

## 3. Як заповнити `.env`

Створіть `.env` на основі `.env.example`.

```env
CRM_MOCK_MODE=true
CRM_SOURCE_LABEL=Landing page

ZOHO_ACCOUNTS_URL=https://accounts.zoho.eu
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_API_DOMAIN=
ZOHO_MODULE=Leads
ZOHO_FIELD_COMMENT=
ZOHO_FIELD_QUANTITY=
ZOHO_FIELD_MATERIAL=
ZOHO_FIELD_FILE_URL=
ZOHO_FIELD_FILE_NAME=
ZOHO_FIELD_PHONE=
ZOHO_FIELD_EMAIL=

APP_BASE_URL=http://localhost:3000
FILE_URL_SIGNING_SECRET=change-me
ALLOWED_ORIGIN=http://localhost:3000
PORT=3000
MAX_FILE_SIZE_MB=50
```

## 4. Пояснення основних змінних

- `CRM_MOCK_MODE` — `true` для локального тестування без реальної CRM
- `CRM_SOURCE_LABEL` — текст джерела заявки
- `APP_BASE_URL` — зовнішній домен або локальна адреса проєкту
- `FILE_URL_SIGNING_SECRET` — секрет для підписаних посилань на файли
- `ALLOWED_ORIGIN` — дозволений домен для CORS
- `PORT` — порт сервера
- `MAX_FILE_SIZE_MB` — максимальний розмір файлу

### Змінні Zoho

- `ZOHO_ACCOUNTS_URL` — домен авторизації Zoho для вашого регіону
- `ZOHO_CLIENT_ID` — client ID connected app
- `ZOHO_CLIENT_SECRET` — client secret connected app
- `ZOHO_REFRESH_TOKEN` — refresh token для серверної інтеграції
- `ZOHO_API_DOMAIN` — можна не заповнювати вручну, API домен повертається Zoho при оновленні токена
- `ZOHO_MODULE` — зазвичай `Leads`
- `ZOHO_FIELD_*` — API names користувацьких полів у Zoho CRM

## 5. Як працює CRM-шар

Форма надсилається в:

```text
POST /api/leads
```

Потім backend:
1. перевіряє поля
2. зберігає файл
3. генерує захищене посилання на файл
4. створює заявку в обраній CRM
5. повертає frontend JSON-відповідь

CRM-логіка винесена в:

- [services/crm.js](/Users/katarudenko/Documents/New%20project/3d-astra/services/crm.js)

## 6. Як протестувати без реальної CRM

Увімкніть:

```env
CRM_MOCK_MODE=true
```

Потім виконайте:

```bash
npm run test:mock
```

Цей сценарій:
- формує тестову multipart-заявку
- надсилає її безпосередньо в Express app
- перевіряє, що endpoint повертає `success: true`
- виводить у консоль безпечний mock-об'єкт заявки

## 7. Як підключити Zoho CRM

### Що потрібно створити в Zoho

1. Створити `Connected App`
2. Отримати `client_id` і `client_secret`
3. Згенерувати `refresh_token`
4. Вказати модуль, куди будуть падати заявки, зазвичай `Leads`
5. За потреби створити кастомні поля для:
   - кількості
   - матеріалу
   - посилання на файл
   - імені файлу

### Як заявки мапляться в Zoho

За замовчуванням проєкт передає в `Leads`:
- `First_Name`
- `Last_Name`
- `Company`
- `Phone`
- `Email`
- `Description`
- `Lead_Source`

Важливо:
- у Zoho для `Leads` системно обов'язковий `Last_Name`
- часто також бізнес-процес вимагає `Company`
- якщо компанія не заповнена у формі, backend підставить `Website inquiry`

## 8. Як розгорнути проєкт на Render

1. Завантажте код у GitHub
2. Створіть новий `Web Service` у Render
3. Підключіть репозиторій
4. Вкажіть:
   - `Build Command`: `npm install`
   - `Start Command`: `npm start`
5. Додайте env-змінні з `.env.example`
6. Дочекайтеся деплою

## 9. Як підключити власний домен на Render

1. Відкрийте сервіс у Render
2. Перейдіть у налаштування доменів
3. Додайте свій домен
4. Додайте DNS-записи, які попросить Render
5. Після підтвердження оновіть:
   - `APP_BASE_URL`
   - `ALLOWED_ORIGIN`
   - canonical
   - `sitemap.xml`
   - OG URL

## 10. Чому не варто довго зберігати файли тільки в Render

Локальна файлова система Render не підходить як єдине production-сховище, тому що:
- файли можуть зникнути після redeploy
- інстанс може бути пересозданий
- storage не гарантує стабільного збереження між життєвими циклами сервісу
- при масштабуванні на кілька інстансів локальні файли стануть незручними

## 11. Як пізніше перейти на S3 або Cloudflare R2

У проєкті вже є абстракція:

- [services/storage.js](/Users/katarudenko/Documents/New%20project/3d-astra/services/storage.js)

Потрібно буде:
1. замінити локальне збереження на upload у bucket
2. повертати зовнішній або підписаний URL у `getFileUrl()`
3. реалізувати видалення файлу в `deleteFile()`

## 12. Що замінити перед публікацією

- placeholder контакти
- політику конфіденційності
- canonical URL
- OG URL та OG image
- favicon за потреби
- реальні CRM поля
- `APP_BASE_URL`
- `ALLOWED_ORIGIN`
- `FILE_URL_SIGNING_SECRET`

## 13. Перед запуском

- перевірити логотип
- перевірити контакти
- перевірити домен
- перевірити `APP_BASE_URL`
- перевірити `ALLOWED_ORIGIN`
- перевірити mock-режим
- протестувати форму локально
- підключити реальну CRM
- перевірити тестову заявку
- за потреби підключити постійне файлове сховище
