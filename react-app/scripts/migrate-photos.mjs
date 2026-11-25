import dotenv from 'dotenv'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const root = path.resolve(process.cwd(), '..', 'wwwroot', 'photos')
const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) throw new Error('VITE_SUPABASE_URL atau VITE_SUPABASE_ANON_KEY belum tersedia di .env.local')
const supabase = createClient(url, key)
const allowed = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])

async function filesIn(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesIn(fullPath))
    else if (allowed.has(path.extname(entry.name).toLowerCase())) files.push(fullPath)
  }
  return files
}

const files = await filesIn(root)
let uploaded = 0
let skipped = 0
let failed = 0

for (const filePath of files) {
  const relative = path.relative(root, filePath).split(path.sep).join('/')
  const [category, ...nameParts] = relative.split('/')
  const fileName = nameParts.join('/')
  if (!category || !fileName) continue
  const storagePath = `${category}/${fileName}`
  const contentType = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp'
  }[path.extname(fileName).toLowerCase()]

  const { data: existing, error: lookupError } = await supabase
    .from('photos').select('id').eq('storage_path', storagePath).maybeSingle()
  if (lookupError) throw lookupError
  if (existing) { skipped++; continue }

  try {
    const buffer = await fs.readFile(filePath)
    const upload = await supabase.storage.from('photos').upload(storagePath, buffer, { contentType, upsert: false })
    if (upload.error) throw upload.error
    const publicUrl = supabase.storage.from('photos').getPublicUrl(storagePath).data.publicUrl
    const insert = await supabase.from('photos').insert({
      category,
      file_name: fileName,
      storage_path: storagePath,
      public_url: publicUrl
    })
    if (insert.error) {
      await supabase.storage.from('photos').remove([storagePath])
      throw insert.error
    }
    uploaded++
    console.log(`Uploaded ${storagePath}`)
  } catch (error) {
    failed++
    console.error(`Failed ${storagePath}: ${error.message}`)
  }
}

console.log(`Selesai: ${uploaded} upload, ${skipped} dilewati, ${failed} gagal.`)
if (failed > 0) process.exitCode = 1
