// iRent 常見共享車款——選車流程之後接上真正的車輛查詢/掃描功能時，只需要換掉
// 這份清單（或改成向後端動態拉取），呼叫端不需要跟著改。
export const CAR_MODELS = ['Toyota Corolla Altis', 'Toyota Yaris', 'Toyota Sienta', 'Nissan Kicks', 'Honda Fit'] as const

export type CarModel = (typeof CAR_MODELS)[number]

// 對應 public/car-models/ 底下、已去背並用 CSS drop-shadow 補回陰影的車輛照片
// （來源：golden_photos/car_model/，處理方式跟 car-angles 的四角度照片一致）。
export const CAR_MODEL_IMAGES: Record<CarModel, string> = {
  'Toyota Corolla Altis': 'toyota-corolla-altis.png',
  'Toyota Yaris': 'toyota-yaris.png',
  'Toyota Sienta': 'toyota-sienta.png',
  'Nissan Kicks': 'nissan-kicks.png',
  'Honda Fit': 'honda-fit.png',
}
