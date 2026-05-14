export const PRODUCT_FLOW_ALLOWED_EMAILS = ['jhhwang1@emons.co.kr']

export const PRODUCT_FLOW_ACCESS_MESSAGE = '상품개발 플로우는 현재 지정된 계정만 접속할 수 있습니다.'

export const normalizeEmail = (email?: string | null) => (email || '').trim().toLowerCase()

type ProductFlowProfile = {
  role?: string | null
  is_admin?: boolean | null
  is_approved?: boolean | null
}

export const isProductFlowAdmin = (profile?: ProductFlowProfile | null) => {
  const role = String(profile?.role || '').trim().toLowerCase()
  return Boolean(profile?.is_admin || role === 'admin' || role === '관리자')
}

export const canUseProductFlow = (email?: string | null, profile?: ProductFlowProfile | null) => {
  return (
    PRODUCT_FLOW_ALLOWED_EMAILS.includes(normalizeEmail(email)) ||
    Boolean(profile?.is_approved && isProductFlowAdmin(profile))
  )
}
