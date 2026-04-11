'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import React, { useState, useEffect } from 'react'
import { useDebounce } from '@/utilities/useDebounce'
import { useRouter } from 'next/navigation'

export const Search: React.FC<{ basePath?: string; placeholder?: string }> = ({
  basePath = '/search',
  placeholder = 'Search dishes, rolls, sashimi…',
}) => {
  const [value, setValue] = useState('')
  const router = useRouter()

  const debouncedValue = useDebounce(value)

  useEffect(() => {
    router.push(`${basePath}${debouncedValue ? `?q=${debouncedValue}` : ''}`)
  }, [debouncedValue, router, basePath])

  return (
    <div>
      <form onSubmit={(e) => e.preventDefault()}>
        <Label htmlFor="search" className="sr-only">
          Search
        </Label>
        <Input
          id="search"
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="h-12 text-base"
        />
        <button type="submit" className="sr-only">
          submit
        </button>
      </form>
    </div>
  )
}
