import { Composition } from 'remotion'
import { Cover } from './scenes/Cover'
import { InputPlate } from './scenes/InputPlate'
import { AiGuideCapture } from './scenes/AiGuideCapture'
import { Calibration } from './scenes/Calibration'

const FPS = 30
const WIDTH = 1920
const HEIGHT = 1080

export const RemotionRoot = () => {
  return (
    <>
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
