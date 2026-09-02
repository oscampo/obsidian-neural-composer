import { requestUrl } from 'obsidian'

function normalizeFetchHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return { ...headers }
}

/**
 * A fetch()-compatible function backed by Obsidian's requestUrl(), which
 * goes through Obsidian's own network layer instead of the renderer's
 * fetch() — bypassing the CORS/CSP restrictions Electron's renderer process
 * enforces on raw fetch() calls to third-party origins.
 *
 * Limitation: requestUrl() fully buffers the response body before
 * returning, so this cannot support a genuinely long-lived, progressively
 * streamed response (e.g. an indefinitely open server-push SSE channel) —
 * it only works for request/response cycles that eventually complete.
 * Also, requestUrl() has no cancellation support, so `init.signal` is
 * ignored.
 */
export async function obsidianRequestUrlFetch(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await requestUrl({
    url: url.toString(),
    method: init?.method ?? 'GET',
    headers: normalizeFetchHeaders(init?.headers),
    body:
      typeof init?.body === 'string' || init?.body instanceof ArrayBuffer
        ? init.body
        : undefined,
    throw: false,
  })

  return new Response(response.arrayBuffer, {
    status: response.status,
    headers: response.headers,
  })
}

export async function fetchUrlTitle(url: string): Promise<string | null> {
  try {
    const headResponse = await requestUrl({
      url,
      method: 'HEAD',
    })

    const contentType = headResponse.headers['content-type']
    if (!contentType?.includes('text/html')) {
      return null
    }

    const rangeSizes: (number | null)[] = [8192, 16384, 32768, null] // null is the full page
    let title: string | null = null

    for (const range of rangeSizes) {
      const response = await requestUrl({
        url,
        method: 'GET',
        headers: range
          ? {
              Range: `bytes=0-${range}`,
            }
          : undefined,
      })

      const titleMatch = response.text.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch) {
        title = titleMatch[1].trim()
        break
      }
    }

    return title
  } catch (error) {
    console.warn(`Failed to fetch title for ${url}:`, error)
    return null
  }
}
