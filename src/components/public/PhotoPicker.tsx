import React, { useEffect, useState } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'

interface A11y {
  id: string
  'aria-invalid': boolean
  'aria-describedby'?: string
}

/** File input with a thumbnail preview and an explicit remove action. */
export function PhotoPicker({
  a11y,
  files,
  register,
  onClear,
}: {
  a11y: A11y
  files?: FileList
  register: UseFormRegisterReturn
  onClear: () => void
}) {
  const file = files && files.length > 0 ? files[0] : null
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  if (file)
    return (
      <div className="flex items-center gap-4 rounded-md border border-taupe bg-white p-3">
        {url ? (
          <img src={url} alt="Preview of the photo you chose" className="size-16 rounded object-cover" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded bg-sand" aria-hidden="true">
            <ImagePlus className="size-6 text-muted" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-graphite">{file.name}</p>
          <p className="text-sm text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <Trash2 aria-hidden="true" />
          Remove<span className="sr-only"> photo</span>
        </Button>
      </div>
    )

  return (
    <input
      {...a11y}
      {...register}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      className="flex min-h-11 w-full rounded-md border border-taupe bg-white px-3 py-1.5 text-base text-graphite file:mr-3 file:rounded file:border-0 file:bg-sand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-burgundy aria-[invalid=true]:border-2 aria-[invalid=true]:border-error"
    />
  )
}
