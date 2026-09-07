import type { ComponentType } from 'react'
import { AbsoluteFill, Audio, Composition, Series, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { Cover } from './scenes/Cover'
import { InputPlate } from './scenes/InputPlate'
import { AiGuideCapture } from './scenes/AiGuideCapture'
import { AiGuideCaptureReal } from './scenes/AiGuideCaptureReal'
import { UploadAnalysis } from './scenes/UploadAnalysis'
import { ResultReveal } from './scenes/ResultReveal'
import { ResultRevealReal } from './scenes/ResultRevealReal'
import { DashboardReview } from './scenes/DashboardReview'
import { DashboardReviewReal } from './scenes/DashboardReviewReal'
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
// 音樂淡出比畫面淡黑的窗口長很多（3 秒 vs 1 秒），畫面淡黑本來就設計成快速
// 收尾，但音量如果用同一個窄窗口淡出，1 秒內從滿音量降到 0 聽起來還是像
// 「突然」變小聲、不夠漸進，所以音量另外用自己的、更長的淡出時間。
const AUDIO_FADE_FRAMES = 90

interface SceneConfig {
  id: string
  Component: ComponentType<{ showBackground?: boolean }>
  durationInFrames: number
  offset?: number
  forceFadeIn?: boolean
  forceFadeOut?: boolean
  // 這個場景自己「進場」/「退場」轉場各自要用幾幀，不填就用預設的
  // TRANSITION_FRAMES。分開兩個欄位是為了能只加快某一個場景交接點的其中一邊
  // （例如只讓 AiGuideCapture 的退場變快，不影響它自己進場的速度）。
  introFrames?: number
  outroFrames?: number
}

// 把「一串場景串成一支完整影片」的邏輯抽成共用 factory——第一支影片
// （SCENES）跟第二支影片（SCENES_V2）都是同一套組裝方式：SceneBackground
// 只在最外層掛一次（背景漂浮動畫連續不間斷、不受場景切換影響）、Series+
// CrossFade 依序接續播放（預設每段頭尾各自 push 轉場）、結尾淡到全黑收尾。
// 不要兩支影片各自複製一份幾乎一樣的組裝程式碼。
function buildFullVideo(scenes: SceneConfig[], options?: { audioSrc?: string }) {
  const durationInFrames = scenes.reduce((sum, s) => sum + s.durationInFrames + (s.offset ?? 0), 0)
  const audioSrc = options?.audioSrc

  const Component = () => {
    const frame = useCurrentFrame()
    // 用 durationInFrames - 1（最後一個真正會被算繪的幀）當終點，opacity 才會
    // 在最後一幀剛好等於 1（純黑）；如果終點用 durationInFrames 本身，最後一幀
    // 只會淡到 29/30，還留一點點沒完全變黑。
    const endFadeOpacity = interpolate(frame, [durationInFrames - END_FADE_FRAMES, durationInFrames - 1], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    // 配樂原始長度比影片長，直接讓 Remotion 播到影片結束就切斷的話，音樂會在
    // 一句樂句中間硬生生消音，很突兀。用結尾前 AUDIO_FADE_FRAMES 這段較長的
    // 窗口把音量慢慢淡到 0，跟畫面淡黑同時抵達全黑/靜音，但音量下降的過程本身
    // 拉得比畫面淡黑更長，聽起來才是漸漸變小聲，不是最後一秒才驟降。
    const audioVolume = interpolate(frame, [durationInFrames - AUDIO_FADE_FRAMES, durationInFrames - 1], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })

    return (
      <AbsoluteFill>
        {audioSrc && <Audio src={staticFile(audioSrc)} volume={audioVolume} />}
        <SceneBackground />
        <Series>
          {scenes.map(
            ({ id, Component: Scene, durationInFrames: sceneDuration, offset, forceFadeIn, forceFadeOut, introFrames, outroFrames }, i) => (
              <Series.Sequence key={id} durationInFrames={sceneDuration} offset={offset}>
                <CrossFade
                  durationInFrames={sceneDuration}
                  introFrames={introFrames ?? TRANSITION_FRAMES}
                  outroFrames={outroFrames ?? TRANSITION_FRAMES}
                  fadeInAtStart={forceFadeIn ?? i !== 0}
                  fadeOutAtEnd={forceFadeOut ?? i !== scenes.length - 1}
                >
                  <Scene showBackground={false} />
                </CrossFade>
              </Series.Sequence>
            ),
          )}
        </Series>
        <AbsoluteFill style={{ background: '#000', opacity: endFadeOpacity, pointerEvents: 'none' }} />
      </AbsoluteFill>
    )
  }

  return { Component, durationInFrames }
}

// 第一支影片：六段各自獨立的 composition（方便單獨檢視/調整），時長依序是：
// 5.5s（Cover）+10s（InputPlate）+AI 引導拍攝那一段+10s（UploadAnalysis）+10s
// （ResultReveal）+13.5s（DashboardReview），扣掉 UploadAnalysis／ResultReveal 交接處
// 重疊的 HANDOFF_OVERLAP_FRAMES，實際總長見 FULL_VIDEO_1/2_DURATION。
//
// UploadAnalysis→ResultReveal 這一個交接點不用 CrossFade 的轉場效果
// （scale/blur）模擬銜接感，而是讓兩段時間軸真的重疊 HANDOFF_OVERLAP_FRAMES
// （見下面 ResultReveal 的 offset）：UploadAnalysis 尾端雲朵原地縮小淡出、
// ResultReveal 開頭主照片從同一個位置「長出來」，兩個內容動作本身就是轉場，
// 所以這兩邊都不需要 CrossFade 自己的 fadeOutAtEnd／fadeInAtStart（見下面
// forceFadeOut/forceFadeIn 覆寫），交給 UploadAnalysis.tsx／ResultReveal.tsx
// 內部各自處理淡出/長出的動畫。
//
// FullVideo1／FullVideo2 只差在三個位置各自要用哪個版本的組件（CGI 去背 vs. 實拍，
// 比照 AiGuideCapture／AiGuideCaptureReal 的模式：兩個版本是完全獨立的檔案，不是
// 同一個組件靠 prop 切換），所以「AI 引導拍攝」「辨識結果輸出」「後台審核」這三段
// 都當參數傳進來，其餘 3 段（Cover/InputPlate/UploadAnalysis）完全共用同一份設定，
// 不要兩支影片各自複製一份幾乎一樣的陣列。
function buildScenes(aiGuideScene: SceneConfig, resultScene: SceneConfig, dashboardScene: SceneConfig): SceneConfig[] {
  return [
    // 開場少留 0.5 秒（15 frame）。
    { id: 'Cover', Component: Cover, durationInFrames: FPS * 6 - 15 },
    { id: 'InputPlate', Component: InputPlate, durationInFrames: FPS * 10 },
    aiGuideScene,
    { id: 'UploadAnalysis', Component: UploadAnalysis, durationInFrames: FPS * 10, forceFadeOut: false },
    resultScene,
    // 片尾淡黑前多留 0.5 秒（15 frame）的停頓。
    dashboardScene,
  ]
}

// CGI 去背車版（21.5 秒）跟實拍版（657 frame，時長沿用它自己 standalone
// composition 調好的節奏，不是 AiGuideCapture 那組時間常數）。
const SCENES_CGI = buildScenes(
  { id: 'AiGuideCapture', Component: AiGuideCapture, durationInFrames: FPS * 22 - 15 },
  { id: 'ResultReveal', Component: ResultReveal, durationInFrames: FPS * 10, offset: -HANDOFF_OVERLAP_FRAMES, forceFadeIn: false },
  { id: 'DashboardReview', Component: DashboardReview, durationInFrames: FPS * 13 + 15 },
)
const SCENES_REAL = buildScenes(
  { id: 'AiGuideCaptureReal', Component: AiGuideCaptureReal, durationInFrames: 657 },
  { id: 'ResultRevealReal', Component: ResultRevealReal, durationInFrames: FPS * 10, offset: -HANDOFF_OVERLAP_FRAMES, forceFadeIn: false },
  { id: 'DashboardReviewReal', Component: DashboardReviewReal, durationInFrames: FPS * 13 + 15 },
)

// 第二支影片：橫式畫布中央放手機外殼，忠實還原真實 App 畫面（亮色主題），
// 涵蓋首頁輸入→AI 引導拍攝→確認照片→上傳/分析→檢測結果。Cover 沿用第一支
// 影片同一張品牌標題卡當開場，不用另外做一張。這幾個交接點先用預設的 push
// 轉場（不做像第一支影片 Page4/5 那種時間軸重疊合併，範圍先收斂）。
//
// PhoneWelcome 比其他場景多了開場的「畫面載入中」動畫（見該檔案的
// CONTENT_OFFSET 說明），總長多抓 100 幀（100/300ms 級的動畫+使用者能看清楚
// 文字的停留時間），13.3 秒。
const PHONE_WELCOME_DURATION = FPS * 10 + 100

const SCENES_V2: SceneConfig[] = [
  { id: 'Cover2', Component: Cover, durationInFrames: FPS * 6 },
  { id: 'PhoneWelcome', Component: PhoneWelcome, durationInFrames: PHONE_WELCOME_DURATION },
  { id: 'PhoneCapture', Component: PhoneCapture, durationInFrames: FPS * 18 },
  { id: 'PhoneConfirm', Component: PhoneConfirm, durationInFrames: FPS * 8 },
  { id: 'PhoneUpload', Component: PhoneUpload, durationInFrames: FPS * 8 },
  { id: 'PhoneResult', Component: PhoneResult, durationInFrames: FPS * 10 },
]

// cinematic-corporate-extended.wav：原始 mp3（67.56 秒）用 ffmpeg atempo 整首等比
// 拉慢（速度倍率 0.985403，音高不變）延長 1 秒到 68.56 秒，比原本更貼近片尾淡出
// 窗口的長度。輸出成 wav 而不是 mp3——這台機器的 ffmpeg 沒有 libmp3lame，只能用
// mp3_mf 編碼器，寫出來的 mp3 檔頭部 duration 元資料不準（ffprobe 讀出來的長度
// 跟實際解碼長度對不起來），wav 是無損 PCM，時長元資料一定準確，avoid 這個問題。
// 原始 cinematic-corporate.mp3 保留不動，沒有被覆蓋。
const { Component: FullVideo1, durationInFrames: FULL_VIDEO_1_DURATION } = buildFullVideo(SCENES_CGI, {
  audioSrc: 'audio/cinematic-corporate-extended.wav',
})
const { Component: FullVideo2, durationInFrames: FULL_VIDEO_2_DURATION } = buildFullVideo(SCENES_REAL, {
  audioSrc: 'audio/cinematic-corporate-extended.wav',
})
const { Component: PhoneWalkthrough, durationInFrames: PHONE_WALKTHROUGH_DURATION } = buildFullVideo(SCENES_V2)

export const RemotionRoot = () => {
  return (
    <>
      {/* 第一支影片串接後的完整版本，「AI 引導拍攝」「辨識結果輸出」「後台審核」
          這三段各自有去背/實拍兩個完全獨立的組件檔案（見 buildScenes 的說明）：
          FullVideo1＝Cover → InputPlate → AiGuideCapture（CGI 去背車）→
          UploadAnalysis → ResultReveal（CGI 去背版）→ DashboardReview（CGI 去背版）。
          FullVideo2＝Cover → InputPlate → AiGuideCaptureReal（真實螢幕錄影）→
          UploadAnalysis → ResultRevealReal（實拍版）→ DashboardReviewReal（實拍版）。 */}
      <Composition
        id="FullVideo1"
        component={FullVideo1}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={FULL_VIDEO_1_DURATION}
      />
      <Composition
        id="FullVideo2"
        component={FullVideo2}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        durationInFrames={FULL_VIDEO_2_DURATION}
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
        durationInFrames={FPS * 22 - 15}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      {/* AiGuideCapture 的實拍版：素材來自 golden_photos 的真實螢幕錄影（見
          AiGuideCaptureReal.tsx 開頭註解），排版/節奏跟 AiGuideCapture 一致，已經
          接進 FullVideo2（見上面 SCENES_REAL），這裡另外保留獨立 composition
          方便單獨檢視。總長跟 AiGuideCapture 不同，因為每支素材的播放窗
          （SCAN_DURATION）跟每格停留時間（CELL_DURATION）都比照
          AiGuideCaptureReal.tsx 裡的說明調整過。 */}
      <Composition
        id="AiGuideCaptureReal"
        component={AiGuideCaptureReal}
        durationInFrames={657}
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
      {/* ResultReveal 的實拍版：獨立組件檔案（不是同一個組件切 variant），
          搭配 AiGuideCaptureReal／DashboardReviewReal 串進 FullVideo2。 */}
      <Composition
        id="ResultRevealReal"
        component={ResultRevealReal}
        durationInFrames={FPS * 10}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="DashboardReview"
        component={DashboardReview}
        durationInFrames={FPS * 13 + 15}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      {/* DashboardReview 的實拍版：獨立組件檔案，搭配 ResultRevealReal 串進 FullVideo2。 */}
      <Composition
        id="DashboardReviewReal"
        component={DashboardReviewReal}
        durationInFrames={FPS * 13 + 15}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="PhoneWelcome"
        component={PhoneWelcome}
        durationInFrames={PHONE_WELCOME_DURATION}
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
