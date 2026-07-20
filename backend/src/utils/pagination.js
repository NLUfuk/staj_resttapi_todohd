const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// Clamp page/limit from raw query params - never trust client-supplied
// numbers directly into LIMIT/OFFSET math.
function parsePagination(query) {
  let page = Number.parseInt(query.page, 10);
  let limit = Number.parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return { page, limit, offset: (page - 1) * limit };
}

// RFC 5988 Link header (first/prev/next/last) built from the current
// request's own path + query string, only swapping the `page` param.
function buildLinkHeader(req, page, limit, totalCount) {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const basePath = `${req.baseUrl}${req.path}`;

  const linkFor = (targetPage) => {
    const params = new URLSearchParams(req.query);
    params.set('page', String(targetPage));
    params.set('limit', String(limit));
    return `<${basePath}?${params.toString()}>`;
  };

  const parts = [`${linkFor(1)}; rel="first"`, `${linkFor(totalPages)}; rel="last"`];
  if (page > 1) parts.push(`${linkFor(page - 1)}; rel="prev"`);
  if (page < totalPages) parts.push(`${linkFor(page + 1)}; rel="next"`);
  return parts.join(', ');
}

function setPaginationHeaders(req, res, { page, limit, totalCount }) {
  res.setHeader('X-Total-Count', String(totalCount));
  res.setHeader('Link', buildLinkHeader(req, page, limit, totalCount));
}

module.exports = { parsePagination, setPaginationHeaders, MAX_LIMIT, DEFAULT_LIMIT };
