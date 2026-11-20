/** Une ligne d'une liste simple, avec le bloc (société) auquel elle appartient. */
export interface ParsedItem {
  section: string | null
  text: string
}

// Caractères invisibles collés depuis WhatsApp / Notes (⁠ word-joiner, espaces fines…).
const INVISIBLE = /\u2060|\u200b|\u200c|\u200d|\ufeff|\u00ad/g
const BULLET = /^[\s\-*•⁃·–—▪◦●○✓✔☐☑>]+/

/**
 * Découpe un texte collé en lignes à cocher.
 * - « Uzeet : » (ligne courte terminée par « : », sans puce) ouvre un bloc ;
 * - chaque autre ligne non vide devient une case, sans sa puce (*, -, •…) ;
 * - la première ligne sans puce avant tout bloc sert de titre (« voici tes urgences… »).
 */
export function parseQuickList(raw: string): { title: string | null; items: ParsedItem[] } {
  let title: string | null = null
  let section: string | null = null
  const items: ParsedItem[] = []
  for (const line0 of raw.replace(INVISIBLE, '').replace(/\t/g, ' ').split(/\r?\n/)) {
    const line = line0.trim()
    if (!line) continue
    const hasBullet = BULLET.test(line)
    const text = line.replace(BULLET, '').trim()
    if (!text) continue
    const head = text.match(/^(.{1,40}?)\s*:\s*$/)
    if (head && !hasBullet) {
      section = head[1].trim()
      continue
    }
    if (!hasBullet && !section && !items.length && !title) {
      title = text.replace(/\s*[👇:]+\s*$/u, '').trim() || text
      continue
    }
    items.push({ section, text: text.slice(0, 500) })
  }
  return { title, items }
}

/** Texte prêt à envoyer (WhatsApp, SMS) : titre, lien, puis les lignes restantes par bloc. */
export function listToMessage(title: string, link: string, items: { section: string | null; text: string; done: boolean; note?: string | null }[]) {
  const out = [title, link, '']
  let current: string | null | undefined
  for (const it of items.filter((i) => !i.done)) {
    if (it.section !== current) {
      current = it.section
      if (current) out.push('', `${current} :`)
    }
    out.push(`• ${it.text}`)
    if (it.note) out.push(`   ↳ ${it.note.replace(/\s*\n\s*/g, ' ')}`)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
