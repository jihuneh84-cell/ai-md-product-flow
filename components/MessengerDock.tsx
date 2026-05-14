'use client'

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Profile = {
  id: string
  email?: string | null
  name?: string | null
  role?: string | null
  position?: string | null
  is_approved?: boolean | null
}

type MessengerAttachment = {
  id: string
  name: string
  size: number
  path: string
  expires_at: string
}

type MessengerMessage = {
  id: string
  channel: string
  body: string
  user_id: string
  recipient_id?: string | null
  attachment?: MessengerAttachment | null
  user_name?: string | null
  user_email?: string | null
  created_at?: string | null
}

const MESSENGER_FILE_BUCKET = 'messenger-files'
const ATTACHMENT_LIFETIME_MS = 24 * 60 * 60 * 1000
const EMOTICONS = [
  '확인했습니다 😊',
  '감사합니다 🙏',
  '처리 중입니다 🔧',
  '완료했습니다 ✅',
  '좋아요 🙌',
  '잠시 확인할게요 👀',
]

const displayName = (profile?: Profile | null) => profile?.name || profile?.email || '사용자'
const isAttachmentActive = (attachment?: MessengerAttachment | null) =>
  Boolean(attachment?.expires_at && new Date(attachment.expires_at).getTime() > Date.now())
const safeFileExtension = (name: string) => name.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0].toLowerCase() || ''
const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`
  if (size >= 1024) return `${Math.round(size / 1024)}KB`
  return `${size}B`
}

export default function MessengerDock() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [messages, setMessages] = useState<MessengerMessage[]>([])
  const [recipientId, setRecipientId] = useState('')
  const [body, setBody] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const recipients = profiles.filter((item) => item.id !== profile?.id)
  const activeRecipient = recipients.find((item) => item.id === recipientId) || null
  const roomLabel = activeRecipient ? `${displayName(activeRecipient)}님` : '전체 채널'

  const visibleMessages = useMemo(() => {
    if (!profile?.id) return []

    if (recipientId) {
      return messages.filter(
        (message) =>
          message.channel === '개인' &&
          ((message.user_id === profile.id && message.recipient_id === recipientId) ||
            (message.user_id === recipientId && message.recipient_id === profile.id))
      )
    }

    return messages.filter((message) => message.channel === '전체' && !message.recipient_id)
  }, [messages, profile, recipientId])

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data } = await supabase
      .from('profiles')
      .select('id,email,name,role,position,is_approved')
      .eq('id', user.id)
      .maybeSingle()

    if (data?.is_approved !== false) setProfile((data || { id: user.id, email: user.email }) as Profile)
  }

  async function cleanupExpiredOwnAttachments(sourceMessages: MessengerMessage[]) {
    if (!profile?.id) return

    const expiredOwnMessages = sourceMessages.filter(
      (message) => message.user_id === profile.id && message.attachment && !isAttachmentActive(message.attachment)
    )

    if (!expiredOwnMessages.length) return

    await Promise.all(
      expiredOwnMessages.map(async (message) => {
        const attachment = message.attachment as MessengerAttachment
        await supabase.storage.from(MESSENGER_FILE_BUCKET).remove([attachment.path])
        await supabase.from('messenger_messages').update({ attachment: null }).eq('id', message.id)
      })
    )
  }

  async function loadMessenger() {
    if (!profile?.id) return

    const [profileResult, messageResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id,email,name,role,position,is_approved')
        .eq('is_approved', true)
        .order('name', { ascending: true }),
      supabase
        .from('messenger_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    if (messageResult.error) {
      setError('메신저 DB 테이블이 준비되지 않았습니다. Supabase SQL 실행 여부를 확인해 주세요.')
      return
    }

    const nextMessages = (messageResult.data || []) as MessengerMessage[]
    setProfiles((profileResult.data || []) as Profile[])
    setMessages(nextMessages)
    cleanupExpiredOwnAttachments(nextMessages)
    setError('')
    setLoaded(true)
  }

  const openDock = () => {
    setIsOpen(true)
    if (!loaded) loadMessenger()
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile()
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (profile?.id) loadMessenger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id || !isOpen) return

    const refreshTimer = window.setInterval(loadMessenger, 10000)
    const channel = supabase
      .channel(`product-flow-messenger-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messenger_messages' }, loadMessenger)
      .subscribe()

    return () => {
      window.clearInterval(refreshTimer)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isOpen])

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!profile?.id) return

    const text = body.trim()
    if (!text && !pendingFile) return

    setSending(true)
    let attachment: MessengerAttachment | null = null

    if (pendingFile) {
      const id = crypto.randomUUID()
      // eslint-disable-next-line react-hooks/purity
      const path = `${profile.id}/${Date.now()}-${id}${safeFileExtension(pendingFile.name)}`
      const { error: uploadError } = await supabase.storage.from(MESSENGER_FILE_BUCKET).upload(path, pendingFile, {
        cacheControl: '86400',
        upsert: false,
      })

      if (uploadError) {
        setError(`파일 첨부 실패: ${uploadError.message}`)
        setSending(false)
        return
      }

      attachment = {
        id,
        name: pendingFile.name,
        size: pendingFile.size,
        path,
        // eslint-disable-next-line react-hooks/purity
        expires_at: new Date(Date.now() + ATTACHMENT_LIFETIME_MS).toISOString(),
      }
    }

    const { data, error: sendError } = await supabase
      .from('messenger_messages')
      .insert({
        channel: recipientId ? '개인' : '전체',
        body: text || '첨부파일을 보냈습니다.',
        user_id: profile.id,
        recipient_id: recipientId || null,
        attachment,
        user_name: displayName(profile),
        user_email: profile.email,
      })
      .select('*')
      .single()

    if (sendError) {
      setError(`메시지 저장 실패: ${sendError.message}`)
      setSending(false)
      return
    }

    const notificationTargets = recipientId ? recipients.filter((item) => item.id === recipientId) : recipients
    if (notificationTargets.length) {
      await supabase.from('notifications').insert(
        notificationTargets.map((item) => ({
          user_id: item.id,
          title: recipientId ? '[OB Messenger] 개인 메시지' : '[OB Messenger] 전체 채널',
          message: `${displayName(profile)}: ${text || attachment?.name || '첨부파일'}`,
          link: '/messenger',
          type: 'messenger_message',
          is_read: false,
        }))
      )
    }

    setMessages((prev) => [data as MessengerMessage, ...prev])
    setBody('')
    setPendingFile(null)
    setSending(false)
  }

  const openAttachment = async (attachment: MessengerAttachment) => {
    if (!isAttachmentActive(attachment)) {
      setError('첨부파일은 전송 후 24시간이 지나 만료되었습니다.')
      return
    }

    const { data, error: openError } = await supabase.storage.from(MESSENGER_FILE_BUCKET).createSignedUrl(attachment.path, 60 * 10)
    if (openError || !data?.signedUrl) {
      setError(openError?.message || '첨부파일을 열 수 없습니다.')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const formatTime = (value?: string | null) =>
    value
      ? new Date(value).toLocaleString('ko-KR', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''

  if (!profile?.id || profile.is_approved === false) return null

  return (
    <div
      className="fixed bottom-5 right-5 z-[90] hidden lg:block"
      onMouseEnter={openDock}
      onMouseLeave={() => {
        if (!isPinned) setIsOpen(false)
      }}
    >
      <button
        type="button"
        onClick={() => {
          setIsPinned((prev) => !prev)
          openDock()
        }}
        className="ml-auto flex h-12 items-center gap-2 rounded-full bg-[#1b1688] px-4 text-xs font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.25)] transition hover:bg-[#110c63]"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15 text-[11px]">OB</span>
        <span>Messenger</span>
      </button>

      <div
        className={`absolute bottom-14 right-0 w-[390px] overflow-hidden rounded-[34px] border-[8px] border-slate-950 bg-slate-950 shadow-[0_28px_80px_rgba(15,23,42,0.35)] transition duration-200 ${
          isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
        }`}
      >
        <div className="mx-auto mt-1 h-5 w-24 rounded-b-2xl bg-slate-950" />
        <div className="flex h-[660px] flex-col overflow-hidden rounded-[26px] bg-[#f4f7fb]">
          <header className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black text-[#1b1688]">ONLINE BUSINESS DIVISION</p>
                <h2 className="text-lg font-black text-slate-950">OB Messenger</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsPinned((prev) => !prev)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-black ${
                    isPinned ? 'bg-[#1b1688] text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isPinned ? '고정됨' : '고정'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPinned(false)
                    setIsOpen(false)
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-sm font-black text-slate-500"
                  aria-label="메신저 내리기"
                  title="메신저 내리기"
                >
                  ˅
                </button>
              </div>
            </div>

            <label className="mt-3 block text-[11px] font-black text-slate-500">받는 사람</label>
            <select
              value={recipientId}
              onChange={(event) => setRecipientId(event.target.value)}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#1b1688]"
            >
              <option value="">전체 채널</option>
              {recipients.map((item) => (
                <option key={item.id} value={item.id}>
                  {displayName(item)}
                </option>
              ))}
            </select>
          </header>

          {error && <div className="m-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{error}</div>}

          <div className="flex min-h-0 flex-1 flex-col-reverse gap-2 overflow-y-auto px-3 py-4">
            {visibleMessages.length ? (
              visibleMessages.slice(0, 50).map((message) => {
                const mine = message.user_id === profile.id
                return (
                  <article
                    key={message.id}
                    className={`max-w-[86%] rounded-2xl px-3 py-2 shadow-sm ${
                      mine ? 'ml-auto bg-[#1b1688] text-white' : 'mr-auto border border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <b className="truncate text-xs">{message.user_name || message.user_email || '사용자'}</b>
                      <span className={`shrink-0 text-[10px] font-bold ${mine ? 'text-white/60' : 'text-slate-400'}`}>{formatTime(message.created_at)}</span>
                    </div>
                    <p className={`mt-1 whitespace-pre-wrap break-words text-xs font-bold leading-5 ${mine ? 'text-white' : 'text-slate-600'}`}>{message.body}</p>
                    {message.attachment && (
                      <div className="mt-2">
                        {isAttachmentActive(message.attachment) ? (
                          <button
                            type="button"
                            onClick={() => openAttachment(message.attachment as MessengerAttachment)}
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                              mine ? 'bg-white/15 text-white' : 'bg-[#eef3ff] text-[#1b1688]'
                            }`}
                          >
                            첨부 · {message.attachment.name} · {formatFileSize(message.attachment.size)}
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold opacity-60">첨부 만료</span>
                        )}
                      </div>
                    )}
                  </article>
                )
              })
            ) : (
              <div className="grid h-full place-items-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 text-center text-xs font-bold leading-5 text-slate-400">
                {loaded ? `${roomLabel}에 아직 메시지가 없습니다.` : '메신저를 불러오는 중입니다.'}
              </div>
            )}
          </div>

          <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {EMOTICONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setBody((prev) => `${prev}${prev ? '\n' : ''}${item}`)}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 hover:bg-[#eef3ff] hover:text-[#1b1688]"
                >
                  {item}
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={`${roomLabel}에 메시지 입력`}
              rows={3}
              className="min-h-20 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-xs font-bold leading-5 text-slate-700 outline-none focus:border-[#1b1688]"
            />
            <div className="mt-2 rounded-xl bg-slate-50 p-2">
              <p className="mb-1 text-[10px] font-bold text-slate-500">첨부파일은 24시간 후 만료됩니다.</p>
              <input
                type="file"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setPendingFile(event.target.files?.[0] || null)}
                className="w-full text-[10px] font-bold text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-[#1b1688] file:px-2 file:py-1.5 file:text-[10px] file:font-black file:text-white"
              />
              {pendingFile && (
                <button type="button" onClick={() => setPendingFile(null)} className="mt-1 text-[10px] font-black text-rose-500">
                  첨부 해제: {pendingFile.name}
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={sending || (!body.trim() && !pendingFile)}
              className="mt-2 h-10 w-full rounded-xl bg-[#1b1688] text-xs font-black text-white hover:bg-[#110c63] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? '전송 중' : '전송'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
