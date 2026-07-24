import type { ComponentType } from 'react'
import { AbsoluteFill, Composition, Series, interpolate, useCurrentFrame } from 'remotion'
import { Cover } from './scenes/Cover'
import { InputPlate } from './scenes/InputPlate'
import { AiGuideCapture } from './scenes/AiGuideCapture'
import { UploadAnalysis } from './scenes/UploadAnalysis'
import { ResultReveal } from './scenes/ResultReveal'
import { Calibration } from './scenes/Calibration'
import { CrossFade } from './components/CrossFade'
import { SceneBackground } from './components/SceneBackground'
import { HANDOFF_OVERLAP_FRAMES } from './lib/handoff'

const FPS = 30
const WIDTH = 1920
const HEIGHT = 1080

// 五段各自獨立的 composition（方便單獨檢視/調整），時長依序是：
// 6s（Cover）+10s（InputPlate）+22s（AiGuideCapture）+10s（UploadAnalysis）+10s
// （ResultReveal），扣掉 UploadAnalysis／ResultReveal 交接處重疊的
// HANDOFF_OVERLAP_FRAMES，實際總長見下面 FULL_VIDEO_DURATION。
//
// UploadAnalysis→ResultReveal 這一個交接點不再用 CrossFade 的轉場效果
// （scale/blur 或柔光）模擬銜接感，而是讓兩段時間軸真的重疊
// HANDOFF_OVERLAP_FRAMES（見下面 ResultReveal 的 offset）：UploadAnalysis
// 尾端雲朵原地縮小淡出、ResultReveal 開頭主照片從同一個位置「長出來」，
// 兩個內容動作本身就是轉場，所以這兩邊都不需要 CrossFade 自己的
// fadeOutAtEnd／fadeInAtStart（見下面 forceFadeOut/forceFadeIn 覆寫），
// 交給 UploadAnalysis.tsx／ResultReveal.tsx 內部各自處理淡出/長出的動畫。
const SCENES: {
  id: string
  Component: ComponentType<{ showBackground?: boolean }>
  durationInFrames: number
  offset?: number
  forceFadeIn?: boolean
  forceFadeOut?: boolean
}[] = [
  { id: 'Cover', Component: Cover, durationInFrames: FPS * 6 },
  { id: 'InputPlate', Component: InputPlate, durationInFrames: FPS * 10 },
  { id: 'AiGuideCapture', Component: AiGuideCapture, durationInFrames: FPS * 22 },
  { id: 'UploadAnalysis', Component: UploadAnalysis, durationInFrames: FPS * 10, forceFadeOut: false },
  {
    id: 'ResultReveal',
    Component: ResultReveal,
    durationInFrames: FPS * 10,
    offset: -HANDOFF_OVERLAP_FRAMES,
    forceFadeIn: false,
  },
]

// 場景之間不重疊（offset 都是 0，完全接續播放），每個場景只在「自己」的頭尾
// 轉場（見 CrossFade：opacity＋scale＋motion blur 一起變化，不是單純淡化），
// 這樣不會有兩個不同版面的場景同時疊在畫面上，也比純 opacity 淡化更有運鏡感、
// 不會像投影片逐頁切換。20 幀（0.67 秒）比原本的 15 幀稍微拉長，轉場的推進感
// 才做得出來，太快會來不及感覺到 scale/blur 的變化。
const TRANSITION_FRAMES = 20
// 每個場景的 offset（預設 0）會讓它比「接續前一段」的位置提早開始，重疊的部分
// 要從總長度扣掉，不然結尾會多出一段空白。
const FULL_VIDEO_DURATION = SCENES.reduce((sum, s) => sum + s.durationInFrames + (s.offset ?? 0), 0)

// 整支影片最後淡到全黑收尾——背景本身（SceneBackground）是持續整支影片播放、
// 不會自己停下來的漂浮光斑，單靠最後一個場景（ResultReveal）自己淡出並不會讓
// 畫面變成真正的全黑，所以另外疊一層純黑蓋在最上面，只在結尾這 1 秒淡入到
// opacity 1，把背景跟前景一起蓋黑。
const END_FADE_FRAMES = 30

// SceneBackground 只在這裡掛一次、蓋住整支影片的全長，而不是讓每個場景各自
// 掛一份——這樣背景的漂浮動畫是用整支影片的 frame/duration 算的，會連續不間斷
// 地慢慢飄，場景切換時完全沒有感覺，也不會被 CrossFade 的淡出/淡入影響到
// （每個場景元件都傳 showBackground={false}，不再各自畫自己的背景）。
const FullVideo = () => {
  const frame = useCurrentFrame()
  // 用 FULL_VIDEO_DURATION - 1（最後一個真正會被算繪的幀）當終點，opacity 才會
  // 在最後一幀剛好等於 1（純黑）；如果終點用 FULL_VIDEO_DURATION 本身，最後一幀
  // 只會淡到 29/30，還留一點點沒完全變黑。
  const endFadeOpacity = interpolate(frame, [FULL_VIDEO_DURATION - END_FADE_FRAMES, FULL_VIDEO_DURATION - 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <AbsoluteFill>
      <SceneBackground />
      <Series>
        {SCENES.map(({ id, Component, durationInFrames, offset, forceFadeIn, forceFadeOut }, i) => (
          <Series.Sequence key={id} durationInFrames={durationInFrames} offset={offset}>
            <CrossFade
              durationInFrames={durationInFrames}
              transitionFrames={TRANSITION_FRAMES}
              fadeInAtStart={forceFadeIn ?? i !== 0}
              fadeOutAtEnd={forceFadeOut ?? i !== SCENES.length - 1}
            >
              <Component showBackground={false} />
            </CrossFade>
          </Series.Sequence>
        ))}
      </Series>
      <AbsoluteFill style={{ background: '#000', opacity: endFadeOpacity, pointerEvents: 'none' }} />
    </AbsoluteFill>
  )
}

export const RemotionRoot = () => {
  return (
    <>
      {/* 整支影片串接後的完整版本：Cover → InputPlate → AiGuideCapture →
          UploadAnalysis → ResultReveal，場景交接處都是交叉淡化。 */}
      <Composition
        id="FullVideo"
        component={FullVideo}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={FULL_VIDEO_DURATION}
      />

      {/* 以下維持個別獨立的 composition，方便單獨檢視/調整某一頁而不用每次
          都從頭播整支影片。 */}
      <Composition
        id="Cover"
        component={Cover}
        durationInFrames={FPS * 6}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="InputPlate"
        component={InputPlate}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="AiGuideCapture"
        component={AiGuideCapture}
        durationInFrames={FPS * 22}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="UploadAnalysis"
        component={UploadAnalysis}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="ResultReveal"
        component={ResultReveal}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="Calibration"
        component={Calibration}
        durationInFrames={1}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  )
}
