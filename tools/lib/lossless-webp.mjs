// 무손실 WebP 인코더 — 보이는 RGBA 가 한 바이트라도 달라지면 던진다.
//
// tools/build-extreme-art.mjs 가 extreme 아트 666장을 구울 때 쓰던 encodeRuntime() 을
// 그대로 꺼내 온 것이다. 그 666장은 이미 런타임에서 정상 동작하므로 이 경로는 실측으로
// 검증돼 있다.
//
// 왜 이 검사가 필요한가: STORE.md 가 "손실 변환은 승인 아트를 재검수하지 않고 쓰지 않는다"
// 를 규칙으로 못 박았다. 픽셀 단위 대조로 무손실임을 기계적으로 증명하면 재검수가 필요 없다.
// 완전 투명한 픽셀(alpha 0)의 RGB 는 화면에 영향이 없으므로 달라도 통과시킨다.
import sharp from 'sharp';
import { createHash } from 'node:crypto';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * PNG 버퍼를 무손실 WebP 로 인코딩한다.
 * WebP 가 원본보다 크면 PNG 를 그대로 쓴다 (작은 스프라이트에서 실제로 일어난다).
 * @returns {Promise<{bytes: Buffer, extension: '.webp'|'.png', record: object}>}
 */
export async function encodeLossless(png, label, { effort = 6 } = {}) {
  const webp = await sharp(png).webp({ lossless: true, effort }).toBuffer();

  const a = await sharp(png).ensureAlpha().raw().toBuffer();
  const b = await sharp(webp).ensureAlpha().raw().toBuffer();
  if (a.length !== b.length) throw new Error(label + ': lossless decoded size changed');

  let hiddenRGBDifferences = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    // i % 4 === 3 은 alpha 그 자체 — 절대 달라지면 안 된다.
    // 그 외에는 해당 픽셀의 alpha 가 0 일 때만(= 화면에 안 보임) 허용한다.
    if (i % 4 === 3 || a[i - (i % 4) + 3] !== 0) throw new Error(label + ': lossless encoder changed visible RGBA');
    hiddenRGBDifferences++;
  }

  const useWebP = webp.length < png.length;
  return {
    bytes: useWebP ? webp : png,
    extension: useWebP ? '.webp' : '.png',
    record: {
      label,
      pngBytes: png.length,
      encodedBytes: useWebP ? webp.length : png.length,
      pngSha256: sha256(png),
      encoding: useWebP ? 'lossless-webp' : 'png',
      visibleRGBADifferences: 0,
      hiddenRGBDifferences,
    },
  };
}
