export default {
  async fetch(request, env) {
    const ip = request.headers.get('X-Visitor-IP');
    if (!ip) return new Response(null, { status: 400 });
    const { success } = await env.LOOKUP_LIMIT.limit({ key: ip });
    return new Response(null, { status: success ? 204 : 429 });
  }
};
