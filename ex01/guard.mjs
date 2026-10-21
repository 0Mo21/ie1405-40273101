export function guard(input) {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false };
    }
    if (parsed.origin !== 'http://scu.test' && parsed.origin !== 'https://scu.test') {
      return { ok: false };
    }
    if (parsed.username !== '' || parsed.password !== '') {
      return { ok: false };
    }
    return { ok: true, url: parsed.href };
  } catch (error) {
    return { ok: false };
  }
}