'use client'
import { getTranslation } from '@payloadcms/translations'
import { useRowLabel } from '@payloadcms/ui'

export const RowLabel = () => {
  const data = useRowLabel<{ link?: { label?: string } }>()

  const label = data?.data?.link?.label

  return label || 'Nav Item'
}
