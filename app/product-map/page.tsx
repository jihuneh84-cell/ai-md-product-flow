'use client'

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'
import { PRODUCT_FLOW_ACCESS_MESSAGE, canUseProductFlow } from '@/lib/access'

const UI_FONT = 'Pretendard, "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

type Product = {
  id: string
  space: string
  category: string | null
  series_name: string | null
  tag_price: number | null
  price: number | null
  age_target: number | null
  image_url: string | null
  planning_image_url: string | null
  estimated_tag_price: number | null
  status: string | null
  current_stage: string | null
  launch_target_date: string | null
  source_type: string | null
  project_id: string | null
  external_code: string | null
  created_at?: string | null
}

type PlanningProject = {
  id: string
  name?: string | null
  title?: string | null
  category?: string | null
  space?: string | null
  product_category?: string | null
  product_type?: string | null
  target_date?: string | null
  launch_target_date?: string | null
  completed_step_ids?: any
  notes?: any
  files?: any
  created_at?: string | null
}

type PositionedProduct = Product & {
  mapX: number
  mapY: number
}

const spaces = ['전체', '침실', '거실', '주방', '서재', '키즈', '인테리어', '리빙소품']
const formSpaces = ['침실', '거실', '주방', '서재', '키즈', '인테리어', '리빙소품']
const directMapSpaces = ['서재', '키즈', '인테리어']

const categories: Record<string, string[]> = {
  거실: ['소파', '거실수납장', '스툴'],
  침실: ['침대', '매트리스', '협탁', '화장대', '옷장', '스툴'],
  주방: ['식탁', '식탁의자', '주방수납'],
  리빙소품: ['침구류', '러그', '수건', '조명'],
}

const statusOptions = ['진행중', '출시예정', '단종예정', '기획중']

const CARD_WIDTH = 170
const CARD_HEIGHT = 190
const CARD_GAP_X = 26
const CARD_GAP_Y = 26
const MIN_MAP_WIDTH = 760
const MAX_CARD_COLUMNS = 5
const DEFAULT_GRID_COLUMNS = 5

function isDirectMapSpace(space: string) {
  return directMapSpaces.includes(space)
}

function getDefaultCategory(space: string) {
  if (space === '거실') return '소파'
  if (space === '침실') return '침대'
  if (space === '주방') return '식탁'
  if (space === '리빙소품') return '침구류'
  return ''
}

function normalizeStatus(value: any) {
  const status = String(value || '').trim()
  if (status === '운영중' || status === '운영') return '진행중'
  if (status === '단종') return '단종예정'
  if (status === '출시예정') return '출시예정'
  if (status === '단종예정') return '단종예정'
  if (status === '기획중') return '기획중'
  return status || '진행중'
}

function parseNumber(value: any) {
  if (value === null || value === undefined || value === '') return null
  const cleaned = String(value).replace(/,/g, '').trim()
  const numberValue = Number(cleaned)
  return Number.isNaN(numberValue) ? null : numberValue
}

function parseExcelDate(value: any) {
  if (!value) return null

  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    if (!date) return null
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }

  const text = String(value).trim()
  const matched = text.match(/^(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/)

  if (matched) {
    return `${matched[1]}-${String(matched[2]).padStart(2, '0')}-${String(matched[3]).padStart(2, '0')}`
  }

  return null
}

function getStatusStyle(status: string | null) {
  switch (status) {
    case '진행중':
      return { border: 'border-blue-600', label: 'bg-blue-600 text-white', opacity: '' }
    case '출시예정':
      return { border: 'border-purple-600', label: 'bg-purple-600 text-white', opacity: '' }
    case '기획중':
      return { border: 'border-orange-500', label: 'bg-orange-500 text-white', opacity: '' }
    case '단종예정':
      return { border: 'border-gray-500', label: 'bg-gray-500 text-white', opacity: 'opacity-60 grayscale' }
    default:
      return { border: 'border-stone-300', label: 'bg-blue-600 text-white', opacity: '' }
  }
}

function formatPrice(value: number | null) {
  if (!value) return '-'
  return value.toLocaleString()
}

function getSourceLabel(source: string | null) {
  if (source === 'excel') return '엑셀'
  if (source === 'planning') return '기획연동'
  return '직접등록'
}

function parseJsonSafe(value: any) {
  if (!value) return value
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeStepIds(value: any): string[] {
  const parsed = parseJsonSafe(value)

  if (Array.isArray(parsed)) return parsed.map((item) => String(item))

  if (typeof parsed === 'string') {
    return parsed
      .replace(/[\[\]"]/g, '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function getObjectValue(value: any, keys: string[]) {
  const parsed = parseJsonSafe(value)
  if (!parsed || typeof parsed !== 'object') return null

  for (const key of keys) {
    if (parsed[key] !== undefined && parsed[key] !== null && String(parsed[key]).trim() !== '') {
      return parsed[key]
    }
  }

  return null
}

function getProjectExpectedTagPrice(project: PlanningProject) {
  const notes = parseJsonSafe(project.notes)
  const value = getObjectValue(notes, [
    '1-3_expected_tag_price',
    'expected_tag_price',
    'estimated_tag_price',
    'tag_price',
    '예상 TAG가',
    '예상TAG가',
  ])

  return parseNumber(value)
}

function findImageUrlFromFiles(project: PlanningProject) {
  const files = parseJsonSafe(project.files)
  if (!files || typeof files !== 'object') return null

  const stepFiles = [
    ...(Array.isArray(files['1-1']) ? files['1-1'] : []),
    ...(Array.isArray(files['market_research']) ? files['market_research'] : []),
    ...(Array.isArray(files['planning']) ? files['planning'] : []),
  ]

  const imageFile = stepFiles.find((file: any) => {
    const group = String(file?.fileGroup || file?.group || file?.type || '').toLowerCase()
    const name = String(file?.name || file?.fileName || file?.filename || file?.url || '').toLowerCase()
    return group.includes('sample') || group.includes('image') || name.match(/\.(png|jpg|jpeg|webp|gif)$/)
  })

  const fallbackFile = stepFiles.find((file: any) => {
    const url = file?.url || file?.publicUrl || file?.public_url || file?.file_url || file?.path
    return Boolean(url)
  })

  const selectedFile = imageFile || fallbackFile
  if (!selectedFile) return null

  return (
    selectedFile.url ||
    selectedFile.publicUrl ||
    selectedFile.public_url ||
    selectedFile.file_url ||
    selectedFile.image_url ||
    null
  )
}

function inferProjectSpaceAndCategory(project: PlanningProject) {
  const notes = parseJsonSafe(project.notes)
  const noteItem = String(getObjectValue(notes, ['1-1_item', 'item', 'space', '품목']) || '').trim()
  const noteSpecies = String(getObjectValue(notes, ['1-1_species', 'species', 'category', '품종']) || '').trim()

  if (noteItem && formSpaces.includes(noteItem)) {
    return {
      space: noteItem,
      category: isDirectMapSpace(noteItem) ? null : noteSpecies || getDefaultCategory(noteItem),
    }
  }

  const rawCategory = String(
    project.category || project.product_category || project.product_type || ''
  ).trim()
  const rawSpace = String(project.space || '').trim()
  const text = `${project.name || ''} ${project.title || ''} ${rawCategory}`

  if (rawSpace && formSpaces.includes(rawSpace)) {
    return {
      space: rawSpace,
      category: isDirectMapSpace(rawSpace) ? null : rawCategory || getDefaultCategory(rawSpace),
    }
  }

  const bedroomWords = ['침대', '매트리스', '협탁', '화장대', '옷장', '스툴']
  if (bedroomWords.some((word) => text.includes(word))) {
    const category = bedroomWords.find((word) => text.includes(word)) || '침대'
    return { space: '침실', category }
  }

  const livingWords = ['소파', '거실수납장', '스툴']
  if (livingWords.some((word) => text.includes(word))) {
    const category = text.includes('거실수납장') ? '거실수납장' : text.includes('스툴') ? '스툴' : '소파'
    return { space: '거실', category }
  }

  const kitchenWords = ['식탁', '식탁의자', '주방수납']
  if (kitchenWords.some((word) => text.includes(word))) {
    const category = kitchenWords.find((word) => text.includes(word)) || '식탁'
    return { space: '주방', category }
  }

  const livingGoodsWords = ['침구류', '러그', '수건', '조명']
  if (livingGoodsWords.some((word) => text.includes(word))) {
    const category = livingGoodsWords.find((word) => text.includes(word)) || '침구류'
    return { space: '리빙소품', category }
  }

  if (['서재', '키즈', '인테리어'].some((word) => text.includes(word))) {
    const space = ['서재', '키즈', '인테리어'].find((word) => text.includes(word)) || '인테리어'
    return { space, category: null }
  }

  return { space: '거실', category: '소파' }
}

function convertProjectToProduct(project: PlanningProject): Product | null {
  const completedStepIds = normalizeStepIds(project.completed_step_ids)
  const expectedTagPrice = getProjectExpectedTagPrice(project)

  if (!completedStepIds.includes('1-3')) return null
  if (completedStepIds.includes('4-1')) return null

  const { space, category } = inferProjectSpaceAndCategory(project)
  const planningImageUrl = findImageUrlFromFiles(project)
  const launchTargetDate = project.launch_target_date || project.target_date || null
  const seriesName = project.name || project.title || '기획 연동 상품'

  return {
    id: `planning-${project.id}`,
    space,
    category,
    series_name: seriesName,
    tag_price: expectedTagPrice,
    price: expectedTagPrice,
    age_target: 30,
    image_url: null,
    planning_image_url: planningImageUrl,
    estimated_tag_price: expectedTagPrice,
    status: '기획중',
    current_stage: '온라인 타겟 가격 설정 완료',
    launch_target_date: launchTargetDate,
    source_type: 'planning',
    project_id: project.id,
    external_code: '기획연동',
    created_at: project.created_at || null,
  }
}

function getDisplayImage(product: Product) {
  return product.image_url || product.planning_image_url || ''
}

function getDisplayPrice(product: Product) {
  return product.tag_price || product.estimated_tag_price || null
}

function getMapSize(productCount: number) {
  // 상품 수에 따라 맵 높이는 자동 증가하되, 기본 가로 5열 그리드로 고정합니다.
  // 저가 상품은 좌하단부터, 고가 상품은 우상단으로 올라가도록 배치합니다.
  const safeCount = Math.max(productCount, 1)
  const columns = DEFAULT_GRID_COLUMNS
  const rows = Math.max(1, Math.ceil(safeCount / columns))

  const leftPadding = 56
  const rightPadding = 56
  const topPadding = 96
  const bottomPadding = 96
  const cellWidth = CARD_WIDTH + CARD_GAP_X
  const cellHeight = CARD_HEIGHT + CARD_GAP_Y

  const width = Math.max(MIN_MAP_WIDTH, leftPadding + rightPadding + columns * cellWidth)
  const height = Math.max(720, topPadding + bottomPadding + rows * cellHeight)

  return { width, height, columns, rows, leftPadding, topPadding, bottomPadding, cellWidth, cellHeight }
}

function getPriceValue(product: Product) {
  return product.tag_price || product.estimated_tag_price || product.price || 0
}

function getNonOverlappingProducts(products: Product[], mapWidth: number, mapHeight: number): PositionedProduct[] {
  // 카테고리 내 등록 상품의 TAG가를 기준으로 저가 → 고가 순서로 정렬합니다.
  // 1) 기본 5열 그리드로 고정
  // 2) 좌하단부터 우측으로 5개씩 채움
  // 3) 다음 줄은 위로 올라가며 더 비싼 상품이 배치됨
  // 4) 결과적으로 좌하단 저가 → 우상단 고가 구조가 됩니다.
  const sorted = [...products].sort((a, b) => {
    const aPrice = getPriceValue(a)
    const bPrice = getPriceValue(b)

    if (aPrice !== bPrice) return aPrice - bPrice
    return String(a.series_name || '').localeCompare(String(b.series_name || ''), 'ko')
  })

  const columns = DEFAULT_GRID_COLUMNS
  const leftPadding = 56
  const bottomPadding = 96
  const cellWidth = CARD_WIDTH + CARD_GAP_X
  const cellHeight = CARD_HEIGHT + CARD_GAP_Y

  return sorted.map((product, index) => {
    const column = index % columns
    const rowFromBottom = Math.floor(index / columns)

    const x = leftPadding + column * cellWidth
    const y = mapHeight - bottomPadding - CARD_HEIGHT - rowFromBottom * cellHeight

    return {
      ...product,
      mapX: Math.round(x),
      mapY: Math.round(Math.max(96, y)),
    }
  })
}

export default function ProductMapPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [selectedSpace, setSelectedSpace] = useState('전체')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(true)
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [showRawData, setShowRawData] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [excelUploading, setExcelUploading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [onlyNoImage, setOnlyNoImage] = useState(false)
  const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null)

  const [excelMessage, setExcelMessage] = useState('')
  const [excelError, setExcelError] = useState('')

  const [form, setForm] = useState({
    space: '침실',
    category: '침대',
    series_name: '',
    tag_price: '',
    price: '',
    image_url: '',
    status: '진행중',
    current_stage: '운영상품',
    launch_target_date: '',
    external_code: '',
  })

  const [editForm, setEditForm] = useState({
    space: '',
    category: '',
    series_name: '',
    tag_price: '',
    price: '',
    image_url: '',
    status: '',
    current_stage: '',
    launch_target_date: '',
    external_code: '',
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_approved')
      .eq('id', user.id)
      .maybeSingle()

    if (!canUseProductFlow(user.email, profile)) {
      await supabase.auth.signOut()
      alert(PRODUCT_FLOW_ACCESS_MESSAGE)
      router.push('/login')
      return
    }

    const { data: productData, error: productError } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })

    if (productError) {
      alert(`상품 데이터를 불러오지 못했습니다: ${productError.message}`)
      return
    }

    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })

    if (projectError) {
      console.error('프로젝트 연동 조회 실패:', projectError)
      alert(`프로젝트 연동 데이터를 불러오지 못했습니다: ${projectError.message}`)
      setProducts(productData ?? [])
      return
    }

    const planningProducts = (projectData ?? [])
      .map((project) => convertProjectToProduct(project as PlanningProject))
      .filter((product): product is Product => Boolean(product))

    console.log('포트폴리오 연동 프로젝트 개수:', planningProducts.length, planningProducts)

    setProducts([...(productData ?? []), ...planningProducts])
  }

  const uploadProductImage = async (file: File) => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
    const filePath = `product-map/${fileName}`

    const { error } = await supabase.storage.from('product-images').upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    })

    if (error) throw new Error(error.message)

    const { data } = supabase.storage.from('product-images').getPublicUrl(filePath)
    return data.publicUrl
  }

  const uploadImageAndSetUrl = async (file: File, mode: 'create' | 'edit') => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.')
      return
    }

    try {
      setUploading(true)
      const publicUrl = await uploadProductImage(file)

      if (mode === 'create') {
        setForm((prev) => ({ ...prev, image_url: publicUrl }))
      } else {
        setEditForm((prev) => ({ ...prev, image_url: publicUrl }))
      }
    } catch (error: any) {
      alert(`이미지 업로드 실패: ${error.message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleCreateImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadImageAndSetUrl(file, 'create')
    e.target.value = ''
  }

  const handleEditImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadImageAndSetUrl(file, 'edit')
    e.target.value = ''
  }

  const handleCreateImageDrop = async (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const file = e.dataTransfer.files?.[0]
    if (!file) return
    await uploadImageAndSetUrl(file, 'create')
  }

  const handleEditImageDrop = async (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const file = e.dataTransfer.files?.[0]
    if (!file) return
    await uploadImageAndSetUrl(file, 'edit')
  }

  const handleDownloadTemplate = () => {
    const rows = [
      {
        품목: '침실',
        품종: '침대',
        시리즈명: '세린 패브릭 호텔형 수납침대',
        TAG가: 790000,
        상태: '진행중',
        현재단계: '운영상품',
        출시일: '2024-04-01',
        사방넷품번: '100102',
        이미지URL: '',
      },
      {
        품목: '키즈',
        품종: '',
        시리즈명: '키즈룸',
        TAG가: 699000,
        상태: '진행중',
        현재단계: '운영상품',
        출시일: '2026-08-01',
        사방넷품번: 'EM000002',
        이미지URL: '',
      },
    ]

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, '상품업로드양식')
    XLSX.writeFile(workbook, '포트폴리오_엑셀업로드_양식.xlsx')
  }

  const uploadExcelFile = async (file: File | null) => {
    setExcelMessage('')
    setExcelError('')

    if (!file) {
      setExcelError('파일이 선택되지 않았습니다.')
      return
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      setExcelError('엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.')
      return
    }

    try {
      setExcelUploading(true)
      setExcelMessage(`파일 선택됨: ${file.name}`)

      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]

      if (!sheetName) {
        setExcelError('엑셀 시트를 찾을 수 없습니다.')
        setExcelUploading(false)
        return
      }

      const sheet = workbook.Sheets[sheetName]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      const payload = rows
        .map((row) => {
          const tagPrice = parseNumber(row['TAG가'])
          const space = String(row['품목'] || '').trim()
          const category = String(row['품종'] || '').trim()
          const seriesName = String(row['시리즈명'] || '').trim()
          const imageUrl = String(row['이미지URL'] || row['이미지url'] || row['image_url'] || '').trim()
          const isDirectSpace = isDirectMapSpace(space)

          return {
            space,
            category: isDirectSpace ? null : category || null,
            series_name: seriesName,
            tag_price: tagPrice,
            price: tagPrice,
            age_target: 30,
            image_url: imageUrl || null,
            planning_image_url: null,
            estimated_tag_price: tagPrice,
            status: normalizeStatus(row['상태']),
            current_stage: String(row['현재단계'] || '운영상품').trim(),
            launch_target_date: parseExcelDate(row['출시일']),
            external_code: row['사방넷품번'] ? String(row['사방넷품번']).trim() : null,
            source_type: 'excel',
          }
        })
        .filter((item) => item.space && item.series_name && item.tag_price)

      if (payload.length === 0) {
        setExcelError('업로드 가능한 데이터가 없습니다.')
        setExcelUploading(false)
        return
      }

      const { error } = await supabase.from('products').insert(payload)

      if (error) {
        setExcelError(`Supabase 업로드 실패: ${error.message}`)
        setExcelUploading(false)
        return
      }

      setExcelMessage(`${payload.length}개 상품 업로드 완료`)
      await fetchProducts()
    } catch (error: any) {
      setExcelError(`엑셀 처리 실패: ${error.message}`)
    } finally {
      setExcelUploading(false)
    }
  }

  const handleExcelUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    await uploadExcelFile(e.target.files?.[0] ?? null)
    e.target.value = ''
  }

  const handleExcelDrop = async (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()

    await uploadExcelFile(e.dataTransfer.files?.[0] ?? null)
  }

  const handleSpaceClick = (space: string) => {
    setSelectedSpace(space)

    if (space === '침실') setSelectedCategory('침대')
    else if (space === '거실') setSelectedCategory('소파')
    else if (space === '주방') setSelectedCategory('식탁')
    else setSelectedCategory(null)
  }

  const handleFormSpaceChange = (space: string) => {
    setForm((prev) => ({
      ...prev,
      space,
      category: getDefaultCategory(space),
    }))
  }

  const handleEditSpaceChange = (space: string) => {
    setEditForm((prev) => ({
      ...prev,
      space,
      category: getDefaultCategory(space),
    }))
  }

  const handleCreateProduct = async () => {
    if (!form.series_name.trim()) return alert('시리즈명을 입력해주세요.')
    if (!form.tag_price.trim()) return alert('TAG가를 입력해주세요.')

    setLoading(true)

    const tagPrice = Number(form.tag_price)
    const isDirectSpace = isDirectMapSpace(form.space)

    const payload = {
      space: form.space,
      category: isDirectSpace ? null : form.category,
      series_name: form.series_name.trim(),
      tag_price: tagPrice,
      price: Number(form.price || form.tag_price),
      age_target: 30,
      image_url: form.image_url || null,
      planning_image_url: null,
      estimated_tag_price: tagPrice,
      status: form.status,
      current_stage: form.current_stage || '운영상품',
      launch_target_date: form.launch_target_date || null,
      external_code: form.external_code.trim() || null,
      source_type: 'manual',
    }

    const { error } = await supabase.from('products').insert(payload)

    setLoading(false)

    if (error) return alert(`등록 실패: ${error.message}`)

    setForm({
      space: '침실',
      category: '침대',
      series_name: '',
      tag_price: '',
      price: '',
      image_url: '',
      status: '진행중',
      current_stage: '운영상품',
      launch_target_date: '',
      external_code: '',
    })

    setShowForm(false)
    fetchProducts()
  }

  const startEdit = (product: Product) => {
    setEditingId(product.id)
    setEditForm({
      space: product.space || '침실',
      category: product.category || getDefaultCategory(product.space || '침실'),
      series_name: product.series_name || '',
      tag_price: product.tag_price ? String(product.tag_price) : '',
      price: product.price ? String(product.price) : '',
      image_url: product.image_url || product.planning_image_url || '',
      status: product.status || '진행중',
      current_stage: product.current_stage || '운영상품',
      launch_target_date: product.launch_target_date || '',
      external_code: product.external_code || '',
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({
      space: '',
      category: '',
      series_name: '',
      tag_price: '',
      price: '',
      image_url: '',
      status: '',
      current_stage: '',
      launch_target_date: '',
      external_code: '',
    })
  }

  const saveEdit = async (id: string) => {
    if (!editForm.series_name.trim()) return alert('시리즈명을 입력해주세요.')

    const price = Number(editForm.price || editForm.tag_price || 0)
    const tagPrice = editForm.tag_price ? Number(editForm.tag_price) : null
    const isDirectSpace = isDirectMapSpace(editForm.space)

    const payload = {
      space: editForm.space,
      category: isDirectSpace ? null : editForm.category,
      series_name: editForm.series_name.trim(),
      tag_price: tagPrice,
      price,
      age_target: 30,
      image_url: editForm.image_url || null,
      estimated_tag_price: tagPrice,
      status: editForm.status,
      current_stage: editForm.current_stage || '운영상품',
      launch_target_date: editForm.launch_target_date || null,
      external_code: editForm.external_code.trim() || null,
    }

    const { error } = await supabase.from('products').update(payload).eq('id', id)

    if (error) return alert(`수정 실패: ${error.message}`)

    cancelEdit()
    fetchProducts()
  }

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (onlyNoImage && getDisplayImage(product)) return false
      if (selectedSpace !== '전체' && product.space !== selectedSpace) return false

      if (
        selectedSpace !== '전체' &&
        !isDirectMapSpace(selectedSpace) &&
        selectedCategory &&
        product.category !== selectedCategory
      ) {
        return false
      }

      return true
    })
  }, [products, selectedSpace, selectedCategory, onlyNoImage])

  const mapSize = useMemo(() => getMapSize(filteredProducts.length), [filteredProducts.length])

  const positionedProducts = useMemo(() => {
    return getNonOverlappingProducts(filteredProducts, mapSize.width, mapSize.height)
  }, [filteredProducts, mapSize])

  const noImageCount = products.filter((product) => !getDisplayImage(product)).length

  return (
    <div style={{ fontFamily: UI_FONT }} className="min-h-screen bg-[#f6f3ee] p-6 text-[15px] font-semibold text-stone-950 antialiased">
      <div className="mb-4 rounded-3xl border border-stone-300 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-black tracking-[0.18em] text-blue-600">PORTFOLIO</p>
            <h1 className="mt-1 text-4xl font-black tracking-tight text-stone-950">포트폴리오</h1>
            <p className="mt-1 text-[15px] text-stone-700">
              운영상품과 기획중 상품을 통합 관리하는 포트폴리오입니다.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="rounded-xl bg-stone-100 px-4 py-2 text-[15px] font-black text-stone-700 hover:bg-stone-200"
            >
              홈
            </button>

            <button
              type="button"
              onClick={() => setShowUploadPanel((prev) => !prev)}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-[15px] font-black hover:bg-stone-100"
            >
              {showUploadPanel ? '업로드 접기' : '업로드 열기'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-2xl border border-stone-300 bg-[#f8fafc] px-4 py-3">
            <span className="text-[14px] font-extrabold text-stone-700">전체</span>
            <span className="ml-2 text-[15px] font-black text-stone-950">{products.length}</span>
          </div>
          <div className="rounded-2xl border border-stone-300 bg-[#f8fafc] px-4 py-3">
            <span className="text-[14px] font-extrabold text-stone-700">표시</span>
            <span className="ml-2 text-[15px] font-black text-stone-950">{filteredProducts.length}</span>
          </div>
          <div className="rounded-2xl border border-stone-300 bg-[#f8fafc] px-4 py-3">
            <span className="text-[14px] font-extrabold text-stone-700">이미지 없음</span>
            <span className="ml-2 text-[15px] font-black text-stone-950">{noImageCount}</span>
          </div>
          <div className="rounded-2xl border border-stone-300 bg-[#f8fafc] px-4 py-3">
            <span className="text-[14px] font-extrabold text-stone-700">공간</span>
            <span className="ml-2 text-[15px] font-black text-stone-950">{selectedSpace}</span>
          </div>
        </div>
      </div>

      {showUploadPanel && (
        <div className="mb-5 rounded-3xl border border-stone-300 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-stone-300 bg-blue-600 px-4 py-3 text-white">
            <div className="font-bold">엑셀 업로드</div>
            <div className="text-[13px] text-stone-300">
              품목 / 품종 / 시리즈명 / TAG가 / 상태 / 현재단계 / 출시일 / 사방넷품번 / 이미지URL
            </div>
          </div>

          <div className="p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-[15px] font-black hover:bg-stone-100"
              >
                엑셀 양식 다운로드
              </button>

              <button
                type="button"
                onClick={() => setOnlyNoImage((prev) => !prev)}
                className={`rounded-xl border border-stone-300 px-4 py-2 text-[15px] font-black ${
                  onlyNoImage ? 'bg-blue-600 text-white' : 'bg-white text-stone-900 hover:bg-stone-100'
                }`}
              >
                {onlyNoImage ? '전체 상품 보기' : '이미지 없는 상품만 보기'}
              </button>
            </div>

            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleExcelDrop}
              className={`block cursor-pointer rounded-2xl border-2 border-dashed border-blue-300 bg-white p-6 text-center text-[15px] transition ${
                excelUploading ? 'pointer-events-none opacity-50' : 'hover:bg-stone-100'
              }`}
            >
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelUpload}
                disabled={excelUploading}
                className="hidden"
              />
              <div className="font-bold">엑셀 파일을 클릭하거나 여기로 드래그하세요</div>
              <div className="mt-1 text-[13px] text-stone-700">.xlsx / .xls 파일 지원</div>
            </label>

            {excelUploading && <div className="mt-2 text-[15px] text-blue-600">엑셀 업로드 처리 중...</div>}
            {excelMessage && <div className="mt-2 text-[15px] text-green-700">{excelMessage}</div>}
            {excelError && <div className="mt-2 text-[15px] text-red-600">{excelError}</div>}
          </div>
        </div>
      )}

      {showUploadPanel && showForm && (
        <div className="mb-6 rounded-3xl border border-stone-300 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-stone-300 bg-blue-600 px-4 py-3 text-white">
            <div className="font-bold">상품 단건 등록</div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-[13px] font-extrabold">품목/공간</label>
              <select
                value={form.space}
                onChange={(e) => handleFormSpaceChange(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-[15px]"
              >
                {formSpaces.map((space) => (
                  <option key={space} value={space}>{space}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-extrabold">품종/카테고리</label>
              <select
                value={form.category}
                disabled={isDirectMapSpace(form.space)}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-[15px] disabled:bg-stone-200"
              >
                {isDirectMapSpace(form.space) ? (
                  <option value="">카테고리 없음</option>
                ) : (
                  categories[form.space]?.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-extrabold">시리즈명</label>
              <input
                value={form.series_name}
                onChange={(e) => setForm((prev) => ({ ...prev, series_name: e.target.value }))}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-[15px]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-extrabold">사방넷품번</label>
              <input
                value={form.external_code}
                onChange={(e) => setForm((prev) => ({ ...prev, external_code: e.target.value }))}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-[15px]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-extrabold">TAG가</label>
              <input
                value={form.tag_price}
                onChange={(e) => setForm((prev) => ({ ...prev, tag_price: e.target.value }))}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-[15px]"
                type="number"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-extrabold">맵 기준 가격</label>
              <input
                value={form.price}
                onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-[15px]"
                placeholder="미입력 시 TAG가"
                type="number"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-extrabold">상태</label>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-[15px]"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-extrabold">현재단계</label>
              <input
                value={form.current_stage}
                onChange={(e) => setForm((prev) => ({ ...prev, current_stage: e.target.value }))}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-[15px]"
                placeholder="운영상품"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-extrabold">출시일/희망일</label>
              <input
                value={form.launch_target_date}
                onChange={(e) => setForm((prev) => ({ ...prev, launch_target_date: e.target.value }))}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-[15px]"
                type="date"
              />
            </div>

            <div className="md:col-span-3">
              <div className="mb-1 block text-[13px] font-extrabold">상품 이미지 파일 첨부</div>
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleCreateImageDrop}
                className={`block cursor-pointer rounded-2xl border-2 border-dashed border-blue-300 bg-white p-5 text-center text-[15px] transition ${
                  uploading ? 'pointer-events-none opacity-50' : 'hover:bg-stone-100'
                }`}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCreateImageChange}
                  className="hidden"
                />
                <div className="font-bold">이미지를 클릭하거나 여기로 드래그하세요</div>
                <div className="mt-1 text-[13px] text-stone-700">JPG / PNG / WEBP 등 이미지 파일 지원</div>
              </label>
              {form.image_url && (
                <div className="mt-2 flex items-center gap-3 border border-stone-300 bg-white p-2">
                  <img src={form.image_url} alt="등록 이미지 미리보기" className="h-16 w-16 object-contain" />
                  <div className="text-[13px] font-extrabold text-green-700">이미지 업로드 완료</div>
                </div>
              )}
            </div>

            <div className="md:col-span-4 flex justify-end gap-2 border-t border-stone-300 pt-4">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-[15px] hover:bg-stone-100"
              >
                취소
              </button>
              <button
                onClick={handleCreateProduct}
                disabled={loading || uploading}
                className="rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-[15px] font-black text-white disabled:opacity-50"
              >
                {loading ? '등록 중...' : '등록하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {spaces.map((space) => (
          <button
            key={space}
            onClick={() => handleSpaceClick(space)}
            className={`rounded-xl border border-stone-300 px-4 py-2 text-[15px] font-black ${
              selectedSpace === space ? 'bg-blue-600 text-white' : 'bg-white text-stone-900 hover:bg-stone-100'
            }`}
          >
            {space}
          </button>
        ))}
      </div>

      <div className="mb-8 flex gap-4">
        {selectedSpace !== '전체' && !isDirectMapSpace(selectedSpace) && (
          <aside className="w-44 shrink-0 overflow-hidden rounded-3xl border border-stone-300 bg-white shadow-sm">
            <div className="border-b border-stone-300 bg-blue-600 px-3 py-2 text-[15px] font-extrabold text-white">
              카테고리
            </div>
            <div className="p-2">
              {categories[selectedSpace]?.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`mb-1 block w-full border border-stone-300 px-3 py-2 text-left text-[15px] ${
                    selectedCategory === category ? 'bg-blue-600 font-bold text-white' : 'bg-white hover:bg-stone-100'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </aside>
        )}

        <section className="h-[780px] flex-1 overflow-auto rounded-3xl border border-stone-300 bg-white shadow-sm">
          <div
            className="relative"
            style={{
              width: `${mapSize.width}px`,
              height: `${mapSize.height}px`,
            }}
          >
            <div className="sticky left-0 top-0 z-30 inline-block border-b border-r border-stone-300 bg-white px-3 py-2 text-[13px] font-extrabold">
              상품 포지션 · 5열 그리드 / 좌하단 저가 → 우상단 고가
            </div>

            <div className="absolute right-12 top-10 z-10 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-black text-red-700">
              HIGH PRICE · 우상단 고가
            </div>

            <div className="absolute bottom-6 right-12 z-10 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-black text-blue-700">
              LOW PRICE · 좌하단 저가
            </div>

            <div className="absolute left-0 top-16 z-10 border-b border-r border-stone-300 bg-white px-3 py-2 text-[13px] font-extrabold">
              ↑ 고가
            </div>

            <div className="absolute bottom-0 left-0 z-10 border-r border-t border-stone-300 bg-white px-3 py-2 text-[13px] font-extrabold">
              ↓ 저가
            </div>

            <div className="absolute inset-0 bg-[linear-gradient(to_right,#eeeeee_1px,transparent_1px),linear-gradient(to_bottom,#eeeeee_1px,transparent_1px)] bg-[size:70px_70px]" />

            {positionedProducts.length === 0 && (
              <div className="absolute inset-0 z-20 flex items-center justify-center text-[15px] text-stone-700">
                표시할 상품이 없습니다.
              </div>
            )}

            {positionedProducts.map((product) => {
              const style = getStatusStyle(product.status)
              const displayImage = getDisplayImage(product)
              const displayPrice = getDisplayPrice(product)

              return (
                <div
                  key={product.id}
                  className={`absolute z-20 border-2 bg-white ${style.border} ${style.opacity}`}
                  style={{
                    width: `${CARD_WIDTH}px`,
                    height: `${CARD_HEIGHT}px`,
                    left: `${product.mapX}px`,
                    top: `${product.mapY}px`,
                  }}
                >
                  <div className="flex items-center justify-between border-b border-stone-300">
                    <span className={`px-2 py-1 text-[11px] font-bold ${style.label}`}>
                      {product.status || '-'}
                    </span>
                    <span className="px-2 text-[10px] text-stone-700">
                      {product.current_stage || '운영상품'}
                    </span>
                  </div>

                  <div className="border-b border-stone-300 bg-white p-2">
                    {displayImage ? (
                      <button
                        type="button"
                        onClick={() => setPreviewImage({ src: displayImage, title: product.series_name || '상품 이미지' })}
                        className="group relative block h-16 w-full overflow-hidden bg-white"
                        title="이미지 크게 보기"
                      >
                        <img
                          src={displayImage}
                          alt={product.series_name || '상품 이미지'}
                          className="h-16 w-full object-contain transition-transform duration-150 group-hover:scale-105"
                        />
                        <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-black text-white opacity-0 transition-opacity group-hover:opacity-100">
                          확대
                        </span>
                      </button>
                    ) : (
                      <div className="flex h-20 w-full items-center justify-center bg-stone-100 text-[13px] text-stone-600">
                        이미지 없음
                      </div>
                    )}
                  </div>

                  <div className="p-2">
                    <div className="truncate text-[15px] font-extrabold">{product.series_name || '-'}</div>
                    <div className="mt-1 text-[13px]">
                      TAG {displayPrice ? formatPrice(displayPrice) : '미정'}
                    </div>
                    <div className="text-[11px] text-stone-700">품번 {product.external_code || '-'}</div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-stone-700">
                      <span>{product.category || product.space}</span>
                      <span>{product.launch_target_date || '희망일 없음'}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-stone-300 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-stone-300 bg-blue-600 px-4 py-3 text-white">
          <div>
            <h2 className="text-lg font-bold">Raw Data</h2>
            <p className="text-[13px] text-stone-300">
              원본 데이터는 기본 접기 상태입니다. 필요할 때만 열어서 수정하세요.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowRawData((prev) => !prev)} className="border border-white px-3 py-1 text-[13px] font-black hover:bg-white hover:text-stone-900">
              {showRawData ? 'Raw Data 접기' : 'Raw Data 열기'}
            </button>
            <button type="button" onClick={fetchProducts} className="border border-white px-3 py-1 text-[13px] hover:bg-white hover:text-stone-900">
              새로고침
            </button>
          </div>
        </div>

        {showRawData && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-stone-300 bg-stone-100 text-left">
                <th className="w-24 border-r border-stone-300 px-3 py-2">이미지</th>
                <th className="border-r border-stone-300 px-3 py-2">품목</th>
                <th className="border-r border-stone-300 px-3 py-2">품종</th>
                <th className="border-r border-stone-300 px-3 py-2">시리즈명</th>
                <th className="border-r border-stone-300 px-3 py-2">TAG가</th>
                <th className="border-r border-stone-300 px-3 py-2">맵가격</th>
                <th className="border-r border-stone-300 px-3 py-2">상태</th>
                <th className="border-r border-stone-300 px-3 py-2">현재단계</th>
                <th className="border-r border-stone-300 px-3 py-2">출시일</th>
                <th className="border-r border-stone-300 px-3 py-2">사방넷품번</th>
                <th className="border-r border-stone-300 px-3 py-2">이미지URL</th>
                <th className="border-r border-stone-300 px-3 py-2">구분</th>
                <th className="px-3 py-2">관리</th>
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map((product) => {
                const isEditing = editingId === product.id
                const displayImage = getDisplayImage(product)

                return (
                  <tr key={product.id} className="border-b border-stone-300 align-top">
                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <div>
                          {editForm.image_url && (
                            <img
                              src={editForm.image_url}
                              alt="수정 이미지"
                              className="mb-2 h-16 w-16 border border-stone-300 object-contain"
                            />
                          )}
                          <label
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleEditImageDrop}
                            className={`block w-32 cursor-pointer border border-dashed border-stone-300 bg-white p-2 text-center text-[13px] ${
                              uploading ? 'pointer-events-none opacity-50' : 'hover:bg-stone-100'
                            }`}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleEditImageChange}
                              className="hidden"
                            />
                            클릭/드래그
                          </label>
                        </div>
                      ) : displayImage ? (
                        <img src={displayImage} alt="" className="h-16 w-16 border border-stone-300 object-contain" />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center border border-stone-300 text-[13px] text-stone-600">
                          없음
                        </div>
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <select
                          value={editForm.space}
                          onChange={(e) => handleEditSpaceChange(e.target.value)}
                          className="w-24 border border-stone-300 px-2 py-1"
                        >
                          {formSpaces.map((space) => (
                            <option key={space} value={space}>{space}</option>
                          ))}
                        </select>
                      ) : (
                        product.space
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <select
                          value={editForm.category}
                          disabled={isDirectMapSpace(editForm.space)}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
                          className="w-28 border border-stone-300 px-2 py-1 disabled:bg-stone-200"
                        >
                          {isDirectMapSpace(editForm.space) ? (
                            <option value="">없음</option>
                          ) : (
                            categories[editForm.space]?.map((category) => (
                              <option key={category} value={category}>{category}</option>
                            ))
                          )}
                        </select>
                      ) : (
                        product.category || '-'
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.series_name}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, series_name: e.target.value }))}
                          className="w-40 border border-stone-300 px-2 py-1"
                        />
                      ) : (
                        product.series_name
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.tag_price}
                          type="number"
                          onChange={(e) => setEditForm((prev) => ({ ...prev, tag_price: e.target.value }))}
                          className="w-28 border border-stone-300 px-2 py-1"
                        />
                      ) : (
                        formatPrice(product.tag_price || product.estimated_tag_price)
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.price}
                          type="number"
                          onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))}
                          className="w-28 border border-stone-300 px-2 py-1"
                        />
                      ) : (
                        formatPrice(product.price)
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <select
                          value={editForm.status}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                          className="w-28 border border-stone-300 px-2 py-1"
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`inline-block px-2 py-1 text-[13px] font-extrabold ${getStatusStyle(product.status).label}`}>
                          {product.status}
                        </span>
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.current_stage}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, current_stage: e.target.value }))}
                          className="w-36 border border-stone-300 px-2 py-1"
                        />
                      ) : (
                        product.current_stage || '-'
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.launch_target_date}
                          type="date"
                          onChange={(e) => setEditForm((prev) => ({ ...prev, launch_target_date: e.target.value }))}
                          className="w-36 border border-stone-300 px-2 py-1"
                        />
                      ) : (
                        product.launch_target_date || '-'
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.external_code}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, external_code: e.target.value }))}
                          className="w-28 border border-stone-300 px-2 py-1"
                        />
                      ) : (
                        product.external_code || '-'
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2">
                      {isEditing ? (
                        <input
                          value={editForm.image_url}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, image_url: e.target.value }))}
                          className="w-56 border border-stone-300 px-2 py-1"
                          placeholder="https://..."
                        />
                      ) : (
                        <span className="block w-56 truncate text-[13px] text-stone-700">
                          {displayImage || '-'}
                        </span>
                      )}
                    </td>

                    <td className="border-r border-stone-300 px-3 py-2 text-[13px] text-stone-700">
                      {getSourceLabel(product.source_type)}
                    </td>

                    <td className="px-3 py-2">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => saveEdit(product.id)}
                            disabled={uploading}
                            className="border border-stone-300 bg-blue-600 px-2 py-1 text-[13px] text-white disabled:opacity-50"
                          >
                            저장
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="border border-stone-300 bg-white px-2 py-1 text-[13px] hover:bg-stone-100"
                          >
                            취소
                          </button>
                        </div>
                      ) : product.source_type === 'planning' ? (
                        <span className="inline-block border border-stone-300 bg-stone-100 px-2 py-1 text-[13px] text-stone-700">
                          연동상품
                        </span>
                      ) : (
                        <button
                          onClick={() => startEdit(product)}
                          className="border border-stone-300 bg-white px-2 py-1 text-[13px] hover:bg-stone-100"
                        >
                          수정
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-3 py-8 text-center text-stone-700">
                    표시할 상품이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {previewImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-5xl rounded-3xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-black tracking-[0.18em] text-blue-600">IMAGE PREVIEW</p>
                <h2 className="mt-1 line-clamp-1 text-2xl font-black text-stone-950">{previewImage.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="rounded-xl bg-stone-100 px-4 py-2 text-[15px] font-black text-stone-800 hover:bg-stone-200"
              >
                닫기
              </button>
            </div>

            <div className="flex max-h-[76vh] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <img
                src={previewImage.src}
                alt={previewImage.title}
                className="max-h-[72vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
