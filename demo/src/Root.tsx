import type { ComponentType } from 'react'
import { AbsoluteFill, Composition, Series, interpolate, useCurrentFrame } from 'remotion'
import { Cover } from './scenes/Cover'
import { InputPlate } from './scenes/InputPlate'
import { AiGuideCapture } from './scenes/AiGuideCapture'
import { UploadAnalysis } from './scenes/UploadAnalysis'
import { ResultReveal } from './scenes/ResultReveal'
import { Calibration } from './scenes/Calibration'
import { PhoneWelcome } from './scenes/PhoneWelcome'
import { PhoneCapture } from './scenes/PhoneCapture'
import { PhoneConfirm } from './scenes/PhoneConfirm'
import { PhoneUpload } from './scenes/PhoneUpload'
import { PhoneResult } from './scenes/PhoneResult'
import { CrossFade } from './components/CrossFade'
import { SceneBackground } from './components/SceneBackground'
import { HANDOFF_OVERLAP_FRAMES } from './lib/handoff'

const FPS = 30
const WIDTH = 1920
const HEIGHT = 1080

const TRANSITION_FRAMES = 20
const END_FADE_FRAMES = 30

interface SceneConfig {
  id: string
  Component: ComponentType<{ showBackground?: boolean }>
  durationInFrames: number
  offset?: number
  forceFadeIn?: boolean
  forceFadeOut?: boolean
}

// 把「一串場景串成一支完整影片」的邏輯抽成共用 factory——第一支影片
// （SCENES）跟第二支影片（SCENES_V2）都是同一套組裝方式：SceneBackground
// 只在最外層掛一次（背景漂浮動畫連續不間斷、不受場景切換影響）、Series+
// CrossFade 依序接續播放（預設每段頭尾各自 push 轉場）、結尾淡到全黑收尾。
// 不要兩支影片各自複製一份幾乎一樣的組裝程式碼。
function buildFullVideo(scenes: SceneConfig[]) {
  const durationInFrames = scenes.reduce((sum, s) => sum + s.durationInFrames + (s.offset ?? 0), 0)

  const Component = () => {
    const frame = useCurrentFrame()
    // 用 durationInFrames - 1（最後一個真正會被算繪的幀）當終點，opacity 才會
    // 在最後一幀剛好等於 1（純黑）；如果終點用 durationInFrames 本身，最後一幀
    // 只會淡到 29/30，還留一點點沒完全變黑。
    const endFadeOpacity = interpolate(frame, [durationInFrames - END_FADE_FRAMES, durationInFrames - 1], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })

    return (
      <AbsoluteFill>
        <SceneBackground />
        <Series>
          {scenes.map(({ id, Component: Scene, durationInFrames: sceneDuration, offset, forceFadeIn, forceFadeOut }, i) => (
            <Series.Sequence key={id} durationInFrames={sceneDuration} offset={offset}>
              <CrossFade
                durationInFrames={sceneDuration}
                transitionFrames={TRANSITION_FRAMES}
                fadeInAtStart={forceFadeIn ?? i !== 0}
                fadeOutAtEnd={forceFadeOut ?? i !== scenes.length - 1}
              >
                <Scene showBackground={false} />
              </CrossFade>
            </Series.Sequence>
          ))}
        </Series>
        <AbsoluteFill style={{ background: '#000', opacity: endFadeOpacity, pointerEvents: 'none' }} />
      </AbsoluteFill>
    )
  }

  return { Component, durationInFrames }
}

// 第一支影片：五段各自獨立的 composition（方便單獨檢視/調整），時長依序是：
// 6s（Cover）+10s（InputPlate）+22s（AiGuideCapture）+10s（UploadAnalysis）+10s
// （ResultReveal），扣掉 UploadAnalysis／ResultReveal 交接處重疊的
// HANDOFF_OVERLAP_FRAMES，實際總長見 FullVideo.durationInFrames。
//
// UploadAnalysis→ResultReveal 這一個交接點不用 CrossFade 的轉場效果
// （scale/blur）模擬銜接感，而是讓兩段時間軸真的重疊 HANDOFF_OVERLAP_FRAMES
// （見下面 ResultReveal 的 offset）：UploadAnalysis 尾端雲朵原地縮小淡出、
// ResultReveal 開頭主照片從同一個位置「長出來」，兩個內容動作本身就是轉場，
// 所以這兩邊都不需要 CrossFade 自己的 fadeOutAtEnd／fadeInAtStart（見下面
// forceFadeOut/forceFadeIn 覆寫），交給 UploadAnalysis.tsx／ResultReveal.tsx
// 內部各自處理淡出/長出的動畫。
const SCENES: SceneConfig[] = [
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

// 第二支影片：橫式畫布中央放手機外殼，忠實還原真實 App 畫面（亮色主題），
// 涵蓋首頁輸入→AI 引導拍攝→確認照片→上傳/分析→檢測結果。Cover 沿用第一支
// 影片同一張品牌標題卡當開場，不用另外做一張。這幾個交接點先用預設的 push
// 轉場（不做像第一支影片 Page4/5 那種時間軸重疊合併，範圍先收斂）。
const SCENES_V2: SceneConfig[] = [
  { id: 'Cover2', Component: Cover, durationInFrames: FPS * 6 },
  { id: 'PhoneWelcome', Component: PhoneWelcome, durationInFrames: FPS * 10 },
  { id: 'PhoneCapture', Component: PhoneCapture, durationInFrames: FPS * 18 },
  { id: 'PhoneConfirm', Component: PhoneConfirm, durationInFrames: FPS * 8 },
  { id: 'PhoneUpload', Component: PhoneUpload, durationInFrames: FPS * 8 },
  { id: 'PhoneResult', Component: PhoneResult, durationInFrames: FPS * 10 },
]

const { Component: FullVideo, durationInFrames: FULL_VIDEO_DURATION } = buildFullVideo(SCENES)
const { Component: PhoneWalkthrough, durationInFrames: PHONE_WALKTHROUGH_DURATION } = buildFullVideo(SCENES_V2)

export const RemotionRoot = () => {
  return (
    <>
      {/* 第一支影片串接後的完整版本：Cover → InputPlate → AiGuideCapture →
          UploadAnalysis → ResultReveal。 */}
      <Composition
        id="FullVideo"
        component={FullVideo}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={FULL_VIDEO_DURATION}
      />

      {/* 第二支影片串接後的完整版本：Cover → PhoneWelcome → PhoneCapture →
          PhoneConfirm → PhoneUpload → PhoneResult（直式手機模擬畫面）。 */}
      <Composition
        id="PhoneWalkthrough"
        component={PhoneWalkthrough}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={PHONE_WALKTHROUGH_DURATION}
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
        id="PhoneWelcome"
        component={PhoneWelcome}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="PhoneCapture"
        component={PhoneCapture}
        durationInFrames={FPS * 18}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="PhoneConfirm"
        component={PhoneConfirm}
        durationInFrames={FPS * 8}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="PhoneUpload"
        component={PhoneUpload}
        durationInFrames={FPS * 8}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="PhoneResult"
        component={PhoneResult}
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
