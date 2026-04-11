import { redirect } from 'next/navigation'

type Args = {
  searchParams: Promise<{ q?: string }>
}

export default async function LegacySearchPage({ searchParams: searchParamsPromise }: Args) {
  const { q } = await searchParamsPromise
  redirect(`/en/search${q ? `?q=${q}` : ''}`)
}
