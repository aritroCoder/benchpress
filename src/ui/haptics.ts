// navigator.vibrate: real on Android Chrome, silently absent on iOS Safari.
// Haptics fire ONLY on data changes, never navigation.
const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator

export const haptics = {
  /** rep adjust */
  tick(): void {
    if (canVibrate) navigator.vibrate(8)
  },
  /** set committed */
  commit(): void {
    if (canVibrate) navigator.vibrate([12, 40, 14])
  },
  /** progression earned this session */
  progress(): void {
    if (canVibrate) navigator.vibrate([18, 50, 18, 50, 26])
  },
}
