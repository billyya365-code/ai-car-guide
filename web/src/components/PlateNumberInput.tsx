import { useRef } from 'react'

// 台灣自小客車車牌最常見格式：前 3 碼英文字母＋後 4 碼數字（例如 RFX-2325）。
// 拆成兩個獨立輸入框（中間固定顯示 "-"）取代原本單一自由輸入框，直接透過
// inputMode/字元過濾限制每個框只能輸入該有的字元類型，比起打完後才驗證格式，
// 使用者當下就知道哪裡打錯，也省去自己輸入分隔號的麻煩。
export interface PlateNumberInputProps {
  letters: string
  digits: string
  onLettersChange: (value: string) => void
  onDigitsChange: (value: string) => void
}

const BOX_STYLE = {
  textAlign: 'center' as const,
  letterSpacing: 2,
  fontWeight: 700,
}

export function PlateNumberInput({ letters, digits, onLettersChange, onDigitsChange }: PlateNumberInputProps) {
  const digitsRef = useRef<HTMLInputElement>(null)

  const handleLettersChange = (raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
    onLettersChange(cleaned)
    // 三碼英文打完自動跳到數字框，使用者不用自己點下一個框
    if (cleaned.length === 3) digitsRef.current?.focus()
  }

  const handleDigitsChange = (raw: string) => {
    onDigitsChange(raw.replace(/[^0-9]/g, '').slice(0, 4))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={3}
        value={letters}
        onChange={(e) => handleLettersChange(e.target.value)}
        placeholder="ABC"
        aria-label="車牌英文字母（3 碼）"
        style={{ ...BOX_STYLE, width: 76 }}
      />
      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>-</span>
      <input
        ref={digitsRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={digits}
        onChange={(e) => handleDigitsChange(e.target.value)}
        placeholder="1234"
        aria-label="車牌數字（4 碼）"
        style={{ ...BOX_STYLE, width: 84 }}
      />
    </div>
  )
}
