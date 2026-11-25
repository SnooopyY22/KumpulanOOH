import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { isSupabaseConfigured, supabase } from './lib/supabase'
const LazyTemplate = lazy(() => import('./TemplatePage.jsx'))

const fallbackPhotos = [
  { category: 'WithTeacher', file: 'fcbcbf7b-9c5b-4043-875b-84f3eb0fe573.jpg' },
  { category: 'WestSIde', file: 'f3db9e3a-4323-4977-a94b-6b44643c4c35.jpg' },
  { category: 'Villa', file: 'fca6e1d8-f02c-452a-b48d-d8dfdd098193.jpg' }
]

const navItems = [
  ['/', 'Beranda'],
  ['/galeri', 'Galeri'],
  ['/template', 'Template maker'],
  ['/bulletin', 'Papan buletin']
]

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

const slug = value =>
  String(value || 'file')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80) || 'file'

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

const ensureVisitorUser = async () => {
  if (!supabase) return null
  const current = await supabase.auth.getUser()
  if (current.data.user) return current.data.user
  const guest = await supabase.auth.signInAnonymously()
  if (guest.error) {
    if (guest.error.message?.toLowerCase().includes('anonymous')) {
      throw new Error('Fitur guest belum aktif. Aktifkan Anonymous Sign-ins di Supabase Authentication > Providers > Anonymous.')
    }
    throw guest.error
  }
  return guest.data.user
}

const first = (row, keys, fallback = '') =>
  keys.map(key => row?.[key]).find(value => value !== undefined && value !== null && value !== '') ?? fallback

const visitor = () => {
  try {
    return globalThis.localStorage?.getItem('rpl2-visitor-name') || 'Anonim'
  } catch {
    return 'Anonim'
  }
}

const asDate = value => {
  const date = new Date(value || Date.now())
  return Number.isNaN(date.getTime()) ? new Date() : date
}

const dateLabel = value => asDate(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTime = value => asDate(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
const commentDate = value => asDate(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const initial = value => String(value || '?').trim().charAt(0).toUpperCase()
const hashValue = value => String(value ?? '').split('').reduce((sum, char) => sum * 31 + char.charCodeAt(0), 17)
const avatarIndex = value => Math.abs(hashValue(value)) % 6

const tagsOf = value => {
  const list = Array.isArray(value) ? value : String(value || 'Kenangan').split(',')
  return list.map(tag => String(tag).trim().replace(/^#/, '')).filter(Boolean)
}

const visitorId = () => {
  try {
    const key = 'rpl2-visitor-id'
    const existing = globalThis.localStorage?.getItem(key)
    if (existing) return existing
    const next = uid()
    globalThis.localStorage?.setItem(key, next)
    return next
  } catch {
    return uid()
  }
}

function useVisitorName(path) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (path.startsWith('/admin')) return
    try {
      const saved = globalThis.localStorage?.getItem('rpl2-visitor-name') || ''
      setDraft(saved)
      setOpen(!saved)
    } catch {
      setOpen(true)
    }
  }, [path])

  const save = async event => {
    event.preventDefault()
    const name = draft.trim().slice(0, 40)
    if (!name) return
    try {
      globalThis.localStorage?.setItem('rpl2-visitor-name', name)
    } catch {
      return
    }
    setOpen(false)
    if (supabase) {
      try {
        await ensureVisitorUser()
        const { error } = await supabase.from('visitor_visits').insert({
          visitor_id: visitorId(),
          name,
          path,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent
        })
        if (error) console.error('Nama visitor gagal disimpan:', error)
      } catch (error) {
        console.error('Visitor auth gagal:', error)
      }
    }
  }

  return { open, draft, setDraft, save }
}

function VisitorNameDialog({ draft, setDraft, save }) {
  return (
    <div className="visitor-name-backdrop" role="dialog" aria-modal="true" aria-labelledby="visitor-name-title">
      <form className="visitor-name-card" onSubmit={save}>
        <span className="visitor-name-mark">RPL 2</span>
        <p className="kicker">Buku kenangan kelas</p>
        <h2 id="visitor-name-title">Kenalan dulu, yuk.</h2>
        <p>Nama ini akan dipakai saat kamu menulis komentar atau menempel catatan di papan bulletin.</p>
        <label htmlFor="visitor-name">Nama kamu</label>
        <input
          id="visitor-name"
          autoFocus
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder="Contoh: Zhan Thang"
          maxLength={40}
        />
        <button type="submit" className="btn dark" disabled={!draft.trim()}>Masuk ke yearbook</button>
        <small>Nama disimpan di browser dan database kunjungan.</small>
      </form>
    </div>
  )
}

function useVisitTracking(path) {
  useEffect(() => {
    if (!supabase) return
    let active = true
    const recordVisit = async () => {
      const name = visitor()
      if (name === 'Anonim') return
      try {
        await ensureVisitorUser()
        const { error } = await supabase.from('visitor_visits').insert({
          visitor_id: visitorId(),
          name: name === 'Anonim' ? null : name,
          path,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent
        })
        if (error && active) console.error('Visitor tracking gagal:', error)
      } catch (error) {
        if (active) console.error('Visitor tracking gagal:', error)
      }
    }
    recordVisit()
    return () => { active = false }
  }, [path])
}

function useCountdown(target) {
  const getRemaining = () => {
    const difference = Math.max(0, new Date(target).getTime() - Date.now())
    const totalSeconds = Math.floor(difference / 1000)
    return {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60
    }
  }
  const [remaining, setRemaining] = useState(getRemaining)
  useEffect(() => {
    const timer = setInterval(() => setRemaining(getRemaining()), 1000)
    return () => clearInterval(timer)
  }, [target])
  return remaining
}

function usePhotos() {
  const [photos, setPhotos] = useState(isSupabaseConfigured ? [] : fallbackPhotos)

  const reload = async () => {
    if (!supabase) return
    try {
      const { data, error } = await query('photos', q => q.select('*').order('created_at', { ascending: false }))
      if (error || !data) {
        setPhotos(fallbackPhotos)
        return
      }
      setPhotos(data.map(photo => ({ ...photo, file: photo.file_name || photo.file || photo.name })))
    } catch {
      setPhotos(fallbackPhotos)
    }
  }

  useEffect(() => { reload() }, [])

  return [photos, reload]
}

function Layout({ page, setPage, children }) {
  useEffect(() => {
    const onKeyDown = event => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setPage('/admin/login')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setPage])

  return (
    <div className="page">
      <header className="site-header">
        <div className="site-header-in">
          <a className="brand" href="#/" onClick={event => { event.preventDefault(); setPage('/') }}>
            RPL 2 <small>Kenangan kelas XII</small>
          </a>
          <nav className="nav-links" aria-label="Navigasi utama">
            {navItems.map(([path, label]) => (
              <a
                className={`nav-link ${page === path ? 'active' : ''}`}
                href={`#${path}`}
                onClick={event => { event.preventDefault(); setPage(path) }}
                key={path}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <span
              className={`connection-dot ${isSupabaseConfigured ? 'online' : ''}`}
              title={isSupabaseConfigured ? 'Supabase terhubung' : 'Supabase belum terhubung'}
            />
          </div>
        </div>
      </header>
      <main className="content">{children}</main>
      <nav className="mobile-bottom-nav" aria-label="Navigasi mobile">
        {navItems.map(([path, label], index) => (
          <a
            className={`mobile-bottom-link ${page === path ? 'active' : ''}`}
            href={`#${path}`}
            onClick={event => { event.preventDefault(); setPage(path) }}
            key={path}
          >
            <span aria-hidden="true">{['⌂', '▦', '✦', '✎'][index]}</span>
            <small>{label === 'Template maker' ? 'Template' : label === 'Papan buletin' ? 'Bulletin' : label}</small>
          </a>
        ))}
      </nav>
      <footer className="site-footer">
        <b>XII RPL 2</b>
        <span>Digital yearbook kelas yang gak akan tergantikan.</span>
      </footer>
    </div>
  )
}

const anniversaryTarget = '2027-11-20T00:00:00+07:00'

function Home({ setPage }) {
  const [photos] = usePhotos()
  const [heroSettings, setHeroSettings] = useState(null)
  const remaining = useCountdown(anniversaryTarget)
  const categories = [...new Set(photos.map(photo => photo.category).filter(Boolean))]

  useEffect(() => {
    if (!supabase) return
    query('hero_settings', q => q.select('*').eq('id', 1).maybeSingle())
      .then(({ data }) => setHeroSettings(data || null))
  }, [])

  const cover = heroSettings?.mode === 'manual'
    ? photos.find(photo => String(photo.id) === String(heroSettings.photo_id)) || photos[0]
    : photos[0]
  const heroBadge = heroSettings?.badge || 'Digital yearbook kelas XII RPL 2'
  const heroTitle = heroSettings?.title || 'Kenangan kita,\nselamanya.'
  const heroSubtitle = heroSettings?.subtitle || 'Semua momen kelas, tersimpan dalam satu tempat.'

  return (
    <>
      <section className="hero">
        {cover
          ? <img src={imageUrl(cover)} className="hero-bg" alt="Kenangan kelas XII RPL 2" />
          : <div className="hero-placeholder" aria-hidden="true" />}
        <div className="hero-overlay" />
        <div className="hero-content">
          <span className="hero-badge">{heroBadge}</span>
          <h1>{heroTitle.split('\n').map((line, index) => <React.Fragment key={line}>{index > 0 && <br />}{line}</React.Fragment>)}</h1>
          <p>{heroSubtitle}</p>
          <button type="button" className="btn primary" onClick={() => setPage('/galeri')}>Lihat Galeri</button>
        </div>
      </section>
      <section className="countdown">
        <div><span className="kicker">1 year dari sekarang</span><p>Jangan lupa hari terakhir kita bersama.</p></div>
        <div className="count-grid"><div><b>{remaining.days}</b><small>hari</small></div><div><b>{remaining.hours}</b><small>jam</small></div><div><b>{remaining.minutes}</b><small>menit</small></div><div><b>{remaining.seconds}</b><small>detik</small></div></div>
      </section>
      <section className="stats home-stats">
        <div><b>{photos.length}</b><span>foto kenangan</span></div>
        <div><b>{categories.length}</b><span>kategori momen</span></div>
        <div><b>1</b><span>kelas tak tergantikan</span></div>
      </section>
      <section className="section">
        <h2>Pilihan momen kita</h2>
        {photos.length ? (
          <div className="highlight-strip">
            {photos.slice(0, 6).map(photo => (
              <button type="button" className="highlight" onClick={() => setPage('/galeri')} key={photo.id ?? photo.file ?? photo.storage_path}>
                <img src={imageUrl(photo)} alt={photo.category || 'Foto kenangan'} />
                <span>{photo.category || 'Kenangan'}</span>
              </button>
            ))}
          </div>
        ) : <p className="empty-note">Belum ada foto. Tambahkan foto dari halaman Galeri.</p>}
      </section>
    </>
  )
}

function Modal({ title, close, children, wide = false }) {
  const closeRef = useRef(close)

  useEffect(() => { closeRef.current = close }, [close])

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape') closeRef.current()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={event => { if (event.target === event.currentTarget) close() }}
    >
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="modal-close" onClick={close} aria-label="Tutup">×</button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Gallery() {
  const [photos, reload] = usePhotos()
  const [category, setCategory] = useState('Semua')
  const [search, setSearch] = useState('')
  const [uploadCategory, setUploadCategory] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [comments, setComments] = useState([])
  const [comment, setComment] = useState('')
  const [zoom, setZoom] = useState(100)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [fitSize, setFitSize] = useState(null)
  const [panelSize, setPanelSize] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [permission, setPermission] = useState(null)
  const [permissionNote, setPermissionNote] = useState('')
  const [permissionBusy, setPermissionBusy] = useState(false)
  const [commentCounts, setCommentCounts] = useState({})
  const [adminSession, setAdminSession] = useState(null)
  const commentRequest = useRef(0)
  const stageRef = useRef(null)
  const lightboxImageRef = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => {
    if (!supabase || !photos.length) return
    query('photo_comments', q => q.select('photo_id')).then(({ data }) => {
      const counts = (data || []).reduce((result, item) => {
        if (item.photo_id == null) return result
        result[item.photo_id] = (result[item.photo_id] || 0) + 1
        return result
      }, {})
      setCommentCounts(counts)
    })
  }, [photos])

  useEffect(() => {
    if (!supabase) return
    let active = true
    const loadAdmin = session => {
      const user = session?.user
      if (active && user && !user.is_anonymous && user.email && user.app_metadata?.role === 'admin') setAdminSession(session)
      else if (active) setAdminSession(null)
    }
    supabase.auth.getSession().then(({ data }) => loadAdmin(data.session))
    const subscription = supabase.auth.onAuthStateChange((_event, session) => loadAdmin(session))
    return () => {
      active = false
      subscription.data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadPermission = async () => {
      if (!supabase) return
      try {
        const user = await ensureVisitorUser()
        if (!user) return
        const { data } = await query('visitor_upload_permissions', q => q.select('*').eq('user_id', user.id).maybeSingle())
        if (active) setPermission(data || null)
      } catch (error) {
        if (active) setNotice(error.message)
      }
    }
    loadPermission()
    return () => { active = false }
  }, [])

  const categories = ['Semua', ...new Set(photos.map(photo => photo.category).filter(Boolean))]
  const visible = photos.filter(photo => {
    const matchesCategory = category === 'Semua' || photo.category === category
    const haystack = `${photo.category || ''} ${photo.file_name || photo.file || photo.name || ''}`.toLowerCase()
    return matchesCategory && (!search || haystack.includes(search.toLowerCase()))
  })
  const selected = selectedIndex == null ? null : visible[selectedIndex] || null
  const selectedSrc = selected ? imageUrl(selected) : ''
  const categoryCount = item => item === 'Semua' ? photos.length : photos.filter(photo => photo.category === item).length

  useEffect(() => {
    setFitSize(null)
    setPanelSize(null)
    const stage = stageRef.current
    const image = lightboxImageRef.current
    if (!selected || !stage || !image) return undefined

    let frame = 0
    const update = () => {
      const naturalWidth = image.naturalWidth
      const naturalHeight = image.naturalHeight
      const mobile = window.matchMedia('(max-width: 860px)').matches
      const availableWidth = mobile
        ? stage.clientWidth
        : Math.max(200, Math.min(1120, window.innerWidth - 40) - 340)
      const availableHeight = mobile
        ? stage.clientHeight
        : Math.min(760, window.innerHeight * 0.82)
      if (!naturalWidth || !naturalHeight || !availableWidth || !availableHeight) return

      const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight)
      const width = Math.max(1, Math.round(naturalWidth * scale))
      const height = Math.max(1, Math.round(naturalHeight * scale))
      setFitSize({ width, height })
      setPanelSize(mobile ? null : { width: width + 340, height })
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }

    image.addEventListener('load', schedule)
    window.addEventListener('resize', schedule)
    schedule()

    return () => {
      cancelAnimationFrame(frame)
      image.removeEventListener('load', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [selected?.id, selectedSrc])

  const loadComments = async photo => {
    const requestId = ++commentRequest.current
    if (!supabase || photo?.id == null) {
      setComments([])
      return
    }
    const { data, error } = await query('photo_comments', q =>
      q.select('*').eq('photo_id', photo.id).order('created_at')
    )
    if (requestId !== commentRequest.current) return
    setComments(error ? [] : data || [])
  }

  const open = index => {
    setSelectedIndex(index)
    setComment('')
    setZoom(100)
    setPan({ x: 0, y: 0 })
    setNotice('')
    loadComments(visible[index])
  }

  const go = step => {
    if (!visible.length) return
    const next = (selectedIndex + step + visible.length) % visible.length
    open(next)
  }

  const startPan = event => {
    if (zoom <= 100) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    setDragging(true)
  }

  const movePan = event => {
    if (!dragRef.current) return
    setPan({
      x: dragRef.current.panX + event.clientX - dragRef.current.x,
      y: dragRef.current.panY + event.clientY - dragRef.current.y
    })
  }

  const endPan = event => {
    if (dragRef.current && event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
    setDragging(false)
  }

  useEffect(() => {
    if (!selected) return undefined
    const onKeyDown = event => {
      if (event.key === 'Escape') setSelectedIndex(null)
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedIndex, visible.length])

  const addComment = async event => {
    event.preventDefault()
    const text = comment.trim()
    if (!text || !selected?.id || !supabase || busy) return

    setBusy(true)
    try {
      await ensureVisitorUser()
    } catch (error) {
      setBusy(false)
      setNotice(error.message)
      return
    }

    const { error } = await supabase.from('photo_comments').insert({
      photo_id: selected.id,
      text,
      name: visitor()
    })
    setBusy(false)

    if (error) {
      setNotice(error.message)
      return
    }
    setComment('')
    setCommentCounts(previous => ({ ...previous, [selected.id]: (previous[selected.id] || 0) + 1 }))
    await loadComments(selected)
  }

  const requestUploadPermission = async event => {
    event.preventDefault()
    if (!supabase || permissionBusy) return
    setPermissionBusy(true)
    let user
    try {
      user = await ensureVisitorUser()
    } catch (error) {
      setPermissionBusy(false)
      setNotice(error.message)
      return
    }
    const { data, error } = await supabase.from('visitor_upload_permissions').upsert({
      user_id: user.id,
      visitor_id: visitorId(),
      visitor_name: visitor(),
      status: 'pending',
      request_note: permissionNote.trim() || null
    }, { onConflict: 'user_id' }).select().single()
    setPermissionBusy(false)
    if (error) {
      setNotice(error.message)
      return
    }
    setPermission(data)
    setPermissionNote('')
    setNotice('Permintaan izin upload sudah dikirim.')
  }

  const deletePhoto = async photo => {
    if (!adminSession || !supabase || !photo?.id || !window.confirm('Hapus foto ini dari galeri?')) return
    setBusy(true)
    const comments = await supabase.from('photo_comments').delete().eq('photo_id', photo.id)
    if (comments.error) {
      setBusy(false)
      setNotice(comments.error.message)
      return
    }
    const deleted = await supabase.from('photos').delete().eq('id', photo.id)
    if (deleted.error) {
      setBusy(false)
      setNotice(deleted.error.message)
      return
    }
    if (photo.storage_path) {
      const storage = await supabase.storage.from('photos').remove([photo.storage_path])
      if (storage.error) setNotice(`Foto terhapus dari database, tetapi Storage gagal dibersihkan: ${storage.error.message}`)
    }
    setBusy(false)
    setSelectedIndex(null)
    setNotice('Foto berhasil dihapus.')
    await reload()
  }

  const addPhoto = async event => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file || !supabase) return
    if (!adminSession && permission?.status !== 'approved') {
      setNotice('Upload hanya tersedia setelah admin menyetujui izin kamu.')
      return
    }

    const label = uploadCategory === '__new__' ? newCategory.trim() : uploadCategory
    if (!label) {
      setNotice('Pilih kategori foto terlebih dahulu.')
      return
    }
    const path = `${slug(label)}/${uid()}-${slug(file.name)}`

    setBusy(true)
    const upload = await supabase.storage.from('photos').upload(path, file)
    if (upload.error) {
      setBusy(false)
      setNotice(upload.error.message)
      return
    }

    const publicUrl = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl
    const saved = await supabase.from('photos').insert({
      category: label,
      file_name: file.name,
      storage_path: path,
      public_url: publicUrl
    })
    setBusy(false)

    if (saved.error) {
      await supabase.storage.from('photos').remove([path])
      setNotice(saved.error.message)
      return
    }
    setNotice('Foto berhasil ditambahkan.')
    setCategory(label)
    await reload()
  }

  return (
    <section className="gallery">
      <div className="page-head">
        <div>
          <h1>Galeri Kenangan</h1>
          <p>{visible.length} foto dari semua kategori · {Object.values(commentCounts).reduce((sum, value) => sum + value, 0)} komentar</p>
        </div>
        <div className="upload-bar">
          {adminSession || permission?.status === 'approved' ? (
            <>
              <select className="category-select" value={uploadCategory} onChange={event => setUploadCategory(event.target.value)} aria-label="Kategori upload">
                <option value="">Pilih kategori upload</option>
                {categories.filter(item => item !== 'Semua').map(item => <option value={item} key={item}>{item}</option>)}
                <option value="__new__">+ Buat kategori baru</option>
              </select>
              {uploadCategory === '__new__' && (
                <input
                  className="category-input"
                  value={newCategory}
                  onChange={event => setNewCategory(event.target.value)}
                  placeholder="Nama kategori baru"
                  aria-label="Nama kategori baru"
                  maxLength={40}
                />
              )}
              <label className="btn dark">
                + Tambah Foto
                <input hidden type="file" accept="image/*" onChange={addPhoto} disabled={busy} />
              </label>
              <span className="permission-chip approved">Izin upload aktif</span>
            </>
          ) : (
            <form className="upload-permission-form" onSubmit={requestUploadPermission}>
              <span className={`permission-chip ${permission?.status || 'none'}`}>
                {permission?.status === 'pending' ? 'Menunggu persetujuan admin' : permission?.status === 'rejected' ? 'Permintaan ditolak' : permission?.status === 'ignored' ? 'Permintaan diabaikan' : permission?.status === 'revoked' ? 'Izin dibatalkan admin' : 'Belum punya izin upload'}
              </span>
              {(!permission || ['rejected', 'ignored', 'revoked'].includes(permission.status)) && (
                <>
                  <input value={permissionNote} onChange={event => setPermissionNote(event.target.value)} placeholder="Catatan untuk admin (opsional)" aria-label="Catatan permintaan izin" maxLength={180} />
                  <button type="submit" className="btn dark" disabled={permissionBusy}>{permissionBusy ? 'Mengirim...' : 'Minta izin upload'}</button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
      {notice && <p className="notice">{notice}</p>}
      <input
        className="search"
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder="Cari kategori atau nama foto..."
        aria-label="Cari foto"
      />
      <div className="chips">
        {categories.map(item => (
          <button
            type="button"
            className={`chip ${category === item ? 'active' : ''}`}
            onClick={() => setCategory(item)}
            key={item}
          >
            {item} <span className="chip-count">{categoryCount(item)}</span>
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="photo-grid">
          {visible.map((photo, index) => (
            <div className="photo-cell" key={photo.id ?? photo.file ?? photo.storage_path}>
              <button
                type="button"
                className="photo-open"
                onClick={() => open(index)}
                aria-label={`Buka foto ${photo.category || 'kenangan'}`}
              >
                <img src={imageUrl(photo)} alt={photo.category || 'Foto kenangan'} loading="lazy" />
                <span>{photo.category || 'Kenangan'}</span>
                {commentCounts[photo.id] > 0 && <small className="comment-badge" title={`${commentCounts[photo.id]} komentar`}>{commentCounts[photo.id]} komentar</small>}
              </button>
              {adminSession && <button type="button" className="admin-delete-badge" onClick={() => deletePhoto(photo)} disabled={busy}>Hapus</button>}
            </div>
          ))}
        </div>
      ) : <p className="empty-note">Foto tidak ditemukan.</p>}
      {selected && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Detail foto"
          onMouseDown={event => { if (event.target === event.currentTarget) setSelectedIndex(null) }}
        >
          <div
            className="lb-panel"
            style={panelSize ? {
              '--lb-panel-width': `${panelSize.width}px`,
              '--lb-panel-height': `${panelSize.height}px`,
              '--lb-image-width': `${fitSize?.width || panelSize.width - 340}px`
            } : undefined}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="lb-image">
              <img className="lb-image-backdrop" src={selectedSrc} alt="" aria-hidden="true" />

              <button type="button" className="lb-nav prev" disabled={visible.length <= 1} onClick={() => go(-1)} aria-label="Foto sebelumnya">‹</button>
              <button type="button" className="lb-nav next" disabled={visible.length <= 1} onClick={() => go(1)} aria-label="Foto berikutnya">›</button>
              <div className="lb-zoom-controls" onMouseDown={event => event.stopPropagation()}>
                <button type="button" onClick={() => { setZoom(value => Math.max(50, value - 25)); setPan({ x: 0, y: 0 }) }} aria-label="Perkecil gambar">−</button>
                <span>{zoom}%</span>
                <button type="button" onClick={() => { setZoom(value => Math.min(300, value + 25)); setPan({ x: 0, y: 0 }) }} aria-label="Perbesar gambar">+</button>
                <button type="button" onClick={() => { setZoom(100); setPan({ x: 0, y: 0 }) }}>Reset</button>
              </div>
              <div
                className={`lb-zoom-stage ${dragging ? 'is-dragging' : ''}`}
                ref={stageRef}
                onPointerDown={startPan}
                onPointerMove={movePan}
                onPointerUp={endPan}
                onPointerCancel={endPan}
              >
                <img
                  ref={lightboxImageRef}
                  className="lb-zoom-image"
                  src={selectedSrc}
                  alt={selected.category || 'Foto kenangan'}
                  draggable="false"
                  style={{
                    ...(fitSize ? { width: `${fitSize.width}px`, height: `${fitSize.height}px` } : {}),
                    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom / 100})`
                  }}
                />
              </div>
            </div>
            <div className="lb-comments">
              <div className="lbc-head">
                <span className="lbc-cat">{selected.category || 'Kenangan'}</span>
                <div className="lbc-head-actions">
                  <span className="lbc-counter">{selectedIndex + 1} / {visible.length}</span>
                  <button type="button" className="lb-close" onClick={() => setSelectedIndex(null)} aria-label="Tutup">×</button>
                </div>
              </div>
              <div className="lbc-list">
                {comments.length
                  ? comments.map(commentItem => {
                    const name = first(commentItem, ['name', 'author_name'], 'Anonim')
                    return (
                      <div className="lbc-item" key={commentItem.id ?? commentItem.created_at}>
                        <div className="lbc-avatar">{initial(name)}</div>
                        <div>
                          <div className="lbc-meta">
                            <b>{name}</b>
                            <span>{commentDate(commentItem.created_at)}</span>
                          </div>
                          <div className="lbc-text">{first(commentItem, ['text', 'content'])}</div>
                        </div>
                      </div>
                    )
                  })
                  : <div className="lbc-empty">Belum ada komentar. Jadilah yang pertama!</div>}
              </div>
              <form className="lbc-form" onSubmit={addComment} onMouseDown={event => event.stopPropagation()}>
                <div className="lbc-author">Menulis sebagai <b>{visitor()}</b></div>
                <div className="lbc-form-row">
                  <input
                    value={comment}
                    onChange={event => setComment(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') addComment(event) }}
                    placeholder="Tulis komentar untuk foto ini..."
                    maxLength={300}
                    aria-label="Tulis komentar"
                  />
                  <button type="submit" className="btn-send" disabled={!comment.trim() || busy}>Kirim</button>
                </div>
                {notice && <p className="notice">{notice}</p>}
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function Bulletin() {
  const [photos] = usePhotos()
  const [notes, setNotes] = useState([])
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ emoji: '💌', text: '', tags: '', color: 0 })
  const [draftPhoto, setDraftPhoto] = useState(null)
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState([])
  const [commentCounts, setCommentCounts] = useState({})
  const [colorMap, setColorMap] = useState(() => {
    try {
      return JSON.parse(globalThis.localStorage?.getItem('rpl2-bulletin-colors') || '{}')
    } catch {
      return {}
    }
  })
  const [search, setSearch] = useState('')
  const [reactionBumps, setReactionBumps] = useState({})
  const [reacted, setReacted] = useState([])
  const [reaction, setReaction] = useState('❤')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState('Semua Memo')
  const [colorFilter, setColorFilter] = useState(-1)
  const [colorFilterOpen, setColorFilterOpen] = useState(false)
  const [freeMode, setFreeMode] = useState(true)
  const [tapeVisible, setTapeVisible] = useState(true)
  const [draggedId, setDraggedId] = useState(null)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [emojiTarget, setEmojiTarget] = useState(null)
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false)
  const [photoTarget, setPhotoTarget] = useState(null)
  const [photoTab, setPhotoTab] = useState('device')
  const [webCategory, setWebCategory] = useState('')
  const [webSearch, setWebSearch] = useState('')
  const [photoMetaOpen, setPhotoMetaOpen] = useState(false)
  const [metaTarget, setMetaTarget] = useState(null)
  const [metaDescription, setMetaDescription] = useState('')
  const [metaTags, setMetaTags] = useState('')
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const feedbackTimer = useRef(null)

  const showFeedback = message => {
    setFeedback(message)
    window.clearTimeout(feedbackTimer.current)
    feedbackTimer.current = window.setTimeout(() => setFeedback(''), 2600)
  }

  const noteText = note => first(note, ['text', 'content'], '')
  const noteName = note => first(note, ['name', 'author_name'], 'Anonim')
  const notePhoto = note => first(note, ['photo_url', 'image_url'], '')
  const noteEmoji = note => first(note, ['emoji'], '')
  const noteColor = note => Number(note.color ?? colorMap[note.id] ?? Math.abs(hashValue(String(note.id ?? noteText(note)))) % 4)
  const reactionCount = note => Number(note.reaction_count || note.reactions?.length || 0) + (reactionBumps[note.id] || 0)

  const load = async () => {
    const { data, error } = await query('bulletin_notes', q => q.select('*').order('created_at', { ascending: false }))
    setNotes(error ? [] : data || [])
  }

  useEffect(() => {
    load()
    return () => window.clearTimeout(feedbackTimer.current)
  }, [])

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem('rpl2-bulletin-colors', JSON.stringify(colorMap))
    } catch {}
  }, [colorMap])

  useEffect(() => {
    let active = true
    const loadCounts = async () => {
      const { data, error } = await query('bulletin_comments', q => q.select('note_id'))
      if (active && !error && data) {
        const counts = {}
        data.forEach(item => { counts[item.note_id] = (counts[item.note_id] || 0) + 1 })
        setCommentCounts(counts)
      }
    }
    loadCounts()
    return () => { active = false }
  }, [notes.length, selected])

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    const apply = session => {
      const user = session?.user
      setAdmin(Boolean(user && !user.is_anonymous && user.app_metadata?.role === 'admin'))
    }
    supabase.auth.getSession().then(({ data }) => { if (active) apply(data.session) })
    const { data: auth } = supabase.auth.onAuthStateChange((_, session) => apply(session))
    return () => { active = false; auth?.subscription?.unsubscribe() }
  }, [])

  const uploadPhoto = async file => {
    const path = `bulletin/${uid()}-${slug(file.name)}`
    const upload = await supabase.storage.from('photos').upload(path, file)
    if (upload.error) throw new Error(upload.error.message)
    return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl
  }

  const patchNote = async (note, patch, message) => {
    if (!supabase || note?.id == null) return
    const { error } = await supabase.from('bulletin_notes').update(patch).eq('id', note.id)
    if (error) {
      showFeedback(error.message)
      return
    }
    setNotes(current => current.map(item => item.id === note.id ? { ...item, ...patch } : item))
    setSelected(current => current?.id === note.id ? { ...current, ...patch } : current)
    if (message) showFeedback(message)
  }

  const open = async note => {
    setSelected(note)
    setComment('')
    setComments([])
    if (!supabase || note?.id == null) return
    const { data, error } = await query('bulletin_comments', q => q.select('*').eq('note_id', note.id).order('created_at'))
    setComments(error ? [] : data || [])
  }

  const add = async event => {
    event.preventDefault()
    const text = form.text.trim()
    if ((!text && !draftPhoto?.url) || !supabase || busy) return

    setBusy(true)
    try {
      await ensureVisitorUser()
      let photoUrl = draftPhoto?.url || ''
      if (draftPhoto?.file && supabase) photoUrl = await uploadPhoto(draftPhoto.file)
      const { data, error } = await supabase.from('bulletin_notes').insert({
        text,
        name: visitor(),
        emoji: form.emoji.trim() || '💌',
        tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        photo_url: photoUrl
      }).select().single()
      if (error) throw new Error(error.message)
      if (data?.id != null) setColorMap(current => ({ ...current, [data.id]: form.color }))
      setForm({ emoji: '💌', text: '', tags: '', color: 0 })
      setDraftPhoto(null)
      showFeedback('Catatan berhasil ditempel di papan.')
      await load()
    } catch (error) {
      showFeedback(error.message)
    }
    setBusy(false)
  }

  const react = note => {
    if (!note?.id || reacted.includes(note.id)) return
    setReacted(current => [...current, note.id])
    setReactionBumps(current => ({ ...current, [note.id]: (current[note.id] || 0) + 1 }))
    showFeedback('Reaksi suka terkirim.')
  }

  const addComment = async event => {
    event.preventDefault()
    const text = comment.trim()
    if (!text || !selected?.id || !supabase || busy) return

    setBusy(true)
    try {
      await ensureVisitorUser()
    } catch (error) {
      setBusy(false)
      showFeedback(error.message)
      return
    }
    const { error } = await supabase.from('bulletin_comments').insert({
      note_id: selected.id,
      text,
      name: visitor()
    })
    setBusy(false)

    if (error) {
      showFeedback(error.message)
      return
    }
    setComment('')
    await open(selected)
  }

  const deleteNote = async note => {
    if (!admin || !window.confirm('Hapus catatan ini dari papan?')) return
    if (supabase) await supabase.from('bulletin_comments').delete().eq('note_id', note.id)
    const { error } = await query('bulletin_notes', q => q.delete().eq('id', note.id))
    if (error) {
      showFeedback(error.message)
      return
    }
    setNotes(current => current.filter(item => item.id !== note.id))
    setColorMap(current => {
      const next = { ...current }
      delete next[note.id]
      return next
    })
    setSelected(current => current?.id === note.id ? null : current)
    showFeedback('Catatan dihapus.')
  }

  const openPhotoPicker = note => {
    setPhotoTarget(note ?? null)
    setPhotoPickerOpen(true)
    setPhotoTab('device')
    setWebCategory('')
    setWebSearch('')
  }

  const queuePhoto = photo => {
    setPendingPhoto(photo)
    setMetaTarget(photoTarget)
    setMetaDescription('')
    setMetaTags('')
    setPhotoPickerOpen(false)
    setPhotoMetaOpen(true)
  }

  const confirmPhoto = async () => {
    if (!pendingPhoto || busy) return
    setBusy(true)
    try {
      let url = pendingPhoto.url
      if (pendingPhoto.file && supabase) url = await uploadPhoto(pendingPhoto.file)
      if (metaTarget) {
        const patch = { photo_url: url }
        if (metaDescription.trim()) patch.text = metaDescription.trim()
        if (metaTags.trim()) patch.tags = metaTags.split(',').map(tag => tag.trim()).filter(Boolean)
        await patchNote(metaTarget, patch, 'Foto berhasil dipasang.')
      } else {
        setDraftPhoto({ url, file: null, name: pendingPhoto.name })
        if (metaDescription.trim()) setForm(current => ({ ...current, text: metaDescription.trim() }))
        if (metaTags.trim()) setForm(current => ({ ...current, tags: metaTags.trim() }))
        showFeedback('Foto siap ditempel.')
      }
      setPhotoMetaOpen(false)
      setMetaTarget(null)
      setPendingPhoto(null)
    } catch (error) {
      showFeedback(error.message)
    }
    setBusy(false)
  }

  const chooseEmoji = emoji => {
    if (emojiTarget) patchNote(emojiTarget, { emoji }, 'Emoji diperbarui.')
    else setForm(current => ({ ...current, emoji }))
    setEmojiPickerOpen(false)
    setEmojiTarget(null)
  }

  const dropOn = note => {
    if (!draggedId || draggedId === note.id) {
      setDraggedId(null)
      return
    }
    setNotes(current => {
      const source = current.findIndex(item => item.id === draggedId)
      const target = current.findIndex(item => item.id === note.id)
      if (source < 0 || target < 0) return current
      const next = [...current]
      const [moved] = next.splice(source, 1)
      next.splice(target, 0, moved)
      return next
    })
    setDraggedId(null)
    showFeedback('Posisi note diperbarui di papan.')
  }

  const categories = [...new Set(photos.map(photo => first(photo, ['category'], 'Lainnya')))]
  const webPhotos = photos
    .filter(photo => {
      const category = first(photo, ['category'], 'Lainnya')
      const name = first(photo, ['name', 'title', 'file_name', 'file'])
      return (!webCategory || category === webCategory) && (!webSearch || `${category} ${name}`.toLowerCase().includes(webSearch.toLowerCase()))
    })
    .slice(0, 60)

  const visible = notes.filter(note => {
    const haystack = `${noteName(note)} ${noteText(note)} ${tagsOf(note.tags).join(' ')}`.toLowerCase()
    if (search && !haystack.includes(search.toLowerCase())) return false
    if (colorFilter >= 0 && noteColor(note) !== colorFilter) return false
    const emoji = noteEmoji(note)
    if (activeTab === 'To-Do & Ide') return ['✅', '💡', '🎯', '📝'].some(item => emoji.includes(item)) || /#?todo|#?ide/i.test(noteText(note))
    if (activeTab === 'Polaroid Kenangan') return Boolean(notePhoto(note))
    if (activeTab === 'Inspirasi Visual') return ['🎨', '🖼️', '🌟', '🌈'].some(item => emoji.includes(item)) || noteColor(note) === 3
    if (activeTab === 'Sketsa & Kliping') return ['🖋️', '📌', '📚', '✂'].some(item => emoji.includes(item)) || noteColor(note) === 1
    return true
  })

  const emojis = ['💌', '💖', '🌟', '🌿', '🎈', '📚', '🎨', '🖼️', '📷', '✅', '💡', '🎯', '☕', '🍰', '🎧', '🖋️', '📌', '✂', '🌈', '🐾']
  const reactions = ['❤', '😂', '😮', '😢', '🔥', '👏']
  const tabs = ['Semua Memo', 'To-Do & Ide', 'Polaroid Kenangan', 'Inspirasi Visual', 'Sketsa & Kliping']

  return (
    <div className="atelier-app">
      <header className="atelier-header">
        <div className="atelier-header-row">
          <div className="atelier-crumbs">
            <span>Studio</span><span className="atelier-sep">/</span><span>RPL 2</span><span className="atelier-sep">/</span><b>Atelier Notes</b>
          </div>
          <label className="atelier-search">
            <span className="material-symbols-outlined">⌕</span>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari memo, tag, atau kenangan..." />
          </label>
          <div className="atelier-header-actions">
            <button
              type="button"
              className={`atelier-chip ${colorFilter >= 0 ? 'active' : ''}`}
              onClick={() => setColorFilterOpen(value => !value)}
            >
              <span className="material-symbols-outlined">◐</span> Filter Warna
            </button>
            <button type="button" className="atelier-chip" onClick={() => openPhotoPicker(null)}>
              <span className="material-symbols-outlined">▣</span> Galeri Sample
            </button>
            <button type="button" className="atelier-primary" onClick={() => document.getElementById('bulletin-composer')?.focus()}>
              <span className="material-symbols-outlined">＋</span> Tempel Note
            </button>
            <div className="atelier-avatar" title={visitor()}><span className={`atelier-avatar-initial avatar-${avatarIndex(visitor())}`}>{initial(visitor())}</span></div>
          </div>
        </div>
        <nav className="atelier-tabs" aria-label="Filter papan">
          {tabs.map(tab => (
            <button
              type="button"
              key={tab}
              className={`atelier-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      {colorFilterOpen && (
        <>
          <div className="atelier-popover-backdrop" onClick={() => setColorFilterOpen(false)} />
          <div className="atelier-color-popover">
            <div className="atelier-color-popover-head"><b>Filter warna sticky</b><button type="button" onClick={() => setColorFilterOpen(false)}>×</button></div>
            <div className="atelier-color-options">
              <button type="button" className="atelier-color-all" onClick={() => { setColorFilter(-1); setColorFilterOpen(false) }}>Semua</button>
              {['kuning', 'pink', 'hijau', 'biru'].map((label, index) => (
                <button
                  type="button"
                  key={label}
                  className={`atelier-color-swatch color-${index} ${colorFilter === index ? 'active' : ''}`}
                  onClick={() => { setColorFilter(index); setColorFilterOpen(false) }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <main className="atelier-main">
        <div className="atelier-board">
          <div className="atelier-glow" />
          <div className="atelier-toolbar">
            <button
              type="button"
              className={`atelier-tool ${freeMode ? 'active' : ''}`}
              onClick={() => setFreeMode(value => !value)}
              title="Seret dan lepas sticky note"
            >
              <span className="material-symbols-outlined">✥</span> {freeMode ? 'Free' : 'Snap'}
            </button>
            <button
              type="button"
              className={`atelier-tool ${tapeVisible ? 'active' : ''}`}
              onClick={() => setTapeVisible(value => !value)}
              title="Tampilkan lakban"
            >
              <span className="material-symbols-outlined">▬</span> Tape
            </button>
            <span className="atelier-tool-hint">Klik sticky untuk melihat detail & komentar</span>
          </div>

          <div className={`atelier-grid ${freeMode ? 'free' : 'snapped'} ${tapeVisible ? '' : 'no-tape'}`}>
            {visible.length ? visible.map((note, index) => (
              <article
                key={note.id ?? note.created_at}
                className={`atelier-card style-${index % 6 + 1} color-${noteColor(note)} ${draggedId === note.id ? 'drag-source' : ''}`}
                draggable={freeMode}
                onDragStart={() => setDraggedId(note.id)}
                onDragEnter={() => dropOn(note)}
                onDragOver={event => event.preventDefault()}
                onDrop={event => { event.preventDefault(); dropOn(note) }}
                onDragEnd={() => setDraggedId(null)}
              >
                <span className="atelier-tape" />
                {notePhoto(note) && (
                  <div className="atelier-photo">
                    <img src={notePhoto(note)} alt="Lampiran catatan" loading="lazy" />
                    <span className="atelier-photo-time">{asDate(note.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
                {noteEmoji(note) && <span className="atelier-emoji-stamp">{noteEmoji(note)}</span>}
                <header>
                  <span className="atelier-card-title">{noteName(note)}</span>
                  <span className="atelier-card-badge">{dateLabel(note.created_at)}</span>
                </header>
                <button type="button" className="atelier-note-body" onClick={() => open(note)}>
                  <p>{noteText(note)}</p>
                </button>
                <footer>
                  <span className="atelier-tags">{tagsOf(note.tags).map(tag => `#${tag}`).join(' ') || '#AtelierJournal #Kenangan'}</span>
                  <span className="atelier-card-actions">
                    <button type="button" onClick={() => openPhotoPicker(note)} title="Pasang foto">▧</button>
                    <button type="button" onClick={() => { setEmojiTarget(note); setEmojiPickerOpen(true) }} title="Ganti emoji">☺</button>
                    <button type="button" onClick={() => open(note)} title="Buka komentar">◌ {commentCounts[note.id] || 0}</button>
                    {admin && <button type="button" className="atelier-delete" onClick={() => deleteNote(note)} title="Hapus">×</button>}
                  </span>
                </footer>
              </article>
            )) : (
              <div className="atelier-empty"><b>Belum ada memo di papan ini.</b><span>Tempel catatan pertamamu lewat composer di bawah.</span></div>
            )}
          </div>
        </div>
      </main>

      {feedback && <div className="atelier-toast">{feedback}</div>}

      <form className="atelier-composer" onSubmit={add}>
        <span className="atelier-composer-icon">＋</span>
        <span className="atelier-composer-name">{visitor()}</span>
        <span className="atelier-composer-divider" />
        {draftPhoto && (
          <span className="atelier-draft-chip">
            ▣ foto
            <button type="button" onClick={() => setDraftPhoto(null)}>×</button>
          </span>
        )}
        <input
          id="bulletin-composer"
          className="atelier-composer-text"
          value={form.text}
          onChange={event => setForm(current => ({ ...current, text: event.target.value }))}
          placeholder="Tulis sesuatu... Named, dated, pinned."
          aria-label="Isi catatan"
        />
        <input
          className="atelier-composer-tags"
          value={form.tags}
          onChange={event => setForm(current => ({ ...current, tags: event.target.value }))}
          placeholder="tag, tag"
          aria-label="Tag"
        />
        <select
          className="atelier-composer-color"
          value={form.color}
          onChange={event => setForm(current => ({ ...current, color: Number(event.target.value) }))}
          aria-label="Warna catatan"
        >
          <option value={0}>Kuning</option>
          <option value={1}>Pink</option>
          <option value={2}>Hijau</option>
          <option value={3}>Biru</option>
        </select>
        <button type="button" className="atelier-composer-extra" onClick={() => { setEmojiTarget(null); setEmojiPickerOpen(true) }} title="Pilih emoji">☺ {form.emoji}</button>
        <button type="button" className="atelier-composer-extra" onClick={() => openPhotoPicker(null)} title="Lampirkan foto">▣</button>
        <button type="submit" className="atelier-pin" disabled={busy || (!form.text.trim() && !draftPhoto)}>{busy ? '...' : 'Tempel'}</button>
      </form>

      {photoPickerOpen && (
        <div className="atelier-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setPhotoPickerOpen(false) }}>
          <div className="atelier-modal atelier-photo-modal">
            <div className="atelier-photo-modal-main">
              <div className="atelier-modal-head">
                <div><span className="atelier-mini-kicker">Atelier / Image Library</span><h2>Pilih foto</h2></div>
                <button type="button" className="atelier-modal-close" onClick={() => setPhotoPickerOpen(false)}>×</button>
              </div>
              <div className="atelier-source-tabs">
                <button type="button" className={photoTab === 'device' ? 'active' : ''} onClick={() => setPhotoTab('device')}>▣ Dari perangkat</button>
                <button type="button" className={photoTab === 'web' ? 'active' : ''} onClick={() => setPhotoTab('web')}>◈ Dari galeri</button>
              </div>
              {photoTab === 'device' ? (
                <label className="atelier-upload-zone">
                  <span className="atelier-upload-icon">⇧</span>
                  <b>Upload dari perangkat</b>
                  <span>Pilih satu foto untuk ditempel di papan.</span>
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    onChange={event => {
                      const file = event.target.files?.[0]
                      if (file) queuePhoto({ url: URL.createObjectURL(file), file, name: file.name })
                      event.target.value = ''
                    }}
                  />
                </label>
              ) : (
                <div className="atelier-web-picker">
                  <div className="atelier-web-filters">
                    <select value={webCategory} onChange={event => setWebCategory(event.target.value)}>
                      <option value="">Semua kategori</option>
                      {categories.map(category => <option key={category} value={category}>{category}</option>)}
                    </select>
                    <input value={webSearch} onChange={event => setWebSearch(event.target.value)} placeholder="Cari foto..." />
                  </div>
                  <div className="atelier-web-grid">
                    {webPhotos.length ? webPhotos.map(photo => {
                      const url = imageUrl(photo)
                      return (
                        <button type="button" key={photo.id ?? url} onClick={() => queuePhoto({ url, name: first(photo, ['name', 'title', 'file_name', 'file'], 'foto') })}>
                          <img src={url} alt={first(photo, ['name', 'title'], 'Foto galeri')} loading="lazy" />
                        </button>
                      )
                    }) : <p className="atelier-empty-inline">Foto tidak ditemukan.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {photoMetaOpen && pendingPhoto && (
        <div className="atelier-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) { setPhotoMetaOpen(false); setPendingPhoto(null) } }}>
          <div className="atelier-modal atelier-meta-modal">
            <div className="atelier-meta-preview"><img src={pendingPhoto.url} alt="Pratinjau foto" /></div>
            <div className="atelier-meta-form">
              <div className="atelier-modal-head">
                <div><span className="atelier-mini-kicker">Langkah terakhir</span><h2>Siapkan pin-mu</h2></div>
                <button type="button" className="atelier-modal-close" onClick={() => { setPhotoMetaOpen(false); setPendingPhoto(null) }}>×</button>
              </div>
              <label>Deskripsi singkat<textarea value={metaDescription} onChange={event => setMetaDescription(event.target.value)} rows={4} placeholder="Ceritakan kenangan di balik foto ini..." /></label>
              <label>Tag<em>Dipisah koma</em><input value={metaTags} onChange={event => setMetaTags(event.target.value)} placeholder="kenangan, rpl2, semester5" /></label>
              <div className="atelier-meta-actions">
                <button type="button" className="atelier-secondary" onClick={() => { setPhotoMetaOpen(false); setPendingPhoto(null) }}>Batal</button>
                <button type="button" className="atelier-primary" onClick={confirmPhoto} disabled={busy}>{busy ? 'Menyiapkan...' : 'Pasang di papan'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {emojiPickerOpen && (
        <div className="atelier-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEmojiPickerOpen(false) }}>
          <div className="atelier-modal atelier-emoji-modal">
            <div className="atelier-modal-head">
              <div><span className="atelier-mini-kicker">Atelier / Emoji</span><h2>Pilih jarak kenangan</h2></div>
              <button type="button" className="atelier-modal-close" onClick={() => setEmojiPickerOpen(false)}>×</button>
            </div>
            <div className="atelier-emoji-grid">
              {emojis.map(emoji => <button type="button" key={emoji} onClick={() => chooseEmoji(emoji)}>{emoji}</button>)}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="atelier-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null) }}>
          <div className="atelier-modal atelier-detail-modal">
            <section className={`atelier-modal-note color-${noteColor(selected)}`}>
              <span className="atelier-tape" />
              {notePhoto(selected) && <div className="atelier-photo"><img src={notePhoto(selected)} alt="Lampiran catatan" /></div>}
              {noteEmoji(selected) && <span className="atelier-emoji-stamp">{noteEmoji(selected)}</span>}
              <header>
                <span className="atelier-card-title">{noteName(selected)}</span>
                <span className="atelier-card-badge">{dateLabel(selected.created_at)}</span>
              </header>
              <p>{noteText(selected)}</p>
              <span className="atelier-tags">{tagsOf(selected.tags).map(tag => `#${tag}`).join(' ')}</span>
            </section>
            <section className="atelier-modal-side">
              <div className="atelier-modal-head">
                <div><span className="atelier-mini-kicker">Atelier / Thread</span><h2>Notes & ketones</h2></div>
                <button type="button" className="atelier-modal-close" onClick={() => setSelected(null)}>×</button>
              </div>
              <div className="atelier-reactions">
                <span>Reaksi</span>
                {reactions.map(item => (
                  <button
                    type="button"
                    key={item}
                    className={reaction === item ? 'active' : ''}
                    onClick={() => { setReaction(item); react(selected) }}
                  >
                    {item}
                  </button>
                ))}
                <b>{reactionCount(selected)}</b>
              </div>
              <div className="atelier-comments-list">
                {comments.length ? comments.map(item => (
                  <div className="atelier-comment" key={item.id ?? item.created_at}>
                    <span className={`atelier-comment-avatar avatar-${avatarIndex(noteName(item))}`}>{initial(noteName(item))}</span>
                    <div><b>{noteName(item)}</b><small>{commentDate(item.created_at)}</small><p>{noteText(item)}</p></div>
                  </div>
                )) : <p className="atelier-empty-inline">Belum ada komentar. Jadi yang pertama.</p>}
              </div>
              <form className="atelier-comment-form" onSubmit={addComment}>
                <span className={`atelier-comment-avatar avatar-${avatarIndex(visitor())}`}>{initial(visitor())}</span>
                <div>
                  <span className="atelier-comment-author">{visitor()}</span>
                  <textarea value={comment} onChange={event => setComment(event.target.value)} rows={2} placeholder="Tulis ketemu..." aria-label="Tulis komentar" />
                  <button type="submit" className="atelier-primary" disabled={busy || !comment.trim()}>Kirim</button>
                </div>
              </form>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

function Admin({ login = false }) {
  const [session, setSession] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tab, setTab] = useState('notes')
  const [items, setItems] = useState({ photos: [], notes: [], photoComments: [], bulletinComments: [], profiles: [], visits: [], uploadPermissions: [] })
  const [heroSettings, setHeroSettings] = useState(null)
  const [heroForm, setHeroForm] = useState({ photo_id: '', badge: '', title: '', subtitle: '', mode: 'auto' })
  const [detail, setDetail] = useState(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const [photos, notes, photoComments, bulletinComments, profiles, visits, uploadPermissions, hero] = await Promise.all([
      query('photos', q => q.select('*').order('created_at', { ascending: false }).limit(100)),
      query('bulletin_notes', q => q.select('*').order('created_at', { ascending: false }).limit(100)),
      query('photo_comments', q => q.select('*').order('created_at', { ascending: false }).limit(100)),
      query('bulletin_comments', q => q.select('*').order('created_at', { ascending: false }).limit(100)),
      query('profiles', q => q.select('*').limit(100)),
      query('visitor_visits', q => q.select('*').order('created_at', { ascending: false }).limit(100)),
      query('visitor_upload_permissions', q => q.select('*').order('updated_at', { ascending: false }).limit(100)),
      query('hero_settings', q => q.select('*').eq('id', 1).maybeSingle())
    ])
    setItems({
      photos: photos.data || [],
      notes: notes.data || [],
      photoComments: photoComments.data || [],
      bulletinComments: bulletinComments.data || [],
      profiles: profiles.data || [],
      visits: visits.data || [],
      uploadPermissions: uploadPermissions.data || []
    })
    const settings = hero.data || null
    setHeroSettings(settings)
    if (settings) setHeroForm({
      photo_id: settings.photo_id ? String(settings.photo_id) : '',
      badge: settings.badge || '',
      title: settings.title || '',
      subtitle: settings.subtitle || '',
      mode: settings.mode || 'auto'
    })
  }

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(result => setSession(result.data.session))
    const subscription = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session && !session.user.is_anonymous && session.user.app_metadata?.role === 'admin') refresh()
  }, [session])

  const signIn = async event => {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setNotice(error.message)
      return
    }
    setNotice('')
  }

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut()
    setSession(null)
    location.hash = '/admin/login'
  }

  const isAdminSession = Boolean(
    session?.user &&
    !session.user.is_anonymous &&
    session.user.email &&
    session.user.app_metadata?.role === 'admin'
  )

  const remove = async (table, id, path) => {
    if (!supabase || !confirm('Hapus item ini?')) return
    if (table === 'photos') {
      const comments = await supabase.from('photo_comments').delete().eq('photo_id', id)
      if (comments.error) {
        setNotice(comments.error.message)
        return
      }
    }
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) {
      setNotice(error.message)
      return
    }
    if (path) {
      const storage = await supabase.storage.from('photos').remove([path])
      if (storage.error) setNotice(`Foto di database terhapus, tetapi file Storage gagal dihapus: ${storage.error.message}`)
    }
    await refresh()
  }

  const updatePermission = async (permission, status) => {
    if (!supabase || busy) return
    setBusy(true)
    const { error } = await supabase.from('visitor_upload_permissions').update({
      status,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq('id', permission.id)
    setBusy(false)
    if (error) {
      setNotice(error.message)
      return
    }
    setNotice(`Status izin ${permission.visitor_name || 'visitor'} diubah menjadi ${status}.`)
    await refresh()
  }

  const saveHero = async event => {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    const payload = {
      id: 1,
      photo_id: heroForm.mode === 'auto' || !heroForm.photo_id ? null : Number(heroForm.photo_id),
      mode: heroForm.mode,
      badge: heroForm.badge.trim() || null,
      title: heroForm.title.trim() || null,
      subtitle: heroForm.subtitle.trim() || null,
      updated_at: new Date().toISOString()
    }
    const { data, error } = await supabase.from('hero_settings').upsert(payload).select().single()
    setBusy(false)
    if (error) {
      setNotice(error.message)
      return
    }
    setHeroSettings(data)
    setNotice('Pengaturan hero berhasil disimpan.')
  }

  if (login && !isAdminSession) {
    return (
      <section className="login-card">
        <span className="kicker">ADMIN</span>
        <h1>Masuk admin.</h1>
        {notice && <p className="notice error">{notice}</p>}
        <form onSubmit={signIn}>
          <label>
            Email
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="admin@email.com" required autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Password" required autoComplete="current-password" />
          </label>
          <button type="submit" className="btn dark" disabled={busy || !supabase}>Masuk</button>
        </form>
        {!supabase && <p className="notice error">Supabase belum dikonfigurasi.</p>}
      </section>
    )
  }

  if (!isAdminSession) {
    return (
      <section className="login-card">
        <h2>Akses admin diperlukan</h2>
        <p>Login dengan akun admin untuk membuka panel ini.</p>
        <button type="button" className="btn dark" onClick={() => { location.hash = '/admin/login' }}>Login</button>
      </section>
    )
  }

  const allComments = [
    ...items.photoComments.map(comment => ({ ...comment, source: 'Galeri' })),
    ...items.bulletinComments.map(comment => ({ ...comment, source: 'Buletin' }))
  ]
  const uniqueVisitors = new Set(items.visits.map(visit => visit.visitor_id).filter(Boolean)).size
  const tabs = [
    ['notes', 'Catatan', items.notes.length],
    ['photos', 'Foto', items.photos.length],
    ['comments', 'Komentar', allComments.length],
    ['profiles', 'Profil', items.profiles.length],
    ['visits', 'Kunjungan', items.visits.length],
    ['upload-permissions', 'Izin upload', items.uploadPermissions.filter(item => item.status === 'pending').length],
    ['hero', 'Hero banner', heroSettings ? 1 : 0]
  ]

  return (
    <section className="admin">
      <div className="page-head">
        <div>
          <span className="kicker">Control room</span>
          <h1>Aktivitas admin</h1>
        </div>
        <button type="button" className="outline" onClick={signOut}>Keluar</button>
      </div>
      {notice && <p className="notice error">{notice}</p>}
      <div className="stats admin-stats">
        <div><b>{items.photos.length}</b><span>foto</span></div>
        <div><b>{items.notes.length}</b><span>note</span></div>
        <div><b>{allComments.length}</b><span>komentar</span></div>
        <div><b>{items.profiles.length}</b><span>profil</span></div>
        <div><b>{uniqueVisitors}</b><span>pengunjung unik</span></div>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([key, label, count]) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
            key={key}
          >
            {label} <span>{count}</span>
          </button>
        ))}
      </div>
      <div className="admin-panel">
        {tab === 'notes' && (
          items.notes.length ? (
            <div className="admin-list">
              {items.notes.map(note => (
                <div className="admin-row" key={note.id}>
                  <button type="button" className="row-main" onClick={() => setDetail(note)}>
                    <b>{first(note, ['name', 'author_name'], 'Anonim')}</b>
                    <span>{first(note, ['text', 'content']).slice(0, 90)}</span>
                    <i>{dateTime(note.created_at)}</i>
                  </button>
                  <button type="button" className="row-delete" onClick={() => remove('bulletin_notes', note.id)}>Hapus</button>
                </div>
              ))}
            </div>
          ) : <p className="empty-note">Belum ada catatan.</p>
        )}
        {tab === 'photos' && (
          items.photos.length ? (
            <div className="admin-list">
              {items.photos.map(photo => (
                <div className="admin-row" key={photo.id}>
                  <button type="button" className="row-main" onClick={() => setDetail(photo)}>
                    <img className="admin-thumb" src={imageUrl(photo)} alt="" loading="lazy" />
                    <span><b>{photo.category || 'Kenangan'}</b> {photo.file_name || photo.file || photo.name}</span>
                    <i>{dateLabel(photo.created_at)}</i>
                  </button>
                  <button type="button" className="row-delete" onClick={() => remove('photos', photo.id, photo.storage_path)}>Hapus</button>
                </div>
              ))}
            </div>
          ) : <p className="empty-note">Belum ada foto.</p>
        )}
        {tab === 'comments' && (
          allComments.length ? (
            <div className="admin-list">
              {allComments.map(comment => (
                <div className="admin-row" key={`${comment.source}-${comment.id}`}>
                  <div className="row-main static">
                    <b>{first(comment, ['name', 'author_name'], 'Anonim')} <small>{comment.source}</small></b>
                    <span>{first(comment, ['text', 'content']).slice(0, 110)}</span>
                    <i>{dateTime(comment.created_at)}</i>
                  </div>
                  <button type="button" className="row-delete" onClick={() => remove(comment.source === 'Galeri' ? 'photo_comments' : 'bulletin_comments', comment.id)}>Hapus</button>
                </div>
              ))}
            </div>
          ) : <p className="empty-note">Belum ada komentar.</p>
        )}
        {tab === 'profiles' && (
          items.profiles.length ? (
            <div className="admin-list">
              {items.profiles.map(profile => (
                <div className="admin-row" key={profile.id}>
                  <div className="row-main static">
                    <b>{first(profile, ['name', 'full_name', 'email', 'username'], 'Profil')}</b>
                    <span>{first(profile, ['email', 'note', 'message', 'id'], '-')}</span>
                    <i>{dateTime(profile.created_at || profile.updated_at)}</i>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="empty-note">Belum ada profil.</p>
        )}
        {tab === 'visits' && (
          items.visits.length ? (
            <div className="admin-list">
              {items.visits.map(visit => (
                <div className="admin-row" key={visit.id ?? `${visit.visitor_id}-${visit.created_at}`}>
                  <div className="row-main static">
                    <b>{first(visit, ['name', 'visitor_name'], 'Pengunjung')}</b>
                    <span>{first(visit, ['path'], '/')} · {first(visit, ['referrer'], 'Langsung')}</span>
                    <i>{dateTime(visit.created_at || visit.at)}</i>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="empty-note">Belum ada kunjungan.</p>
        )}
        {tab === 'hero' && (
          <form className="hero-settings-form" onSubmit={saveHero}>
            <div className="template-panel-head"><span>01</span><div><h2>Hero banner</h2><p>Atur tampilan banner halaman depan.</p></div></div>
            <label className="tm-field"><span>Mode banner</span><select value={heroForm.mode} onChange={event => setHeroForm({ ...heroForm, mode: event.target.value })}><option value="auto">Otomatis mengikuti foto terbaru</option><option value="manual">Pilih foto sendiri</option></select></label>
            <label className="tm-field"><span>Foto hero</span><select value={heroForm.photo_id} disabled={heroForm.mode === 'auto'} onChange={event => setHeroForm({ ...heroForm, photo_id: event.target.value })}><option value="">Pilih foto</option>{items.photos.map(photo => <option value={photo.id} key={photo.id}>{photo.category || 'Kenangan'} · {photo.file_name || photo.file || photo.name}</option>)}</select></label>
            <label className="tm-field"><span>Badge kecil</span><input value={heroForm.badge} maxLength={80} onChange={event => setHeroForm({ ...heroForm, badge: event.target.value })} placeholder="Digital yearbook kelas XII RPL 2" /></label>
            <label className="tm-field"><span>Judul hero</span><textarea value={heroForm.title} maxLength={120} rows={2} onChange={event => setHeroForm({ ...heroForm, title: event.target.value })} placeholder={'Kenangan kita,\nselamanya.'} /></label>
            <label className="tm-field"><span>Subjudul</span><textarea value={heroForm.subtitle} maxLength={180} rows={3} onChange={event => setHeroForm({ ...heroForm, subtitle: event.target.value })} placeholder="Semua momen kelas, tersimpan dalam satu tempat." /></label>
            <button type="submit" className="btn dark" disabled={busy}>Simpan pengaturan hero</button>
          </form>
        )}
        {tab === 'upload-permissions' && (
          items.uploadPermissions.length ? (
            <div className="admin-list">
              {items.uploadPermissions.map(permission => (
                <div className="admin-row" key={permission.id}>
                  <div className="row-main static">
                    <b>{permission.visitor_name || 'Pengunjung'} <small>{permission.status}</small></b>
                    <span>{permission.request_note || 'Tidak ada catatan'} · {permission.visitor_id}</span>
                    <i>{dateTime(permission.updated_at || permission.created_at)}</i>
                  </div>
                  <div className="permission-actions">
                    {permission.status !== 'approved' && <button type="button" className="permission-approve" disabled={busy} onClick={() => updatePermission(permission, 'approved')}>Terima</button>}
                    {permission.status !== 'rejected' && <button type="button" className="permission-reject" disabled={busy} onClick={() => updatePermission(permission, 'rejected')}>Tolak</button>}
                    {permission.status !== 'ignored' && <button type="button" className="permission-ignore" disabled={busy} onClick={() => updatePermission(permission, 'ignored')}>Ignore</button>}
                    {permission.status === 'approved' && <button type="button" className="permission-revoke" disabled={busy} onClick={() => updatePermission(permission, 'revoked')}>Batalkan perizinan</button>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="empty-note">Belum ada permintaan izin upload.</p>
        )}
      </div>
      {detail && (
        <Modal title="Detail item" close={() => setDetail(null)}>
          {first(detail, ['photo_url', 'image_url', 'storage_path']) && (
            <img className="detail-image" src={imageUrl(detail)} alt="Detail lampiran" />
          )}
          <dl className="detail-list">
            {Object.entries(detail).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </Modal>
      )}
    </section>
  )
}

function NotFound({ setPage }) {
  return (
    <section className="empty-state">
      <h2>Halaman tidak ditemukan</h2>
      <button type="button" className="btn dark" onClick={() => setPage('/')}>Kembali ke beranda</button>
    </section>
  )
}

function EntranceExperience({ photos, onDone }) {
  const [stage, setStage] = useState('welcome')
  const [seconds, setSeconds] = useState(5)
  const [countdownKey, setCountdownKey] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [closing, setClosing] = useState(false)
  const openingPhotos = useMemo(() => (photos.length ? photos : fallbackPhotos).slice(0, 9), [photos])
  const cinemaPhotos = useMemo(() => openingPhotos.slice(0, 6), [openingPhotos])
  const heroPhoto = cinemaPhotos[0] || fallbackPhotos[0]
  const rootRef = useRef(null)
  const sceneRef = useRef(null)
  const skipTimer = useRef(null)
  const timelineRef = useRef(null)
  const onDoneRef = useRef(onDone)

  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    openingPhotos.forEach(photo => {
      const url = imageUrl(photo)
      if (url) {
        const image = new Image()
        image.src = url
      }
    })
  }, [openingPhotos])

  useEffect(() => () => window.clearTimeout(skipTimer.current), [])

  useEffect(() => {
    if (stage !== 'welcome') return undefined
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const next = Math.max(0, 5 - Math.floor((Date.now() - startedAt) / 1000))
      setSeconds(next)
      if (next === 0) {
        window.clearInterval(timer)
        setStage('cinematic')
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [stage, countdownKey])

  const finishNow = () => {
    window.clearTimeout(skipTimer.current)
    timelineRef.current?.kill()
    timelineRef.current = null
    document.body.classList.remove('entrance-active')
    document.documentElement.classList.remove('entrance-active')
    const page = document.querySelector('.page')
    if (page) {
      page.style.opacity = ''
      page.style.transform = ''
    }
    onDoneRef.current()
  }

  useEffect(() => {
    if (stage !== 'cinematic') return undefined
    const root = rootRef.current
    const scene = sceneRef.current
    if (!root || !scene) return undefined

    let cancelled = false
    let fallbackTimer = null
    let frozenTargets = []
    const page = document.querySelector('.page')
    const revealTargets = page ? [page] : []
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    document.body.classList.add('entrance-active')
    document.documentElement.classList.add('entrance-active')

    if (reduced) {
      root.style.setProperty('--entrance-bg-alpha', '0')
      root.style.setProperty('--entrance-texture-opacity', '0')
      root.style.setProperty('--entrance-vignette-opacity', '0')
      scene.style.opacity = '0'
      if (page) page.style.opacity = '1'
      fallbackTimer = window.setTimeout(finishNow, 750)
    } else {
      import('gsap').then(({ gsap }) => {
        if (cancelled) return

        const width = window.innerWidth
        const height = window.innerHeight
        const mobile = width < 640
        const intro = scene.querySelector('.memory-intro')
        const photoWall = scene.querySelector('.memory-photo-wall')
        const photos = Array.from(scene.querySelectorAll('.memory-photo'))
        const theater = scene.querySelector('.memory-theater')
        const screen = scene.querySelector('.memory-screen')
        const filmPhoto = scene.querySelector('.memory-film-photo')
        const filmCaption = scene.querySelector('.memory-film-caption')
        const cinemaTitle = scene.querySelector('.memory-cinema-title')
        const flash = scene.querySelector('.memory-flash')
        frozenTargets = [intro, photoWall, ...photos, theater, screen, filmPhoto, filmCaption, cinemaTitle, flash].filter(Boolean)

        const baseRotations = [-8, 8, 12, -12, 5, -5]
        const directions = [
          { x: -1, y: -0.65, rotation: -35 },
          { x: 1, y: -0.7, rotation: 40 },
          { x: 1, y: 0.45, rotation: 45 },
          { x: -1, y: 0.5, rotation: -45 },
          { x: 0.55, y: 1, rotation: 30 },
          { x: -0.45, y: 1, rotation: -30 }
        ]
        const screenPositions = [
          { x: -115, y: -75, rotation: -3, scale: 0.72 },
          { x: -35, y: -75, rotation: 2, scale: 0.72 },
          { x: 45, y: -75, rotation: -2, scale: 0.72 },
          { x: 115, y: -75, rotation: 3, scale: 0.72 },
          { x: -65, y: 55, rotation: -2, scale: 0.72 },
          { x: 65, y: 55, rotation: 2, scale: 0.72 }
        ]

        let seed = Date.now() >>> 0
        const random = () => {
          seed += 0x6d2b79f5
          let value = seed
          value = Math.imul(value ^ value >>> 15, value | 1)
          value ^= value + Math.imul(value ^ value >>> 7, value | 61)
          return ((value ^ value >>> 14) >>> 0) / 4294967296
        }
        const trajectories = new Map()
        photos.forEach((element, index) => {
          const direction = directions[index % directions.length]
          trajectories.set(element, {
            x: Math.sign(direction.x) * (width * 0.62 + Math.abs(direction.x) * 260) * (0.9 + random() * 0.24),
            y: Math.sign(direction.y) * (height * 0.62 + Math.abs(direction.y) * 240) * (0.9 + random() * 0.24),
            rotation: direction.rotation + (random() - 0.5) * 26,
            scaleUp: 1.04 + random() * 0.4,
            scaleDown: 0.72 + random() * 0.2,
            blur: 1 + random() * 4,
            duration: 0.75 + random() * 0.35,
            entryX: direction.x * 180 * (0.8 + random() * 0.4),
            entryY: direction.y * 160 * (0.8 + random() * 0.4)
          })
        })
        const trajectory = (_, element) => trajectories.get(element)
        const screenTarget = index => screenPositions[index % screenPositions.length]

        gsap.set(root, {
          '--entrance-bg-alpha': 1,
          '--entrance-texture-opacity': 0.13,
          '--entrance-vignette-opacity': 1
        })
        if (page) gsap.set(page, { opacity: 0.55, scale: 1.025, transformOrigin: '50% 45%' })
        gsap.set(intro, { opacity: 1, y: 0 })
        gsap.set(photoWall, { opacity: 1, zIndex: 3 })
        gsap.set(photos, {
          opacity: 0,
          x: (index, element) => trajectory(index, element).entryX,
          y: (index, element) => trajectory(index, element).entryY,
          rotation: (index, element) => trajectory(index, element).rotation * 0.4,
          scale: 0.42,
          filter: 'blur(0px)'
        })
        gsap.set(theater, { opacity: 0 })
        gsap.set(screen, { opacity: 0, scale: 0.7, transformOrigin: '50% 50%' })
        gsap.set(filmPhoto, { scale: 1 })
        gsap.set(filmCaption, { opacity: 0, y: 18 })
        gsap.set(cinemaTitle, { opacity: 0, y: 20 })
        gsap.set(flash, { opacity: 0 })

        const timeline = gsap.timeline()
        timelineRef.current = timeline

        timeline
          .addLabel('assembly', 0)
          .to(photos, {
            opacity: 1,
            x: 0,
            y: 0,
            rotation: index => baseRotations[index % baseRotations.length],
            scale: 1,
            duration: 0.75,
            ease: 'power3.out',
            stagger: { each: 0.09, from: 'random' }
          }, 'assembly+=0.15')
          .to({}, { duration: 1.2 }, 'assembly')
          .addLabel('introExit', 2.2)
          .to(intro, { opacity: 0, y: -30, duration: 0.7, ease: 'power2.in' }, 'introExit')
          .addLabel('scatter', 2.65)
          .set(photoWall, { zIndex: 10 }, 'scatter')
          .to(photos, {
            x: (index, element) => trajectory(index, element).x,
            y: (index, element) => trajectory(index, element).y,
            rotation: (index, element) => trajectory(index, element).rotation,
            scale: (index, element) => trajectory(index, element).scaleUp,
            filter: (index, element) => `blur(${trajectory(index, element).blur.toFixed(1)}px)`,
            opacity: 0.95,
            duration: (index, element) => trajectory(index, element).duration,
            ease: 'power2.inOut',
            stagger: { each: mobile ? 0.03 : 0.05, from: 'random' }
          }, 'scatter')
          .to(root, {
            '--entrance-bg-alpha': 0,
            '--entrance-texture-opacity': 0,
            '--entrance-vignette-opacity': 0,
            duration: 2.2,
            ease: 'power1.inOut'
          }, 'scatter+=0.25')
          .to(revealTargets, { opacity: 1, scale: 1, duration: 2.4, ease: 'power2.out' }, 'scatter+=0.25')
          .addLabel('projection', 3.65)
          .to(theater, { opacity: 1, duration: 0.75, ease: 'power1.out' }, 'projection')
          .to(screen, { opacity: 1, scale: 1, duration: 1, ease: 'power2.out' }, 'projection+=0.1')
          .to(photos, {
            x: index => screenTarget(index).x,
            y: index => screenTarget(index).y,
            rotation: index => screenTarget(index).rotation,
            scale: index => screenTarget(index).scale,
            filter: 'blur(0px)',
            opacity: 1,
            duration: 0.9,
            ease: 'power3.inOut',
            stagger: { each: 0.04, from: 'random' }
          }, 'projection+=0.35')
          .to(filmCaption, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 'projection+=1.15')
          .to(filmPhoto, { scale: 1.08, duration: 2.4, ease: 'power1.inOut' }, 'projection+=1')
          .addLabel('title', 5.25)
          .to(cinemaTitle, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 'title')
          .to({}, { duration: 1.5 }, 'title')
          .addLabel('exit', 7.35)
          .to(photos, {
            opacity: 0,
            y: index => screenTarget(index).y + 30,
            scale: 0.55,
            duration: 0.55,
            ease: 'power2.in',
            stagger: { each: 0.03, from: 'random' }
          }, 'exit')
          .to(screen, { scale: 1.15, opacity: 0, duration: 1.05, ease: 'power2.in' }, 'exit+=0.15')
          .to(cinemaTitle, { opacity: 0, duration: 0.6, ease: 'power1.in' }, 'exit')
          .to(theater, { opacity: 0, duration: 1.1, ease: 'power1.inOut' }, 'exit+=0.25')
          .addLabel('flash', 8.05)
          .to(flash, { opacity: 0.92, duration: 0.22, ease: 'power2.out' }, 'flash')
          .to(flash, { opacity: 0, duration: 0.5, ease: 'power2.in' }, 'flash+=0.22')
          .to(root, { opacity: 0, duration: 0.55, ease: 'power1.inOut' }, 'flash+=0.35')
          .call(finishNow, null, 'flash+=0.95')
      }).catch(() => {
        if (cancelled) return
        root.style.setProperty('--entrance-bg-alpha', '0')
        root.style.setProperty('--entrance-texture-opacity', '0')
        root.style.setProperty('--entrance-vignette-opacity', '0')
        scene.style.opacity = '0'
        if (page) page.style.opacity = '1'
        fallbackTimer = window.setTimeout(finishNow, 700)
      })
    }

    return () => {
      cancelled = true
      window.clearTimeout(fallbackTimer)
      timelineRef.current?.kill()
      timelineRef.current = null
      document.body.classList.remove('entrance-active')
      document.documentElement.classList.remove('entrance-active')
      scene.style.opacity = ''
      frozenTargets.forEach(element => {
        element.style.transform = ''
        element.style.opacity = ''
        element.style.filter = ''
        element.style.zIndex = ''
      })
      root.style.removeProperty('--entrance-bg-alpha')
      root.style.removeProperty('--entrance-texture-opacity')
      root.style.removeProperty('--entrance-vignette-opacity')
      root.style.removeProperty('opacity')
      const currentPage = document.querySelector('.page')
      if (currentPage) {
        currentPage.style.opacity = ''
        currentPage.style.transform = ''
      }
    }
  }, [stage])

  const openNow = () => setStage('cinematic')
  const skip = () => {
    setClosing(true)
    window.clearTimeout(skipTimer.current)
    skipTimer.current = window.setTimeout(finishNow, 220)
  }

  return (
    <div ref={rootRef} className={`entrance-experience entrance-${stage} ${closing ? 'is-closing' : ''}`} role="dialog" aria-label="Membuka album kenangan RPL 2" aria-modal="true">
      {stage === 'welcome' ? (
        <section className="welcome-card" aria-labelledby="welcome-title">
          <span className="welcome-tape welcome-tape-top" />
          <span className="welcome-sticker">XII RPL 2</span>
          <p className="welcome-eyebrow">A memory invitation · 2025</p>
          <h1 id="welcome-title">HAI, ANAK-ANAK KAPLING!</h1>
          <p className="welcome-intro">Masih ingat semua cerita yang pernah kita buat bersama? Mulai dari hari-hari biasa di kelas, canda yang nggak ada habisnya, tugas yang datang silih berganti, sampai momen-momen kecil yang ternyata sekarang jadi kenangan.</p>
          <div className="welcome-caution"><strong>CAUTION! <span>— A LITTLE REMINDER</span></strong><p>Album ini mungkin mengandung dosis nostalgia yang cukup tinggi. Efek sampingnya meliputi senyum sendiri, tertawa mengingat masa lalu, dan keinginan untuk kembali ke masa-masa itu.</p></div>
          <p className="welcome-closing">Siapkan diri kalian. Album kenangan RPL 2 akan segera dibuka.</p>
          <div className="welcome-countdown"><div className="countdown-ring" style={{ '--progress': `${(5 - seconds) * 20}%` }}><b>{seconds}</b><small>detik</small></div><span>Album akan terbuka otomatis dalam...</span></div>
          <div className="welcome-actions"><button type="button" className="welcome-open" onClick={openNow}>OPEN NOW <span>↗</span></button><button type="button" className="welcome-wait" disabled={waiting} onClick={() => { setSeconds(5); setCountdownKey(value => value + 1); setWaiting(true) }} aria-label="Biarkan countdown berjalan dan nikmati undangan">{waiting ? 'WAITING...' : 'WAIT & ENJOY'}</button></div>
          <button type="button" className="entrance-skip" onClick={skip}>Skip intro</button>
        </section>
      ) : (
        <section ref={sceneRef} className="cinematic-stage memory-cinema" aria-label="Memory cinema RPL 2">
          <div className="memory-grain" />
          <div className="memory-intro"><small>RPL 2 · MEMORY ARCHIVE</small><h1>Our Little Universe.</h1></div>
          <div className="memory-photo-wall" aria-hidden="true">{cinemaPhotos.map((photo, index) => <div className={`memory-photo memory-photo-${index + 1}`} key={photo.id ?? photo.file ?? photo.storage_path ?? index}><div className="memory-picture"><img src={imageUrl(photo)} alt="" /></div><span>{photo.category || 'Kenangan'}</span></div>)}</div>
          <div className="memory-theater">
            <div className="memory-beam" />
            <div className="memory-screen">
              <div className="memory-film"><img className="memory-film-photo" src={imageUrl(heroPhoto)} alt="" /><span className="memory-film-grain" /><div className="memory-film-label">REEL 01 — RPL 2</div><div className="memory-film-caption"><small>NOW PLAYING</small><h2>Our Memories</h2></div></div>
              <span className="memory-strip left" />
              <span className="memory-strip right" />
            </div>
            <div className="memory-cinema-title"><p>A Story We Once Lived...</p></div>
          </div>
          <div className="memory-flash" />
          <button type="button" className="entrance-skip cinematic-skip" onClick={skip}>Skip intro</button>
        </section>
      )}
    </div>
  )
}

function OpeningReplay({ photos, onPlay }) {
  const photo = (photos.length ? photos : fallbackPhotos)[1] || fallbackPhotos[1]
  return (
    <button type="button" className="opening-replay" onClick={onPlay} aria-label="Putar kembali animasi pembuka" title="Putar kembali animasi pembuka">
      <img src={imageUrl(photo)} alt="" />
      <span aria-hidden="true">▶</span>
    </button>
  )
}

function App() {
  const [page, setPage] = useState(location.hash.slice(1) || '/')
  const [openingPhotos] = usePhotos()
  const [opening, setOpening] = useState(false)
  const [openingPlayed, setOpeningPlayed] = useState(false)
  const path = page.split('?')[0]
  const visitorName = useVisitorName(path)
  useVisitTracking(path)

  useEffect(() => {
    if (path.startsWith('/admin') || visitorName.open) return
    try {
      if (!sessionStorage.getItem('rpl2-opening-played')) setOpening(true)
      setOpeningPlayed(true)
    } catch {
      setOpening(true)
      setOpeningPlayed(true)
    }
  }, [path, visitorName.open])

  const finishOpening = () => {
    setOpening(false)
    try { sessionStorage.setItem('rpl2-opening-played', '1') } catch {}
  }

  const replayOpening = () => setOpening(true)

  useEffect(() => {
    const onHashChange = () => {
      setPage(location.hash.slice(1) || '/')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    addEventListener('hashchange', onHashChange)
    return () => removeEventListener('hashchange', onHashChange)
  }, [])

  const go = nextPage => {
    if (location.hash.slice(1) !== nextPage) location.hash = nextPage
    setPage(nextPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }


  const body = path === '/'
    ? <Home setPage={go} />
    : path === '/galeri'
      ? <Gallery />
      : path === '/template'
        ? <Suspense fallback={<section className="empty-state"><h2>Memuat template...</h2></section>}><LazyTemplate /></Suspense>
        : path === '/bulletin'
          ? <Bulletin />
          : path === '/admin/login'
            ? <Admin login />
            : path === '/admin'
              ? <Admin />
              : <NotFound setPage={go} />

  return (
    <>
      <Layout page={path} setPage={go}>{body}</Layout>
      {!path.startsWith('/admin') && !opening && openingPlayed && <OpeningReplay photos={openingPhotos} onPlay={replayOpening} />}
      {!path.startsWith('/admin') && opening && <EntranceExperience photos={openingPhotos} onDone={finishOpening} />}
      {visitorName.open && !path.startsWith('/admin') && (
        <VisitorNameDialog {...visitorName} />
      )}
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
