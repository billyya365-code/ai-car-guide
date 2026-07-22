import { AbsoluteFill, Img, staticFile } from 'remotion'
import { FONT_FAMILY, WEIGHT } from '../theme'
import { CROP_SIDE, CROP_ZOOM, LABELS, POSITIONS } from '../lib/carAngles'

// 座標校正工具（不是正式影片的一部分，純粹拿來讀格線座標用）：跟 AiGuideCapture 用
// 同一份 CROP_SIDE/CROP_ZOOM 設定裁出一樣的畫面，疊上每 10% 一條的格線＋數字。
// 不畫目前的車輪/車牌框——使用者自己在畫面上標記想要的位置，直接讓 AI 讀格線座標即可。
const CELL_SIZE = 390
const GRID_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

function GridLines() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {GRID_STEPS.map((p) => (
        <div
          key={`v${p}`}
          style={{
            position: 'absolute',
            left: `${p}%`,
            top: 0,
            bottom: 0,
            width: 1,
            background: p === 0 || p === 100 ? 'rgba(255,90,90,0.8)' : 'rgba(255,255,255,0.28)',
          }}
        />
      ))}
      {GRID_STEPS.map((p) => (
        <div
          key={`h${p}`}
          style={{
            position: 'absolute',
            top: `${p}%`,
            left: 0,
            right: 0,
            height: 1,
            background: p === 0 || p === 100 ? 'rgba(255,90,90,0.8)' : 'rgba(255,255,255,0.28)',
          }}
        />
      ))}
    </div>
  )
}

function AxisLabels() {
  return (
    <>
      {GRID_STEPS.map((p) => (
        <div
          key={`xl${p}`}
          style={{
            position: 'absolute',
            left: `${p}%`,
            top: -16,
            transform: 'translateX(-50%)',
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#ffd166',
          }}
        >
          {p}
        </div>
      ))}
      {GRID_STEPS.map((p) => (
        <div
          key={`yl${p}`}
          style={{
            position: 'absolute',
            top: `${p}%`,
            left: -26,
            transform: 'translateY(-50%)',
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#ffd166',
          }}
        >
          {p}
        </div>
      ))}
    </>
  )
}

export const Calibration = () => {
  return (
    <AbsoluteFill style={{ background: '#0a0d10', alignItems: 'center', padding: '20px 60px', overflow: 'auto' }}>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: WEIGHT.subtitle,
          fontSize: 20,
          color: '#fff',
          textAlign: 'center',
        }}
      >
        座標校正工具：格線每 10%。
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          columnGap: 90,
          rowGap: 30,
          marginTop: 30,
        }}
      >
        {POSITIONS.map((pos) => {
          const cropStyle = CROP_SIDE[pos] === 'left' ? { left: 0 } : { right: 0 }

          return (
            <div key={pos} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  fontFamily: FONT_FAMILY,
                  fontWeight: WEIGHT.subtitle,
                  fontSize: 15,
                  color: '#fff',
                  marginBottom: 20,
                }}
              >
                {LABELS[pos]}（{pos}）
              </div>
              <div style={{ position: 'relative', width: CELL_SIZE, height: CELL_SIZE }}>
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}>
                  <Img
                    src={staticFile(`car-angles/${pos}.png`)}
                    style={{
                      position: 'absolute',
                      top: '50%',
                      ...cropStyle,
                      width: CELL_SIZE * CROP_ZOOM,
                      height: 'auto',
                      transform: 'translateY(-50%)',
                    }}
                  />
                </div>

                <GridLines />
                <AxisLabels />
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
