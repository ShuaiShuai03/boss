import { useConf } from '@/composables/conf'

export interface AmapError {
  status: string
  info: string
  infocode: string
}

export interface AmapGeocode {
  status: string
  info: string
  infocode: string
  count: string
  geocodes: Array<{
    formatted_address: string
    country: string
    province: string
    citycode: string
    city: string
    district: string
    township: Array<any>
    neighborhood: {
      name: Array<any>
      type: Array<any>
    }
    building: {
      name: Array<any>
      type: Array<any>
    }
    adcode: string
    street: Array<any>
    number: Array<any>
    location: string
    level: string
  }>
}
export interface AmapDistance {
  status: string
  info: string
  infocode: string
  count: string
  results: Array<{
    origin_id: string
    dest_id: string
    distance: string
    duration: string
  }>
}

const MAX_AMAP_CACHE_ENTRIES = 200
const geocodeCache = new Map<string, AmapGeocode['geocodes'][number] | undefined>()

export async function amapGeocode(
  address: string,
): Promise<AmapGeocode['geocodes'][number] | undefined> {
  const { formData } = useConf()
  const cacheKey = `${formData.amap.key}\u0000${address}`
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)
  const url = new URL('https://restapi.amap.com/v3/geocode/geo')
  url.searchParams.set('address', address)
  url.searchParams.set('output', 'JSON')
  url.searchParams.set('key', formData.amap.key)
  const res = (await fetch(url).then((response) => response.json())) as AmapGeocode | AmapError
  if (res.status !== '1' || !('geocodes' in res)) {
    throw new Error(res.info)
  }
  const result = res.geocodes?.[0]
  geocodeCache.set(cacheKey, result)
  if (geocodeCache.size > MAX_AMAP_CACHE_ENTRIES) {
    geocodeCache.delete(geocodeCache.keys().next().value!)
  }
  return result
}

async function fetchDistance(
  origins: string,
  destination: string,
  type: number,
  key: string,
): Promise<AmapDistance | AmapError> {
  const url = new URL('https://restapi.amap.com/v3/distance')
  url.searchParams.set('origins', origins)
  url.searchParams.set('destination', destination)
  url.searchParams.set('type', String(type))
  url.searchParams.set('output', 'JSON')
  url.searchParams.set('key', key)
  return fetch(url).then((response) => response.json())
}

function extractResult(res: AmapDistance | AmapError) {
  if (res.status === '1' && 'results' in res) {
    return {
      ok: true,
      distance: Number(res.results?.[0]?.distance),
      duration: Number(res.results?.[0]?.duration),
    }
  }
  return { ok: false, distance: 0, duration: 0 }
}

interface AmapDistanceResult {
  straight: { ok: boolean; distance: number; duration: number }
  driving: { ok: boolean; distance: number; duration: number }
  walking: { ok: boolean; distance: number; duration: number }
}

const distanceCache = new Map<string, AmapDistanceResult>()

export async function amapDistance(destination: string): Promise<AmapDistanceResult> {
  const { formData } = useConf()
  const { origins, key } = formData.amap
  const cacheKey = `${key}\u0000${origins}\u0000${destination}`
  const cached = distanceCache.get(cacheKey)
  if (cached) return cached

  const [res0, res1, res3] = await Promise.all([
    fetchDistance(origins, destination, 0, key),
    fetchDistance(origins, destination, 1, key),
    fetchDistance(origins, destination, 3, key),
  ])

  const result: AmapDistanceResult = {
    straight: extractResult(res0),
    driving: extractResult(res1),
    walking: extractResult(res3),
  }
  distanceCache.set(cacheKey, result)
  if (distanceCache.size > MAX_AMAP_CACHE_ENTRIES) {
    distanceCache.delete(distanceCache.keys().next().value!)
  }
  return result
}
