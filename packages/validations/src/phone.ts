import { isValidPhoneNumber } from 'libphonenumber-js'

export function isValidPhone(val: string) {
  if (!val) return false
  try {
    return isValidPhoneNumber(val)
  } catch {
    return false
  }
}
