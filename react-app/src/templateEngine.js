const imageCache = new Map()
let renderSequence = 0

const loadImage = url => {
  if (!url) return Promise.resolve(null)
  if (imageCache.has(url)) return imageCache.get(url)
  const promise = new Promise(resolve => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
  imageCache.set(url, promise)
  return promise
}

const fitImage = async (ctx, url, x, y, width, height, options = {}) => {
  const image = await loadImage(url)
  if (!image || (options.isCurrent && !options.isCurrent())) return
  const zoom = options.zoom || 1
  const ratio = Math.max(width / image.width, height / image.height) * zoom
  const drawWidth = image.width * ratio
  const drawHeight = image.height * ratio
  const offsetX = options.offsetX || 0
  const offsetY = options.offsetY || 0
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.filter = options.filter || 'none'
  ctx.translate(x + width / 2, y + height / 2)
  ctx.rotate((options.rotation || 0) * Math.PI / 180)
  ctx.drawImage(image, -drawWidth / 2 + offsetX, -drawHeight / 2 + offsetY, drawWidth, drawHeight)
  ctx.restore()
}

const drawGrid = async (ctx, urls, columns, rows, gap, width, height, options) => {
  const cellWidth = (width - gap * (columns + 1)) / columns
  const cellHeight = (height - gap * (rows + 1)) / rows
  for (let index = 0; index < columns * rows; index += 1) {
    if (!urls[index]) continue
    const column = index % columns
    const row = Math.floor(index / columns)
    await fitImage(ctx, urls[index], gap + column * (cellWidth + gap), gap + row * (cellHeight + gap), cellWidth, cellHeight, options)
  }
}

export async function renderTemplate(canvas, config, urls) {
  if (!canvas) return
  const currentSequence = ++renderSequence
  const isCurrent = () => currentSequence === renderSequence
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const width = canvas.width
  const height = canvas.height
  const gap = Number(config.padding) || 0
  const photos = urls.filter(Boolean)
  const filters = {
    none: 'none',
    vintage: 'sepia(.45) saturate(1.25)',
    sepia: 'sepia(1)',
    bw: 'grayscale(1)',
    warm: 'saturate(1.35) sepia(.2)',
    fade: 'brightness(1.12) contrast(.82)'
  }
  const options = {
    filter: filters[config.filter] || 'none',
    zoom: (Number(config.zoom) || 100) / 100,
    rotation: Number(config.rotation) || 0,
    offsetX: width * (Number(config.photoX) || 0) / 100,
    offsetY: height * (Number(config.photoY) || 0) / 100,
    isCurrent
  }

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = config.background || '#eee5d3'
  ctx.fillRect(0, 0, width, height)

  if (config.kind === 'collage') {
    const layout = config.layout || '2x2'
    const sizes = { '2x2': [2, 2], '3x3': [3, 3], '2x3': [2, 3], '4x1': [4, 1], '1x4': [1, 4] }
    const [columns, rows] = sizes[layout] || sizes['2x2']
    await drawGrid(ctx, photos, columns, rows, gap, width, height, options)
  } else if (config.kind === 'frame') {
    ctx.fillStyle = config.frameColor || '#333333'
    ctx.fillRect(0, 0, width, height)
    const border = Number(config.borderWidth) || 15
    await fitImage(ctx, photos[0], border, border, width - border * 2, width * .75, options)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(config.caption || '', width / 2, height - border)
  } else if (config.kind === 'polaroid') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.rotate((Number(config.rotation) || 0) * Math.PI / 180)
    ctx.translate(-width / 2, -height / 2)
    await fitImage(ctx, photos[0], 30, 30, width - 60, height * .62, { ...options, rotation: 0 })
    ctx.fillStyle = '#333333'
    ctx.font = '18px serif'
    ctx.textAlign = 'left'
    ctx.fillText(config.caption || 'XII RPL 2', 42, height - 55)
    ctx.restore()
  } else if (config.kind === 'filmstrip') {
    ctx.fillStyle = '#171515'
    ctx.fillRect(0, 0, width, height)
    await drawGrid(ctx, photos, 4, 1, gap, width, height - 80, options)
    ctx.fillStyle = '#e7d7b9'
    ctx.font = '20px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(config.caption || 'XII RPL 2', width / 2, height - 25)
  } else if (config.kind === 'photobooth') {
    const side = Math.min(width - gap * 2, (height - gap * 5) / 4)
    for (let index = 0; index < 4; index += 1) {
      const y = gap + index * (side + gap)
      ctx.fillStyle = '#fffdf8'
      ctx.fillRect((width - side) / 2, y, side, side)
      await fitImage(ctx, photos[index], (width - side) / 2, y, side, side, options)
    }
    ctx.fillStyle = '#a4432f'
    ctx.font = 'bold 20px serif'
    ctx.textAlign = 'center'
    ctx.fillText(config.caption || 'XII RPL 2', width / 2, height - 12)
  } else if (config.kind === 'contact') {
    await drawGrid(ctx, photos, 3, 3, gap, width, height - 36, options)
    ctx.fillStyle = '#211c18'
    ctx.font = '22px serif'
    ctx.textAlign = 'center'
    ctx.fillText(config.caption || 'XII RPL 2', width / 2, height - 10)
  } else {
    await fitImage(ctx, photos[0], gap, gap + 35, width - gap * 2, height * .62, options)
    ctx.fillStyle = '#211c18'
    ctx.font = '24px serif'
    ctx.textAlign = 'center'
    ctx.fillText(config.caption || 'XII RPL 2', width / 2, height - 30)
  }

  if (config.sticker && config.sticker !== 'none') {
    const stickers = { heart: '♥', star: '★', camera: '●', tape: '▰', date: new Date().toLocaleDateString('id-ID') }
    ctx.save()
    ctx.translate(width * (Number(config.stickerX ?? 90) / 100), height * (Number(config.stickerY ?? 10) / 100))
    ctx.rotate((Number(config.stickerRotation) || 0) * Math.PI / 180)
    ctx.fillStyle = config.sticker === 'heart' ? '#a4432f' : '#c28a35'
    ctx.font = `${Number(config.stickerSize ?? 100) * .42}px serif`
    ctx.textAlign = 'center'
    ctx.fillText(stickers[config.sticker] || '', 0, 0)
    ctx.restore()
  }
}

export function downloadCanvas(canvas, filename) {
  if (!canvas) return
  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}
