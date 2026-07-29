# AuraLunis 1.0.1 Update

## App Store — What’s New

Sky Lens now follows your phone more smoothly with faster, steadier motion and improved frame pacing. Learning Preferences now save reliably, update the Learn tab immediately, and provide meaningful Beginner, Intermediate, and Advanced recommendations. This update also includes stability and accessibility refinements.

## Customer-facing fixes

- Sky Lens responds faster during slow pans, quick turns, and phone tilts.
- Removed competing motion/render loops that caused delayed or choppy movement.
- Learning Preferences waits for a completed save before closing.
- A failed preference save now leaves the sheet open and explains what happened.
- The Learn tab refreshes immediately after a successful save and again when focused.
- Beginner, Intermediate, and Advanced now change category order, recommendations, and the default Deep Sky lesson.
- The first three starter lessons remain free; premium access rules are unchanged.

## Physical iPhone go/no-go test

Run this on the same physical iPhone used for App Store testing. Test a release/production-style build, not Expo Go.

### Learning Preferences

1. Open Settings → Learning Preferences.
2. Choose Beginner and at least one interest; tap Save.
3. Open Learn and confirm the level card says Beginner and beginner recommendations appear first.
4. Repeat for Intermediate and Advanced.
5. For Advanced, confirm Deep Sky opens on Galaxy and advanced lessons appear first.
6. Force-close and reopen AuraLunis; confirm the last saved level and interests remain.
7. Open the editor, change selections, tap Cancel, and confirm the previous saved choices remain.
8. Uncheck every interest and confirm AuraLunis asks for at least one before saving.

### Sky Lens motion

1. Open Sky Lens at 1× zoom.
2. Pan slowly left and right; the sky should follow without visible stepping or a delayed “rubber-band” catch-up.
3. Turn the phone roughly 90° at a normal speed; the sky should follow promptly and settle cleanly.
4. Tilt from horizon to zenith and back.
5. Hold the phone still; the scene should not shimmer or constantly rebuild from tiny sensor noise.
6. Pinch to a high zoom level and confirm the view becomes steadier without feeling frozen.
7. Open and close layer controls, select an object, and confirm taps still work.
8. Leave Sky Lens open for several minutes and confirm the phone does not become unusually hot.

### Release smoke test

- Free starter lessons open normally.
- Premium lessons still open the existing paywall for a non-entitled tester.
- Monthly, annual, lifetime, and Restore Purchases behavior is unchanged.
- No new permission prompt appears on launch.
- Location, motion, notification, privacy, and purchase disclosures remain unchanged.

## Build preparation

- Marketing version: `1.0.1`
- iOS build number: EAS production `autoIncrement` should create the next build after build 6.
- Bundle ID: `com.ocoeestudios.auralunis`
- App Store Connect app ID: `6784049770`
- Production profile: `production`

Before submission, run the repository’s full audit and complete the physical-iPhone checklist above. Do not submit the update if Sky Lens still shows delayed catch-up, severe stepping, overheating, or a preference selection fails to persist after relaunch.
