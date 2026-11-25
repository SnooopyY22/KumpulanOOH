import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { downloadCanvas, renderTemplate } from './templateEngine'

const fallbackPhotos = [
  { category: 'WithTeacher', file: 'fcbcbf7b-9c5b-4043-875b-84f3eb0fe573.jpg' },
  { category: 'WestSIde', file: 'f3db9e3a-4323-4977-a94b-6b44643c4c35.jpg' },
  { category: 'Villa', file: 'fca6e1d8-f02c-452a-b48d-d8dfdd098193.jpg' }
]

const imageUrl = photo => {
  if (!photo) return ''
  if (photo.public_url) return photo.public_url
  if (photo.storage_path && supabase) {
    return supabase.storage.from('photos').getPublicUrl(photo.storage_path).data.publicUrl
  }
  const file = photo.file_name || photo.file || photo.name
  return file ? `/photos/${encodeURIComponent(photo.category || '')}/${encodeURIComponent(file)}` : ''
}

const query = (table, fn) => supabase ? fn(supabase.from(table)) : Promise.resolve({ data: [], error: null })

function usePhotos() {
  const [photos, setPhotos] = useState(supabase ? [] : fallbackPhotos)

  useEffect(() => {
    let active = true
    query('photos', q => q.select('*').order('created_at', { ascending: false }))
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) {
          setPhotos(fallbackPhotos)
          return
        }
        setPhotos(data.map(photo => ({ ...photo, file: photo.file_name || photo.file || photo.name })))
      })
      .catch(() => {
        if (active) setPhotos(fallbackPhotos)
      })
    return () => { active = false }
  }, [])

  return photos
}

const templateOptions = [
  ['collage', 'Collage Maker', 'Grid multi-foto'],
  ['frame', 'Photo Frame', 'Border dan caption'],
  ['polaroid', 'Polaroid Effect', 'Instant cam style'],
  ['filmstrip', 'Film Strip', 'Negatif film klasik'],
  ['photobooth', 'Photobooth', 'Empat frame vertikal'],
  ['postcard', 'Postcard', 'Kartu pos kenangan'],
  ['scrapbook', 'Scrapbook', 'Kolase kertas vintage'],
  ['contact', 'Contact Sheet', 'Lembar kontak fotografer']
]

const templatePhotoKey = photo => photo.id ?? photo.storage_path ?? photo.file ?? photo.file_name
const templateMaxPhotos = kind => kind === 'contact' || kind === 'collage' ? 9 : kind === 'photobooth' || kind === 'filmstrip' ? 4 : 1

export default function Template() {
  const photos = usePhotos()
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [selectedPhotos, setSelectedPhotos] = useState([])
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [config, setConfig] = useState({ background: '#eee5d3', caption: 'XII RPL 2', padding: 12, filter: 'none', zoom: 100, rotation: 0, photoX: 0, photoY: 0, layout: '2x2', frameColor: '#333333', borderWidth: 15, sticker: 'none', stickerX: 90, stickerY: 10, stickerSize: 100, stickerRotation: 0 })
  const canvasRef = useRef(null)
  const renderId = useRef(0)
  const categories = [...new Set(photos.map(photo => photo.category).filter(Boolean))].sort()
  const visiblePhotos = photos.filter(photo => {
    const matchesCategory = !category || photo.category === category
    const name = `${photo.file_name || photo.file || photo.name || ''} ${photo.category || ''}`.toLowerCase()
    return matchesCategory && (!search || name.includes(search.toLowerCase()))
  }).slice(0, 48)
  const maxPhotos = templateMaxPhotos(selectedTemplate)
  const selectedItems = selectedPhotos.map(key => photos.find(photo => templatePhotoKey(photo) === key)).filter(Boolean)

  useEffect(() => {
    if (!selectedTemplate || !photos.length) return
    setSelectedPhotos(current => {
      const available = new Set(photos.map(templatePhotoKey))
      const kept = current.filter(key => available.has(key)).slice(0, templateMaxPhotos(selectedTemplate))
      return kept.length ? kept : photos.slice(0, templateMaxPhotos(selectedTemplate)).map(templatePhotoKey)
    })
  }, [photos, selectedTemplate])

  useEffect(() => {
    if (!selectedTemplate || !canvasRef.current) return
    const currentRender = ++renderId.current
    renderTemplate(canvasRef.current, { ...config, kind: selectedTemplate }, selectedItems.map(imageUrl))
  }, [selectedTemplate, selectedItems.map(photo => templatePhotoKey(photo)).join('|'), JSON.stringify(config)])

  const chooseTemplate = kind => {
    setSelectedTemplate(kind)
    setSelectedPhotos(photos.slice(0, templateMaxPhotos(kind)).map(templatePhotoKey))
  }
  const togglePhoto = photo => {
    const key = templatePhotoKey(photo)
    setSelectedPhotos(current => {
      if (current.includes(key)) return current.filter(item => item !== key)
      if (current.length >= maxPhotos) return [...current.slice(1), key]
      return [...current, key]
    })
  }
  const updateConfig = (key, value) => setConfig(current => ({ ...current, [key]: value }))

  return (
    <section className="template-page">
      <div className="page-head"><div><span className="kicker">Studio kenangan</span><h1>Template Maker</h1><p>Bikin foto keren dengan template pilihan</p></div><span className="template-count">{templateOptions.length} template</span></div>
      <div className="template-grid">{templateOptions.map(([key, name, description], index) => <button type="button" className={`template-card ${selectedTemplate === key ? 'active' : ''}`} onClick={() => chooseTemplate(key)} key={key} aria-pressed={selectedTemplate === key}><span>{String(index + 1).padStart(2, '0')}</span><strong>{name}</strong><small>{description}</small></button>)}</div>
      {!selectedTemplate ? <div className="empty-state"><div className="paper-icon" aria-hidden="true" /><h2>Belum ada template dipilih</h2><p>Pilih salah satu template di atas untuk mulai merangkai foto kenanganmu.</p></div> : <section className="template-workspace">
        <div className="template-controls"><div className="template-panel-head"><span>01</span><div><h2>Setelan template</h2><p>Atur tampilan hasil akhir.</p></div></div>
          <label className="tm-field"><span>Warna latar</span><input type="color" value={config.background} onChange={event => updateConfig('background', event.target.value)} /></label><label className="tm-field"><span>Caption</span><input value={config.caption} maxLength={45} onChange={event => updateConfig('caption', event.target.value)} /></label><label className="tm-field"><span>Jarak <output>{config.padding}px</output></span><input type="range" min="0" max="24" value={config.padding} onChange={event => updateConfig('padding', Number(event.target.value))} /></label><label className="tm-field"><span>Filter</span><select value={config.filter} onChange={event => updateConfig('filter', event.target.value)}><option value="none">Normal</option><option value="vintage">Vintage</option><option value="sepia">Sepia</option><option value="bw">Hitam putih</option><option value="warm">Warm</option><option value="fade">Fade</option></select></label><label className="tm-field"><span>Zoom <output>{config.zoom}%</output></span><input type="range" min="100" max="150" value={config.zoom} onChange={event => updateConfig('zoom', Number(event.target.value))} /></label><label className="tm-field"><span>Putar <output>{config.rotation}°</output></span><input type="range" min="-12" max="12" value={config.rotation} onChange={event => updateConfig('rotation', Number(event.target.value))} /></label>
          {selectedTemplate === 'collage' && <label className="tm-field"><span>Layout</span><select value={config.layout} onChange={event => updateConfig('layout', event.target.value)}><option value="2x2">2x2 Grid</option><option value="3x3">3x3 Grid</option><option value="2x3">2x3 Grid</option><option value="4x1">4x1 Strip</option><option value="1x4">1x4 Strip</option></select></label>}{selectedTemplate === 'frame' && <><label className="tm-field"><span>Warna frame</span><input type="color" value={config.frameColor} onChange={event => updateConfig('frameColor', event.target.value)} /></label><label className="tm-field"><span>Tebal border <output>{config.borderWidth}px</output></span><input type="range" min="5" max="50" value={config.borderWidth} onChange={event => updateConfig('borderWidth', Number(event.target.value))} /></label></>}
          <button type="button" className="btn dark" onClick={() => downloadCanvas(canvasRef.current, `${selectedTemplate}-${Date.now()}.png`)}>Unduh PNG ↓</button>
        </div>
        <div className="template-photo-select"><div className="template-panel-head"><span>02</span><div><h2>Pilih foto</h2><p>{selectedPhotos.length}/{maxPhotos} foto dipilih.</p></div></div><select value={category} onChange={event => setCategory(event.target.value)}><option value="">Semua kategori</option>{categories.map(item => <option value={item} key={item}>{item}</option>)}</select><input className="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama foto..." aria-label="Cari foto template" /><div className="template-photo-grid">{visiblePhotos.map(photo => <button type="button" className={`template-photo ${selectedPhotos.includes(templatePhotoKey(photo)) ? 'selected' : ''}`} onClick={() => togglePhoto(photo)} key={templatePhotoKey(photo)}><img src={imageUrl(photo)} alt={photo.category || 'Foto'} loading="lazy" /><span>{selectedPhotos.includes(templatePhotoKey(photo)) ? '✓' : ''}</span></button>)}</div></div>
        <div className="template-preview"><div className="template-preview-head"><span>Pratinjau</span><small>720 × 760 px</small></div><div className="canvas-wrap"><canvas ref={canvasRef} width="720" height={selectedTemplate === 'photobooth' ? 1600 : 760} /></div></div>
      </section>}
    </section>
  )
}
