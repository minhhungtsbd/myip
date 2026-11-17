export function onRequest({ request, next }) {
  const path = new URL(request.url).pathname;
  if (path === '/proxy-check' || path.startsWith('/proxy-check/') || path === '/downloads/check-proxy.ps1') {
    return new Response('Không tìm thấy trang', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
  return next();
}
