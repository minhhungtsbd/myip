export default {
  async fetch(request, env) {
    const ip = request.headers.get('X-Visitor-IP');
    if (!ip) return new Response(null, { status: 400 });
    const namespace = new URL(request.url).pathname === '/dns' ? 'dns:' : 'lookup:';
    const { success } = await env.LOOKUP_LIMIT.limit({ key: namespace + ip });
    return new Response(null, { status: success ? 204 : 429 });
  }
};
