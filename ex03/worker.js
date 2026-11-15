const ME = {
  name: 'محمدرضا اصل عبیداوی',
  studentId: '40273101',
  title: 'دانشجوی مهندسی کامپیوتر، دانشگاه شهید چمران اهواز',
  skills: ['HTTP', 'TLS', 'Linux', 'JavaScript', 'Python', 'Django'],
};

const cssContent = `
:root {
  color-scheme: light;
  font-family: system-ui, -apple-system, sans-serif;
}
body {
  max-width: 680px;
  margin: 2.5rem auto;
  padding: 0 1rem;
  line-height: 1.8;
  color: #1f2937;
  background: #f9fafb;
}
main {
  background: #ffffff;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
h1 {
  margin-top: 0;
  color: #111827;
}
h2 {
  margin-top: 1.75rem;
  font-size: 1.15rem;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.35rem;
}
form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
}
input, textarea, button {
  font: inherit;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  border: 1px solid #d1d5db;
}
button {
  background: #2563eb;
  color: #ffffff;
  border: none;
  cursor: pointer;
  font-weight: 600;
}
button:hover {
  background: #1d4ed8;
}
`;

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeEtag(tag) {
  return tag.trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
}

let cachedAssets = null;

async function getAssets() {
  if (cachedAssets) return cachedAssets;

  const fullCssHash = await sha256Hex(cssContent);
  const cssShortHash = fullCssHash.slice(0, 12);
  const cssPath = `/style.${cssShortHash}.css`;

  const htmlBody = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${ME.name}</title>
  <link rel="stylesheet" href="${cssPath}">
</head>
<body>
  <main>
    <h1>${ME.name}</h1>
    <p>${ME.title} · شمارهٔ دانشجویی ${ME.studentId}</p>
    <h2>مهارت‌ها</h2>
    <ul>${ME.skills.map((s) => `<li>${s}</li>`).join('')}</ul>
    <h2>پیام بگذارید</h2>
    <form method="POST" action="/contact">
      <input type="text" name="sender" placeholder="نام فرستنده" required>
      <textarea name="message" rows="3" placeholder="متن پیام..." required></textarea>
      <button type="submit">ارسال پیام</button>
    </form>
  </main>
</body>
</html>`;

  const htmlHash = await sha256Hex(htmlBody);
  const htmlEtag = `"${htmlHash}"`;
  const jsonBody = JSON.stringify(ME, null, 2);

  const thanksBody = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>سپاسگزارم</title>
  <link rel="stylesheet" href="${cssPath}">
</head>
<body>
  <main>
    <h1>پیام شما با موفقیت ارسال شد</h1>
    <p>سپاسگزارم! پیام شما ثبت شد.</p>
    <p><a href="/">بازگشت به صفحهٔ رزومه</a></p>
  </main>
</body>
</html>`;

  cachedAssets = {
    cssPath,
    cssContent,
    htmlBody,
    htmlEtag,
    jsonBody,
    thanksBody,
  };
  return cachedAssets;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    const assets = await getAssets();

    const routes = {
      '/': ['GET', 'HEAD', 'OPTIONS'],
      '/cv.json': ['GET', 'HEAD', 'OPTIONS'],
      [assets.cssPath]: ['GET', 'HEAD', 'OPTIONS'],
      '/thanks': ['GET', 'HEAD', 'OPTIONS'],
      '/contact': ['POST', 'OPTIONS'],
    };

    const allowedMethods = routes[pathname];

    if (!allowedMethods) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const allowHeader = allowedMethods.join(', ');

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { Allow: allowHeader },
      });
    }

    if (!allowedMethods.includes(method)) {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          Allow: allowHeader,
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    if (pathname === '/') {
      const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300, no-transform',
        ETag: assets.htmlEtag,
      };

      const ifNoneMatch = request.headers.get('If-None-Match');
      if (ifNoneMatch) {
        const target = normalizeEtag(assets.htmlEtag);
        const candidates = ifNoneMatch.split(',');
        const matched = candidates.some(
          (c) => c.trim() === '*' || normalizeEtag(c) === target
        );
        if (matched) {
          return new Response(null, { status: 304, headers });
        }
      }

      return new Response(method === 'HEAD' ? null : assets.htmlBody, {
        status: 200,
        headers,
      });
    }

    if (pathname === '/cv.json') {
      return new Response(method === 'HEAD' ? null : assets.jsonBody, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    if (pathname === assets.cssPath) {
      return new Response(method === 'HEAD' ? null : assets.cssContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/css; charset=utf-8',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    if (pathname === '/contact' && method === 'POST') {
      return new Response(null, {
        status: 303,
        headers: { Location: '/thanks' },
      });
    }

    if (pathname === '/thanks') {
      return new Response(method === 'HEAD' ? null : assets.thanksBody, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};