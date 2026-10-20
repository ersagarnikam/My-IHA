export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to read image dimensions'))
    }
    img.src = url
  })
}

// Passport photos are conventionally 35mm x 45mm (width:height ≈ 0.778).
// A ±10% tolerance accommodates typical phone-camera crops.
const PASSPORT_PHOTO_RATIO = 35 / 45
const PASSPORT_PHOTO_RATIO_TOLERANCE = 0.1

export async function isValidPassportPhotoAspectRatio(file: File): Promise<boolean> {
  const { width, height } = await getImageDimensions(file)
  const ratio = width / height
  const min = PASSPORT_PHOTO_RATIO * (1 - PASSPORT_PHOTO_RATIO_TOLERANCE)
  const max = PASSPORT_PHOTO_RATIO * (1 + PASSPORT_PHOTO_RATIO_TOLERANCE)
  return ratio >= min && ratio <= max
}
