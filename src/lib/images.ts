/**
 * Réduit une photo avant l'envoi (téléphone → souvent 4 000 px et plusieurs Mo).
 * Renvoie un JPEG d'au plus `max` px de côté ; si le navigateur ne sait pas lire
 * le format (ex. HEIC hors Safari), renvoie le fichier d'origine.
 */
export async function shrinkImage(file: File, max = 1600): Promise<Blob> {
  if (file.type === 'image/gif') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale)
    const h = Math.round(bmp.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

export function extensionFor(type: string) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[type] ?? 'jpg'
}
