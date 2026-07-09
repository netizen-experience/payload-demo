import { getClientSideURL } from './getURL'

/**
 * Processes media resource URL to ensure proper formatting
 * @param url The original URL from the resource
 * @param cacheTag Optional cache tag to append to the URL
 * @returns Properly formatted URL with cache tag if provided
 *
 * Always returns an absolute URL. OpenNext's Lambda image-optimizer only has two paths for
 * a src: an absolute http(s) URL gets fetched over HTTP, anything relative is treated as an
 * S3 object key — there's no in-between, so a relative `/api/media/file/...` path (a dynamic
 * route, not a real S3 key) can never resolve on the deployed site (confirmed via
 * CloudWatch: NoSuchKey). getClientSideURL() resolves via window.location in the browser, so
 * this doesn't need a build-time-baked domain.
 */
export const getMediaUrl = (url: string | null | undefined, cacheTag?: string | null): string => {
  if (!url) return ''

  const baseUrl = url.startsWith('http') ? '' : getClientSideURL()

  if (cacheTag && cacheTag !== '') {
    cacheTag = encodeURIComponent(cacheTag)
  }

  const fullUrl = `${baseUrl}${url}`

  return cacheTag ? `${fullUrl}?${cacheTag}` : fullUrl
}
